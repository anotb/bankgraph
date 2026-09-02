import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse


MODULE_PATH = Path(__file__).resolve().parents[1] / "fdic_sod_lake.py"
SPEC = importlib.util.spec_from_file_location("fdic_sod_lake", MODULE_PATH)
lake = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = lake
SPEC.loader.exec_module(lake)


class SodLakeTests(unittest.TestCase):
    @staticmethod
    def source_payload(records, total, filters, limit, offset, index="sod-index-1"):
        return {
            "meta": {
                "total": total,
                "parameters": {
                    "filters": filters,
                    "limit": str(limit),
                    "offset": str(offset),
                },
                "index": {"name": index, "createTimestamp": "2026-08-14T12:35:11Z"},
            },
            "data": [{"data": record} for record in records],
            "totals": {"count": total},
        }

    def test_source_strategy_uses_supported_sort_and_year_id_storage_key(self):
        query = lake.source_query(1994)
        self.assertEqual(query["strategy"], lake.PAGINATION_STRATEGY)
        self.assertEqual(query["non_null_uninumbr"]["sort_by"], "UNINUMBR")
        self.assertEqual(query["non_null_uninumbr"]["filters"], "YEAR:1994 AND UNINUMBR:[1 TO *]")
        self.assertEqual(query["null_uninumbr"]["filters"], "YEAR:1994 AND NOT UNINUMBR:*")
        self.assertNotIn('"sort_by":"ID"', lake.canonical_json(query))
        first = {"YEAR": 1994, "ID": "1994_10066_3", "UNINUMBR": None}
        second = {"YEAR": 1994, "ID": "1994_1022_6", "UNINUMBR": None}
        self.assertNotEqual(lake.record_key(first), lake.record_key(second))
        with self.assertRaisesRegex(lake.LakeError, "without its unique ID"):
            lake.record_key({"YEAR": 1994, "UNINUMBR": None})

    def test_windows_resolves_the_npx_command_shim_without_using_a_shell(self):
        with patch.object(lake.os, "name", "nt"), patch.object(
            lake.shutil, "which", side_effect=lambda name: r"node\\npx.cmd" if name == "npx.cmd" else None
        ):
            command = lake.executable_command(["npx", "wrangler", "whoami"])
        self.assertEqual(command, [r"node\\npx.cmd", "wrangler", "whoami"])

    def test_fetch_year_reconciles_paginated_present_and_single_missing_slice(self):
        present = [
            {"YEAR": 1994, "ID": "1994_20_0", "UNINUMBR": 1},
            {"YEAR": 1994, "ID": "1994_30_0", "UNINUMBR": 2},
            {"YEAR": 1994, "ID": "1994_40_0", "UNINUMBR": 3},
        ]
        missing = [
            {"YEAR": 1994, "ID": "1994_9_2", "UNINUMBR": None},
            {"YEAR": 1994, "ID": "1994_10_1", "UNINUMBR": None},
        ]

        def fetch(url):
            params = {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}
            filters = params["filters"]
            limit = int(params["limit"])
            offset = int(params["offset"])
            if filters == "YEAR:1994":
                return self.source_payload([present[0]], 5, filters, limit, offset)
            if filters.endswith("UNINUMBR:[1 TO *]"):
                return self.source_payload(present[offset:offset + limit], 3, filters, limit, offset)
            return self.source_payload(missing, 2, filters, limit, offset)

        with patch.object(lake, "request_json", side_effect=fetch):
            records, audit = lake.fetch_year(1994, 2)
        self.assertEqual([row["ID"] for row in records], sorted(row["ID"] for row in present + missing))
        self.assertEqual(audit.reported_total, 5)
        self.assertEqual(audit.non_null_uninumbr_total, 3)
        self.assertEqual(audit.null_uninumbr_total, 2)

    def test_fetch_year_fails_if_source_index_changes_between_pages(self):
        calls = 0

        def fetch(url):
            nonlocal calls
            calls += 1
            params = {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}
            filters = params["filters"]
            limit = int(params["limit"])
            offset = int(params["offset"])
            record = {"YEAR": 1994, "ID": "1994_1_0", "UNINUMBR": 1}
            return self.source_payload(
                [record], 1, filters, limit, offset,
                index="sod-index-2" if calls > 1 else "sod-index-1",
            )

        with patch.object(lake, "request_json", side_effect=fetch):
            with self.assertRaisesRegex(lake.LakeError, "source index changed"):
                lake.fetch_year(1994, 100)

    def test_fetch_year_fails_if_present_sort_key_is_not_unique(self):
        duplicate = [
            {"YEAR": 1994, "ID": "1994_1_0", "UNINUMBR": 1},
            {"YEAR": 1994, "ID": "1994_2_0", "UNINUMBR": 1},
        ]

        def fetch(url):
            params = {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}
            filters = params["filters"]
            limit = int(params["limit"])
            offset = int(params["offset"])
            rows = [duplicate[0]] if filters == "YEAR:1994" else duplicate
            return self.source_payload(rows, 2, filters, limit, offset)

        with patch.object(lake, "request_json", side_effect=fetch):
            with self.assertRaisesRegex(lake.LakeError, "not unique and increasing"):
                lake.fetch_year(1994, 100)

    def test_fetch_year_fails_if_missing_slice_exceeds_one_page(self):
        def fetch(url):
            params = {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}
            filters = params["filters"]
            limit = int(params["limit"])
            offset = int(params["offset"])
            record = {"YEAR": 1994, "ID": "1994_1_0", "UNINUMBR": None}
            if filters == "YEAR:1994":
                return self.source_payload([record], 10_001, filters, limit, offset)
            if filters.endswith("UNINUMBR:[1 TO *]"):
                return self.source_payload([], 0, filters, limit, offset)
            return self.source_payload([], 10_001, filters, limit, offset)

        with patch.object(lake, "request_json", side_effect=fetch):
            with self.assertRaisesRegex(lake.LakeError, "one-page deterministic limit"):
                lake.fetch_year(1994, 100)

    def test_object_keys_are_partitioned_and_content_addressed(self):
        checksum = "a" * 64
        keys = lake.object_keys(2024, checksum)
        self.assertEqual(
            keys["data"],
            "lake/fdic/sod/v1/data/year=2024/sod-2024-" + checksum + ".parquet",
        )
        self.assertIn(checksum, keys["manifest"])

    def test_aggregates_preserve_branch_bank_and_geography_counts(self):
        rows = [
            {"YEAR": 2024, "UNINUMBR": 1, "CERT": 10, "STALPBR": "VA", "CNTYNUMB": 51001, "CNTYNAMB": "Alpha", "DEPSUMBR": 100, "BRNUM": 0},
            {"YEAR": 2024, "UNINUMBR": 2, "CERT": 10, "STALPBR": "VA", "CNTYNUMB": 51003, "CNTYNAMB": "Beta", "DEPSUMBR": 50, "BRNUM": 1},
            {"YEAR": 2024, "UNINUMBR": 3, "CERT": 20, "STALPBR": "VA", "CNTYNUMB": 51001, "CNTYNAMB": "Alpha", "DEPSUMBR": 25, "BRNUM": 0},
        ]
        aggregate = lake.aggregate_records(rows, 2024)
        self.assertEqual(aggregate["state"][0]["branch_count"], 3)
        self.assertEqual(aggregate["state"][0]["bank_count"], 2)
        self.assertEqual(aggregate["state"][0]["total_deposits"], 175)
        bank = next(row for row in aggregate["bank"] if row["cert"] == 10)
        self.assertEqual((bank["branch_count"], bank["county_count"], bank["main_office_count"]), (2, 2, 1))

    def test_manifest_validation_rejects_row_count_drift(self):
        manifest = {
            "manifest_version": lake.MANIFEST_VERSION,
            "dataset": "fdic_sod",
            "partition": {"value": 2024},
            "object": {"sha256": "b" * 64},
            "row_count": 2,
            "source": {
                "reported_total": 3,
                "slice_totals": {"non_null_uninumbr": 2, "null_uninumbr": 0},
                "query": {"strategy": lake.PAGINATION_STRATEGY},
            },
            "key": {"fields": ["YEAR", "ID"]},
        }
        with self.assertRaisesRegex(lake.LakeError, "row count"):
            lake.validate_manifest_shape(manifest)

    def test_publication_changes_pointer_after_revision_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = lake.Paths(Path(directory))
            year = 2024
            checksum = "c" * 64
            paths.year_dir(year).mkdir(parents=True)
            paths.aggregates(year).write_text(json.dumps({
                "state": [{"year": year, "state": "VA", "branch_count": 1, "bank_count": 1, "total_deposits": 10}],
                "county": [{"year": year, "state": "VA", "county_fips": "51001", "county_name": "Alpha", "branch_count": 1, "bank_count": 1, "total_deposits": 10}],
                "bank": [{"year": year, "cert": 10, "branch_count": 1, "main_office_count": 1, "state_count": 1, "county_count": 1, "total_deposits": 10}],
            }))
            manifest = {
                "partition": {"value": year},
                "object": {"sha256": checksum, "key": "data.parquet", "bytes": 100},
                "manifest_object_key": "manifest.json",
                "layout_version": 1,
                "source": {"endpoint": lake.FDIC_SOD_ENDPOINT, "query": {"filters": "YEAR:2024"}, "reported_total": 1, "retrieved_at": "2026-01-01T00:00:00Z"},
                "row_count": 1,
                "schema": [{"name": "YEAR"}],
                "key": {"first": "2024|1", "last": "2024|1"},
                "is_current_snapshot": True,
            }
            sql = lake.publication_sql(paths, [manifest])
            aggregate_position = sql.index("INSERT INTO sod_state_year")
            pointer_position = sql.index("INSERT INTO fdic_lake_partitions")
            self.assertLess(sql.index("state = 'refreshing'"), aggregate_position)
            self.assertLess(aggregate_position, pointer_position)
            self.assertIn("source_sha256 <> '" + checksum + "'", sql)

    def test_hot_prune_is_bounded_and_keeps_the_current_year(self):
        sql = lake.prune_batch_sql(5000)
        self.assertIn("LIMIT 5000", sql)
        self.assertLess(sql.index("state = 'refreshing'"), sql.index("DELETE FROM sod"))
        self.assertIn("is_current_snapshot = 1", sql)
        self.assertIn("year <>", sql)


if __name__ == "__main__":
    unittest.main()
