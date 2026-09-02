#!/usr/bin/env python3
"""Build and publish full-fidelity FDIC SOD year partitions.

The extractor is intentionally outside the Worker. It writes Zstandard Parquet
locally, records checksums and source provenance, uploads immutable objects with
Wrangler, and publishes only small rollups/pointers to D1. R2 SQL and Data
Catalog are optional operator tools, never application runtime dependencies.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence


FDIC_SOD_ENDPOINT = "https://api.fdic.gov/banks/sod"
LAYOUT_VERSION = 1
MANIFEST_VERSION = 2
DEFAULT_PAGE_SIZE = 10_000
MAX_SOURCE_PAGE_SIZE = 10_000
PAGINATION_STRATEGY = "split-uninumbr-presence-v1"
DEFAULT_OUTPUT = Path(".data/fdic-sod-lake")
DEFAULT_BUCKET = "bankgraph-exports"
DEFAULT_PREFIX = "lake/fdic/sod/v1"
USER_AGENT = "Bankgraph-SOD-lake/1 (+https://github.com/)"


class LakeError(RuntimeError):
    pass


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def bundle(self) -> Path:
        return self.root / "bundle.json"

    @property
    def catalog_hint(self) -> Path:
        return self.root / "catalog-hint.json"

    def year_dir(self, year: int) -> Path:
        return self.root / f"year={year}"

    def data(self, year: int) -> Path:
        return self.year_dir(year) / "data.parquet"

    def manifest(self, year: int) -> Path:
        return self.year_dir(year) / "manifest.json"

    def aggregates(self, year: int) -> Path:
        return self.year_dir(year) / "aggregates.json"


@dataclass(frozen=True)
class SourceAudit:
    reported_total: int
    non_null_uninumbr_total: int
    null_uninumbr_total: int
    index_name: str
    index_created_at: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def official_row(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict) or not isinstance(item.get("data"), dict):
        raise LakeError("FDIC returned a row without a data object")
    return item["data"]


def request_json(url: str, retries: int = 5) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(retries):
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                if response.status != 200:
                    raise LakeError(f"FDIC returned HTTP {response.status}")
                payload = json.load(response)
                if not isinstance(payload, dict):
                    raise LakeError("FDIC returned a non-object response")
                return payload
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, LakeError) as error:
            last_error = error
            status = error.code if isinstance(error, urllib.error.HTTPError) else None
            if status is not None and status != 429 and status < 500:
                break
            if attempt + 1 < retries:
                time.sleep(min(8.0, 0.5 * (2**attempt)))
    raise LakeError(f"FDIC request failed: {last_error}")


def encoded_source_url(parameters: dict[str, Any]) -> str:
    query = urllib.parse.urlencode(parameters)
    return f"{FDIC_SOD_ENDPOINT}?{query}"


def source_query(year: int) -> dict[str, Any]:
    return {
        "strategy": PAGINATION_STRATEGY,
        "count": {
            "filters": f"YEAR:{year}",
            "fields": "ID,YEAR,UNINUMBR",
            "sort_by": "YEAR",
            "sort_order": "ASC",
            "limit": 1,
            "offset": 0,
        },
        "non_null_uninumbr": {
            "filters": f"YEAR:{year} AND UNINUMBR:[1 TO *]",
            "sort_by": "UNINUMBR",
            "sort_order": "ASC",
            "pagination": "offset",
        },
        "null_uninumbr": {
            "filters": f"YEAR:{year} AND NOT UNINUMBR:*",
            "sort_by": "YEAR",
            "sort_order": "ASC",
            "limit": MAX_SOURCE_PAGE_SIZE,
            "offset": 0,
        },
    }


def discover_latest_year() -> int:
    query = urllib.parse.urlencode({
        "fields": "YEAR",
        "sort_by": "YEAR",
        "sort_order": "DESC",
        "limit": "1",
        "offset": "0",
    })
    payload = request_json(f"{FDIC_SOD_ENDPOINT}?{query}")
    rows = payload.get("data")
    if not isinstance(rows, list) or not rows:
        raise LakeError("FDIC did not return a latest SOD year")
    year = int(official_row(rows[0]).get("YEAR"))
    if year < 1994 or year > datetime.now(timezone.utc).year + 1:
        raise LakeError(f"FDIC returned an implausible latest SOD year: {year}")
    return year


def response_total(payload: dict[str, Any], year: int) -> int:
    totals = payload.get("totals")
    total = totals.get("count") if isinstance(totals, dict) else None
    meta = payload.get("meta")
    meta_total = meta.get("total") if isinstance(meta, dict) else None
    if not isinstance(total, int) or total < 0 or meta_total != total:
        raise LakeError(f"FDIC did not report a consistent total for {year}")
    return total


def response_index(payload: dict[str, Any], year: int) -> tuple[str, str]:
    meta = payload.get("meta")
    index = meta.get("index") if isinstance(meta, dict) else None
    name = index.get("name") if isinstance(index, dict) else None
    created_at = index.get("createTimestamp") if isinstance(index, dict) else None
    if not isinstance(name, str) or not name or not isinstance(created_at, str) or not created_at:
        raise LakeError(f"FDIC did not identify the source index for {year}")
    return name, created_at


def response_records(
    payload: dict[str, Any],
    year: int,
    expected_filter: str,
    expected_limit: int,
    expected_offset: int,
    expected_index: tuple[str, str] | None,
) -> tuple[list[dict[str, Any]], int, tuple[str, str]]:
    meta = payload.get("meta")
    parameters = meta.get("parameters") if isinstance(meta, dict) else None
    if not isinstance(parameters, dict) or any(
        str(parameters.get(name)) != str(value)
        for name, value in {
            "filters": expected_filter,
            "limit": expected_limit,
            "offset": expected_offset,
        }.items()
    ):
        raise LakeError(f"FDIC did not echo the requested {year} page boundary")
    index = response_index(payload, year)
    if expected_index is not None and index != expected_index:
        raise LakeError(f"FDIC source index changed during {year} extraction")
    total = response_total(payload, year)
    items = payload.get("data")
    if not isinstance(items, list):
        raise LakeError(f"FDIC did not return a data array for {year}")
    return [official_row(item) for item in items], total, index


def required_integer(value: Any, field: str) -> int:
    if isinstance(value, bool) or value is None or value == "":
        raise LakeError(f"FDIC returned an SOD row without a valid {field}")
    try:
        parsed = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise LakeError(f"FDIC returned an SOD row without a valid {field}") from error
    if isinstance(value, float) and not value.is_integer():
        raise LakeError(f"FDIC returned an SOD row without a valid {field}")
    return parsed


def validate_partition_record(record: dict[str, Any], year: int, has_uninumbr: bool) -> None:
    if required_integer(record.get("YEAR"), "YEAR") != year:
        raise LakeError(f"A row escaped the {year} partition")
    record_identifier(record)
    raw_uninumbr = record.get("UNINUMBR")
    if has_uninumbr:
        required_integer(raw_uninumbr, "UNINUMBR")
    elif raw_uninumbr is not None and raw_uninumbr != "":
        raise LakeError(f"FDIC returned a non-null UNINUMBR in the null slice for {year}")


def fetch_year(year: int, page_size: int) -> tuple[list[dict[str, Any]], SourceAudit]:
    query = source_query(year)
    count_query = query["count"]
    count_payload = request_json(encoded_source_url(count_query))
    count_rows, source_total, source_index = response_records(
        count_payload,
        year,
        count_query["filters"],
        count_query["limit"],
        count_query["offset"],
        None,
    )
    if source_total <= 0 or len(count_rows) != 1:
        raise LakeError(f"FDIC returned an empty or inconsistent source count for {year}")

    records: list[dict[str, Any]] = []
    non_null_query = query["non_null_uninumbr"]
    non_null_total: int | None = None
    offset = 0
    previous_uninumbr: int | None = None
    while non_null_total is None or offset < non_null_total:
        parameters = {
            key: value for key, value in non_null_query.items() if key != "pagination"
        }
        parameters.update({"limit": page_size, "offset": offset})
        payload = request_json(encoded_source_url(parameters))
        page, page_total, _ = response_records(
            payload,
            year,
            non_null_query["filters"],
            page_size,
            offset,
            source_index,
        )
        if non_null_total is None:
            non_null_total = page_total
        elif page_total != non_null_total:
            raise LakeError(f"FDIC non-null UNINUMBR total changed during {year}")
        expected_page_rows = min(page_size, non_null_total - offset)
        if len(page) != expected_page_rows:
            raise LakeError(f"FDIC returned an incomplete non-null UNINUMBR page for {year}")
        for record in page:
            validate_partition_record(record, year, True)
            uninumbr = required_integer(record.get("UNINUMBR"), "UNINUMBR")
            if previous_uninumbr is not None and uninumbr <= previous_uninumbr:
                raise LakeError(f"FDIC UNINUMBR ordering is not unique and increasing for {year}")
            previous_uninumbr = uninumbr
        records.extend(page)
        offset += len(page)

    null_query = query["null_uninumbr"]
    null_payload = request_json(encoded_source_url(null_query))
    null_page, null_total, _ = response_records(
        null_payload,
        year,
        null_query["filters"],
        null_query["limit"],
        null_query["offset"],
        source_index,
    )
    if null_total > MAX_SOURCE_PAGE_SIZE:
        raise LakeError(
            f"FDIC {year} null-UNINUMBR slice has {null_total} rows, above the "
            f"one-page deterministic limit of {MAX_SOURCE_PAGE_SIZE}"
        )
    if len(null_page) != null_total:
        raise LakeError(f"FDIC returned an incomplete null-UNINUMBR slice for {year}")
    for record in null_page:
        validate_partition_record(record, year, False)
    records.extend(null_page)

    non_null_total = non_null_total or 0
    if non_null_total + null_total != source_total or len(records) != source_total:
        raise LakeError(f"FDIC presence slices did not reconcile to the source total for {year}")
    records.sort(key=record_sort_key)
    keys = [record_key(record) for record in records]
    if len(set(keys)) != len(keys):
        raise LakeError(f"FDIC returned duplicate SOD natural keys for {year}")
    return records, SourceAudit(
        reported_total=source_total,
        non_null_uninumbr_total=non_null_total,
        null_uninumbr_total=null_total,
        index_name=source_index[0],
        index_created_at=source_index[1],
    )


def number(value: Any) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def record_identifier(record: dict[str, Any]) -> str:
    identifier = str(record.get("ID") or "").strip()
    if not identifier:
        raise LakeError("FDIC returned an SOD row without its unique ID")
    return identifier


def record_key(record: dict[str, Any]) -> str:
    return f"{required_integer(record.get('YEAR'), 'YEAR'):04d}|{record_identifier(record)}"


def record_sort_key(record: dict[str, Any]) -> tuple[str]:
    return (record_identifier(record),)


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def county_fips(record: dict[str, Any]) -> str:
    raw = text(record.get("CNTYNUMB"))
    digits = "".join(character for character in raw if character.isdigit())
    return digits[-5:].zfill(5) if digits else "00000"


def aggregate_records(records: Sequence[dict[str, Any]], year: int) -> dict[str, list[dict[str, Any]]]:
    state_rows: dict[str, dict[str, Any]] = {}
    county_rows: dict[tuple[str, str], dict[str, Any]] = {}
    bank_rows: dict[int, dict[str, Any]] = {}
    state_banks: defaultdict[str, set[int]] = defaultdict(set)
    county_banks: defaultdict[tuple[str, str], set[int]] = defaultdict(set)
    bank_states: defaultdict[int, set[str]] = defaultdict(set)
    bank_counties: defaultdict[int, set[str]] = defaultdict(set)

    for record in records:
        state = text(record.get("STALPBR")).upper() or "NA"
        fips = county_fips(record)
        cert = number(record.get("CERT"))
        deposits = number(record.get("DEPSUMBR"))

        state_row = state_rows.setdefault(state, {
            "year": year, "state": state, "branch_count": 0, "bank_count": 0, "total_deposits": 0
        })
        state_row["branch_count"] += 1
        state_row["total_deposits"] += deposits
        state_banks[state].add(cert)

        county_key = (state, fips)
        county_row = county_rows.setdefault(county_key, {
            "year": year,
            "state": state,
            "county_fips": fips,
            "county_name": text(record.get("CNTYNAMB")) or None,
            "branch_count": 0,
            "bank_count": 0,
            "total_deposits": 0,
        })
        county_row["branch_count"] += 1
        county_row["total_deposits"] += deposits
        county_banks[county_key].add(cert)

        bank_row = bank_rows.setdefault(cert, {
            "year": year,
            "cert": cert,
            "branch_count": 0,
            "main_office_count": 0,
            "state_count": 0,
            "county_count": 0,
            "total_deposits": 0,
        })
        bank_row["branch_count"] += 1
        bank_row["main_office_count"] += 1 if number(record.get("BRNUM")) == 0 else 0
        bank_row["total_deposits"] += deposits
        bank_states[cert].add(state)
        bank_counties[cert].add(fips)

    for state, row in state_rows.items():
        row["bank_count"] = len(state_banks[state])
    for key, row in county_rows.items():
        row["bank_count"] = len(county_banks[key])
    for cert, row in bank_rows.items():
        row["state_count"] = len(bank_states[cert])
        row["county_count"] = len(bank_counties[cert])

    return {
        "state": sorted(state_rows.values(), key=lambda row: row["state"]),
        "county": sorted(county_rows.values(), key=lambda row: (row["state"], row["county_fips"])),
        "bank": sorted(bank_rows.values(), key=lambda row: row["cert"]),
    }


def load_pyarrow() -> tuple[Any, Any]:
    try:
        import pyarrow as pa
        import pyarrow.parquet as parquet
    except ModuleNotFoundError as error:
        raise LakeError(
            "PyArrow is required for extraction. Install scripts/requirements-lakehouse.txt first."
        ) from error
    return pa, parquet


def arrow_array(pa: Any, values: list[Any]) -> Any:
    try:
        return pa.array(values)
    except (pa.ArrowInvalid, pa.ArrowTypeError, TypeError):
        normalized = [
            None if value is None else canonical_json(value) if isinstance(value, (dict, list)) else str(value)
            for value in values
        ]
        return pa.array(normalized, type=pa.string())


def write_parquet(records: Sequence[dict[str, Any]], destination: Path) -> tuple[list[dict[str, str]], str, str]:
    pa, parquet = load_pyarrow()
    official_fields = sorted({field for record in records for field in record})
    columns = {
        field: arrow_array(pa, [record.get(field) for record in records])
        for field in official_fields
    }
    columns["_raw_json"] = pa.array([canonical_json(record) for record in records], type=pa.string())
    table = pa.table(columns)
    schema = [{"name": field.name, "type": str(field.type), "nullable": field.nullable} for field in table.schema]
    schema_fingerprint = hashlib.sha256(canonical_json(schema).encode("utf-8")).hexdigest()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    parquet.write_table(
        table,
        temporary,
        compression="zstd",
        compression_level=9,
        use_dictionary=True,
        write_statistics=True,
        row_group_size=64 * 1024,
        data_page_version="2.0",
    )
    os.replace(temporary, destination)
    return schema, schema_fingerprint, pa.__version__


def object_keys(year: int, checksum: str, prefix: str = DEFAULT_PREFIX) -> dict[str, str]:
    return {
        "data": f"{prefix}/data/year={year}/sod-{year}-{checksum}.parquet",
        "manifest": f"{prefix}/metadata/manifests/year={year}/{checksum}.json",
        "pointer": f"{prefix}/metadata/current/year={year}.json",
        "catalog_hint": f"{prefix}/metadata/catalog-hint.json",
    }


def extract_partition(paths: Paths, year: int, latest_year: int, page_size: int, force: bool) -> dict[str, Any]:
    manifest_path = paths.manifest(year)
    if manifest_path.exists() and not force:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        validate_local_partition(paths, manifest)
        print(f"{year}: verified existing {manifest['row_count']:,}-row partition")
        return manifest

    retrieved_at = utc_now()
    records, source_audit = fetch_year(year, page_size)
    schema, schema_fingerprint, pyarrow_version = write_parquet(records, paths.data(year))
    checksum = sha256_file(paths.data(year))
    keys = object_keys(year, checksum)
    aggregates = aggregate_records(records, year)
    atomic_json(paths.aggregates(year), aggregates)
    key_first = record_key(records[0]) if records else None
    key_last = record_key(records[-1]) if records else None
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "dataset": "fdic_sod",
        "partition": {"field": "YEAR", "transform": "identity", "value": year},
        "layout_version": LAYOUT_VERSION,
        "source": {
            "publisher": "Federal Deposit Insurance Corporation",
            "endpoint": FDIC_SOD_ENDPOINT,
            "query": source_query(year),
            "retrieved_at": retrieved_at,
            "reported_total": source_audit.reported_total,
            "slice_totals": {
                "non_null_uninumbr": source_audit.non_null_uninumbr_total,
                "null_uninumbr": source_audit.null_uninumbr_total,
            },
            "index": {
                "name": source_audit.index_name,
                "created_at": source_audit.index_created_at,
            },
        },
        "row_count": len(records),
        "key": {"fields": ["YEAR", "ID"], "first": key_first, "last": key_last},
        "schema": schema,
        "schema_fingerprint": schema_fingerprint,
        "format": {"name": "parquet", "compression": "zstd", "pyarrow_version": pyarrow_version},
        "object": {
            "key": keys["data"],
            "sha256": checksum,
            "bytes": paths.data(year).stat().st_size,
            "content_type": "application/vnd.apache.parquet",
        },
        "manifest_object_key": keys["manifest"],
        "current_pointer_key": keys["pointer"],
        "is_current_snapshot": year == latest_year,
        "catalog": {
            "required": False,
            "namespace": "fdic",
            "table": "sod",
            "format": "apache-iceberg",
            "import_mode": "add_files",
            "note": "This JSON is a catalog hint, not Iceberg table metadata.",
        },
    }
    atomic_json(manifest_path, manifest)
    validate_local_partition(paths, manifest)
    print(f"{year}: wrote {len(records):,} rows, {manifest['object']['bytes']:,} bytes, sha256 {checksum}")
    return manifest


def validate_manifest_shape(manifest: dict[str, Any]) -> None:
    if manifest.get("manifest_version") != MANIFEST_VERSION or manifest.get("dataset") != "fdic_sod":
        raise LakeError("Unsupported lake manifest")
    partition = manifest.get("partition")
    if not isinstance(partition, dict) or not isinstance(partition.get("value"), int):
        raise LakeError("Manifest is missing its year partition")
    object_meta = manifest.get("object")
    if not isinstance(object_meta, dict):
        raise LakeError("Manifest is missing object metadata")
    checksum = object_meta.get("sha256")
    if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
        raise LakeError("Manifest has an invalid SHA-256 checksum")
    if manifest.get("row_count") != manifest.get("source", {}).get("reported_total"):
        raise LakeError("Manifest row count does not match the FDIC source total")
    source = manifest.get("source")
    slices = source.get("slice_totals") if isinstance(source, dict) else None
    query = source.get("query") if isinstance(source, dict) else None
    source_index = source.get("index") if isinstance(source, dict) else None
    if not isinstance(query, dict) or query.get("strategy") != PAGINATION_STRATEGY:
        raise LakeError("Manifest does not record the deterministic source pagination strategy")
    if (
        not isinstance(source_index, dict)
        or not isinstance(source_index.get("name"), str)
        or not source_index["name"]
        or not isinstance(source_index.get("created_at"), str)
        or not source_index["created_at"]
    ):
        raise LakeError("Manifest does not record the FDIC source index identity")
    if not isinstance(slices, dict) or any(
        not isinstance(slices.get(name), int) or slices[name] < 0
        for name in ("non_null_uninumbr", "null_uninumbr")
    ):
        raise LakeError("Manifest is missing its source slice totals")
    if slices["non_null_uninumbr"] + slices["null_uninumbr"] != manifest["row_count"]:
        raise LakeError("Manifest source slices do not match its row count")
    key = manifest.get("key")
    if not isinstance(key, dict) or key.get("fields") != ["YEAR", "ID"]:
        raise LakeError("Manifest does not use the YEAR and ID storage key")


def validate_local_partition(paths: Paths, manifest: dict[str, Any]) -> None:
    validate_manifest_shape(manifest)
    year = int(manifest["partition"]["value"])
    data_path = paths.data(year)
    aggregates_path = paths.aggregates(year)
    if not data_path.is_file() or not aggregates_path.is_file():
        raise LakeError(f"Local files are incomplete for {year}")
    if data_path.stat().st_size != manifest["object"]["bytes"]:
        raise LakeError(f"Parquet byte length changed for {year}")
    if sha256_file(data_path) != manifest["object"]["sha256"]:
        raise LakeError(f"Parquet checksum changed for {year}")


def catalog_hint(manifests: Sequence[dict[str, Any]]) -> dict[str, Any]:
    schema_fingerprints = sorted({manifest["schema_fingerprint"] for manifest in manifests})
    return {
        "catalog_hint_version": 1,
        "dataset": "fdic_sod",
        "namespace": "fdic",
        "table": "sod",
        "data_format": "parquet",
        "layout": "hive",
        "partition_spec": [{"source": "YEAR", "transform": "identity", "name": "year"}],
        "schema_fingerprints": schema_fingerprints,
        "iceberg": {
            "enabled": False,
            "portable_import": "Create a table with an Iceberg REST catalog, then add these Parquet files.",
            "metadata_present": False,
        },
        "runtime": {
            "serving_database": "D1",
            "r2_sql_required": False,
            "worker_control_plane_calls": False,
        },
    }


def write_bundle(paths: Paths, manifests: Sequence[dict[str, Any]]) -> None:
    ordered = sorted(manifests, key=lambda manifest: manifest["partition"]["value"])
    atomic_json(paths.catalog_hint, catalog_hint(ordered))
    atomic_json(paths.bundle, {
        "bundle_version": 1,
        "dataset": "fdic_sod",
        "layout_version": LAYOUT_VERSION,
        "generated_at": utc_now(),
        "partitions": [
            {
                "year": manifest["partition"]["value"],
                "manifest": str(paths.manifest(manifest["partition"]["value"]).relative_to(paths.root)),
                "object_key": manifest["object"]["key"],
                "sha256": manifest["object"]["sha256"],
                "rows": manifest["row_count"],
            }
            for manifest in ordered
        ],
    })


def load_manifests(paths: Paths, years: Sequence[int] | None = None) -> list[dict[str, Any]]:
    selected = set(years or [])
    manifests: list[dict[str, Any]] = []
    for path in sorted(paths.root.glob("year=*/manifest.json")):
        manifest = json.loads(path.read_text(encoding="utf-8"))
        validate_manifest_shape(manifest)
        year = int(manifest["partition"]["value"])
        if selected and year not in selected:
            continue
        validate_local_partition(paths, manifest)
        manifests.append(manifest)
    if not manifests:
        raise LakeError("No matching local SOD partitions; run extract first")
    if selected != {manifest["partition"]["value"] for manifest in manifests} and selected:
        missing = sorted(selected - {manifest["partition"]["value"] for manifest in manifests})
        raise LakeError(f"Missing local partitions: {', '.join(map(str, missing))}")
    return manifests


def executable_command(command: Sequence[str]) -> list[str]:
    resolved = list(command)
    if os.name == "nt" and resolved and resolved[0].lower() == "npx":
        executable = shutil.which("npx.cmd") or shutil.which("npx")
        if executable is None:
            raise LakeError("Could not find the npx launcher required to run Wrangler")
        resolved[0] = executable
    return resolved


def run(command: Sequence[str], cwd: Path) -> None:
    print("+", " ".join(command))
    subprocess.run(executable_command(command), cwd=cwd, check=True)


def run_json(command: Sequence[str], cwd: Path) -> Any:
    print("+", " ".join(command))
    completed = subprocess.run(
        executable_command(command), cwd=cwd, check=True, capture_output=True, text=True
    )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise LakeError("Wrangler did not return JSON") from error


def upload_file(
    repo: Path,
    bucket: str,
    key: str,
    file: Path,
    content_type: str,
    target: str,
    cache_control: str = "public, max-age=31536000, immutable",
) -> None:
    command = [
        "npx", "wrangler", "r2", "object", "put", f"{bucket}/{key}",
        "--file", str(file.resolve()),
        "--content-type", content_type,
        "--cache-control", cache_control,
        f"--{target}",
    ]
    if target == "remote":
        command.append("--force")
    run(command, repo)


def upload(paths: Paths, manifests: Sequence[dict[str, Any]], repo: Path, bucket: str, target: str) -> None:
    for manifest in manifests:
        year = int(manifest["partition"]["value"])
        upload_file(repo, bucket, manifest["object"]["key"], paths.data(year), "application/vnd.apache.parquet", target)
        upload_file(repo, bucket, manifest["manifest_object_key"], paths.manifest(year), "application/json", target)
        # The year pointer is the same audited manifest at a stable discovery key.
        upload_file(
            repo, bucket, manifest["current_pointer_key"], paths.manifest(year),
            "application/json", target, "no-cache"
        )
    hint_key = f"{DEFAULT_PREFIX}/metadata/catalog-hint.json"
    upload_file(repo, bucket, hint_key, paths.catalog_hint, "application/json", target, "no-cache")


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_rows(table: str, columns: Sequence[str], rows: Sequence[dict[str, Any]], batch_size: int = 100) -> list[str]:
    statements: list[str] = []
    for start in range(0, len(rows), batch_size):
        group = rows[start:start + batch_size]
        values = ",\n  ".join(
            "(" + ", ".join(sql_literal(row.get(column)) for column in columns) + ")"
            for row in group
        )
        statements.append(
            f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n  {values}\n"
            f"ON CONFLICT DO NOTHING;"
        )
    return statements


def publication_sql(paths: Paths, manifests: Sequence[dict[str, Any]]) -> str:
    statements = [
        "-- Generated by scripts/fdic_sod_lake.py. Review before applying.",
        "-- Aggregate revisions land before the active R2 pointer changes.",
        "UPDATE release_control SET state = 'refreshing', pending_release = NULL, "
        "pending_generation = NULL, pending_run_id = NULL, updated_at = CURRENT_TIMESTAMP "
        "WHERE singleton = 1;",
    ]
    for manifest in sorted(manifests, key=lambda item: item["partition"]["value"]):
        year = int(manifest["partition"]["value"])
        checksum = manifest["object"]["sha256"]
        aggregates = json.loads(paths.aggregates(year).read_text(encoding="utf-8"))
        for level, table, columns in [
            ("state", "sod_state_year", ["year", "state", "branch_count", "bank_count", "total_deposits", "source_sha256"]),
            ("county", "sod_county_year", ["year", "state", "county_fips", "county_name", "branch_count", "bank_count", "total_deposits", "source_sha256"]),
            ("bank", "sod_bank_year", ["year", "cert", "branch_count", "main_office_count", "state_count", "county_count", "total_deposits", "source_sha256"]),
        ]:
            rows = [{**row, "source_sha256": checksum} for row in aggregates[level]]
            statements.extend(insert_rows(table, columns, rows))

        if manifest["is_current_snapshot"]:
            statements.append("UPDATE fdic_lake_partitions SET is_current_snapshot = 0 WHERE dataset = 'sod';")
        source = manifest["source"]
        schema = manifest["schema"]
        partition_values = {
            "dataset": "sod",
            "partition_key": str(year),
            "layout_version": manifest["layout_version"],
            "object_key": manifest["object"]["key"],
            "manifest_key": manifest["manifest_object_key"],
            "object_sha256": checksum,
            "source_endpoint": source["endpoint"],
            "source_query_json": canonical_json(source["query"]),
            "source_total": source["reported_total"],
            "row_count": manifest["row_count"],
            "compressed_bytes": manifest["object"]["bytes"],
            "field_count": len(schema),
            "key_first": manifest["key"]["first"],
            "key_last": manifest["key"]["last"],
            "retrieved_at": source["retrieved_at"],
            "published_at": utc_now(),
            "is_current_snapshot": manifest["is_current_snapshot"],
        }
        columns = list(partition_values)
        update = ", ".join(
            f"{column}=excluded.{column}" for column in columns if column not in {"dataset", "partition_key"}
        )
        statements.append(
            f"INSERT INTO fdic_lake_partitions ({', '.join(columns)}) VALUES "
            f"({', '.join(sql_literal(partition_values[column]) for column in columns)}) "
            f"ON CONFLICT(dataset, partition_key) DO UPDATE SET {update};"
        )
        for table in ["sod_state_year", "sod_county_year", "sod_bank_year"]:
            statements.append(
                f"DELETE FROM {table} WHERE year = {year} AND source_sha256 <> {sql_literal(checksum)};"
            )
    return "\n\n".join(statements) + "\n"


def publish(paths: Paths, manifests: Sequence[dict[str, Any]], repo: Path, database: str, target: str) -> None:
    assert_maintenance_gate(repo, database, target)
    publish_dir = paths.root / "publish"
    publish_dir.mkdir(parents=True, exist_ok=True)
    sql_path = publish_dir / "sod-lake.sql"
    temporary = sql_path.with_suffix(".sql.part")
    temporary.write_text(publication_sql(paths, manifests), encoding="utf-8")
    os.replace(temporary, sql_path)
    run([
        "npx", "wrangler", "d1", "execute", database,
        "--file", str(sql_path.resolve()),
        f"--{target}",
    ], repo)


def result_rows(payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for item in payload:
            rows.extend(result_rows(item))
    elif isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            rows.extend(row for row in results if isinstance(row, dict))
        result = payload.get("result")
        if result is not None:
            rows.extend(result_rows(result))
    return rows


def prune_batch_sql(batch_size: int) -> str:
    return (
        "UPDATE release_control SET state = 'refreshing', pending_release = NULL, "
        "pending_generation = NULL, pending_run_id = NULL, updated_at = CURRENT_TIMESTAMP "
        "WHERE singleton = 1; "
        "DELETE FROM sod WHERE (year, source_run_id, uninumbr) IN ("
        "SELECT year, source_run_id, uninumbr FROM sod WHERE year <> ("
        "SELECT CAST(partition_key AS INTEGER) FROM fdic_lake_partitions "
        "WHERE dataset = 'sod' AND is_current_snapshot = 1"
        f") ORDER BY year, source_run_id, uninumbr LIMIT {batch_size}); "
        "SELECT changes() AS changes;"
    )


def wrangler_d1_json(repo: Path, database: str, target: str, command: str) -> Any:
    return run_json([
        "npx", "wrangler", "d1", "execute", database,
        "--command", command,
        f"--{target}",
        "--json",
    ], repo)


def assert_maintenance_gate(repo: Path, database: str, target: str) -> str:
    rows = result_rows(wrangler_d1_json(
        repo,
        database,
        target,
        "SELECT state FROM release_control WHERE singleton = 1;",
    ))
    if len(rows) != 1 or rows[0].get("state") not in {"unpublished", "refreshing"}:
        state = rows[0].get("state") if len(rows) == 1 else "missing"
        raise LakeError(
            f"Release gate is {state}; run the bounded sod --latest stage to close it before direct D1 maintenance"
        )
    return str(rows[0]["state"])


def prune_hot_snapshot(repo: Path, database: str, target: str, batch_size: int, max_batches: int) -> None:
    assert_maintenance_gate(repo, database, target)
    audit_sql = (
        "SELECT lake.partition_key AS year, publication.row_count AS expected, "
        "COUNT(s.uninumbr) AS actual FROM fdic_lake_partitions AS lake "
        "JOIN fdic_dataset_publications AS publication ON publication.dataset = 'sod' "
        "AND publication.partition_key = lake.partition_key "
        "LEFT JOIN sod AS s ON s.year = CAST(lake.partition_key AS INTEGER) "
        "AND s.source_run_id = publication.run_id "
        "WHERE lake.dataset = 'sod' AND lake.is_current_snapshot = 1 "
        "GROUP BY lake.partition_key, publication.row_count;"
    )
    audit_rows = result_rows(wrangler_d1_json(repo, database, target, audit_sql))
    if len(audit_rows) != 1:
        raise LakeError("Current lake partition and hot SOD publication do not agree; publish sod --latest first")
    audit = audit_rows[0]
    if number(audit.get("expected")) <= 0 or number(audit.get("actual")) != number(audit.get("expected")):
        raise LakeError(
            f"Current hot SOD row count is {audit.get('actual')}; expected {audit.get('expected')}. Refusing to prune."
        )

    for batch in range(max_batches):
        rows = result_rows(wrangler_d1_json(repo, database, target, prune_batch_sql(batch_size)))
        changes = next((number(row.get("changes")) for row in reversed(rows) if "changes" in row), None)
        if changes is None:
            raise LakeError("Wrangler did not report the SOD prune count")
        print(f"prune batch {batch + 1}: removed {changes:,} historical branch rows")
        if changes == 0:
            cleanup_sql = (
                "DELETE FROM fdic_dataset_publications WHERE dataset = 'sod' "
                "AND partition_key <> (SELECT partition_key FROM fdic_lake_partitions "
                "WHERE dataset = 'sod' AND is_current_snapshot = 1);"
            )
            wrangler_d1_json(repo, database, target, cleanup_sql)
            return
    raise LakeError(f"SOD prune is incomplete after {max_batches} batches; rerun the same command")


def selected_years(args: argparse.Namespace, latest: int | None = None) -> list[int]:
    if getattr(args, "latest_only", False):
        if getattr(args, "year", None):
            raise LakeError("--latest-only cannot be combined with --year")
        years = [latest if latest is not None else discover_latest_year()]
    elif getattr(args, "year", None):
        years = sorted(set(args.year))
    else:
        start = args.from_year
        end_raw = args.to_year
        end = (latest if latest is not None else discover_latest_year()) if end_raw == "latest" else int(end_raw)
        years = list(range(start, end + 1))
    current_limit = datetime.now(timezone.utc).year + 1
    if not years or years[0] < 1994 or years[-1] > current_limit:
        raise LakeError(f"SOD years must be between 1994 and {current_limit}")
    return years


def target(args: argparse.Namespace) -> str:
    if args.local == args.remote:
        raise LakeError("Choose exactly one of --local or --remote")
    return "local" if args.local else "remote"


def parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    common.add_argument("--year", type=int, action="append", help="Select one year; repeat for more")

    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    extract = commands.add_parser("extract", parents=[common], help="Fetch FDIC years and write Parquet")
    extract.add_argument("--from", dest="from_year", type=int, default=1994)
    extract.add_argument("--to", dest="to_year", default="latest", help="Final year or latest")
    extract.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    extract.add_argument("--latest-only", action="store_true", help="Extract only the newest source year")
    extract.add_argument("--force", action="store_true", help="Replace a verified local partition")

    verify = commands.add_parser("verify", parents=[common], help="Recompute local checksums")

    for name, help_text in [
        ("upload", "Upload Parquet and manifests with Wrangler"),
        ("publish", "Publish D1 rollups and pointers"),
        ("prune-hot", "Remove non-current branch rows from D1 in bounded batches"),
    ]:
        command = commands.add_parser(name, parents=[common], help=help_text)
        scope = command.add_mutually_exclusive_group(required=True)
        scope.add_argument("--local", action="store_true")
        scope.add_argument("--remote", action="store_true")
        if name == "upload":
            command.add_argument("--bucket", default=DEFAULT_BUCKET)
        elif name == "publish":
            command.add_argument("--database", default="DB")
        else:
            command.add_argument("--database", default="DB")
            command.add_argument("--batch-size", type=int, default=5_000)
            command.add_argument("--max-batches", type=int, default=1_000)
    return root


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    paths = Paths(args.output.resolve())
    repo = Path(__file__).resolve().parents[1]
    if args.command == "extract":
        if args.page_size < 100 or args.page_size > 10_000:
            raise LakeError("--page-size must be between 100 and 10000")
        latest = discover_latest_year()
        years = selected_years(args, latest)
        if years[-1] > latest:
            raise LakeError(f"Requested year is newer than the latest FDIC SOD year ({latest})")
        manifests = [
            extract_partition(paths, year, latest, args.page_size, args.force)
            for year in years
        ]
        all_manifests = load_manifests(paths)
        write_bundle(paths, all_manifests)
        print(f"Bundle covers {len(all_manifests)} local partition(s); this run handled {len(manifests)}.")
        return 0

    years = args.year or None
    if args.command == "prune-hot":
        if args.year:
            raise LakeError("prune-hot does not accept --year")
        if args.batch_size < 100 or args.batch_size > 10_000:
            raise LakeError("--batch-size must be between 100 and 10000")
        if args.max_batches < 1 or args.max_batches > 10_000:
            raise LakeError("--max-batches must be between 1 and 10000")
        prune_hot_snapshot(repo, args.database, target(args), args.batch_size, args.max_batches)
        return 0

    manifests = load_manifests(paths, years)
    write_bundle(paths, load_manifests(paths))
    if args.command == "verify":
        for manifest in manifests:
            print(f"{manifest['partition']['value']}: {manifest['object']['sha256']} verified")
        return 0
    selected_target = target(args)
    if args.command == "upload":
        upload(paths, manifests, repo, args.bucket, selected_target)
    elif args.command == "publish":
        publish(paths, manifests, repo, args.database, selected_target)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (LakeError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
