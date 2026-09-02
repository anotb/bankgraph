# Bank screen API

`GET /api/v2/banks/screen` runs a deterministic screen against the latest values stored on each institution. It does not generate SQL from prose.

## Request

| Parameter | Meaning |
| --- | --- |
| `q` | Institution-name text, at most 120 characters |
| `state` | Comma-separated headquarters state or territory codes |
| `active` | `active`, `inactive`, or `any`; default `active` |
| `asset_min`, `asset_max` | Inclusive total-asset bounds in FDIC USD thousands. `10000000` means $10 billion. |
| `conditions` | JSON array of at most 12 conditions |
| `sort` | `name` or one of the metric names below |
| `order` | `asc` or `desc` |
| `limit` | 1–1,000 rows; default 25. The WebMCP search tool has a separate 50-row ranked-set ceiling and a 25-row default page. |
| `offset` | Zero-based result offset from 0 to 100,000; default 0. Keep the filters and ordering unchanged while paging. |

Each condition has `metric`, `operator`, `value`, and, only for `between`, `upperValue`. Operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, and inclusive `between`. All conditions are joined with `AND`. A condition does not match an institution when that condition's metric is null, including `ne`.

The metric names and stored units are:

| Metric | Stored field | Unit |
| --- | --- | --- |
| `assets` | Total assets | FDIC USD thousands |
| `deposits` | Total deposits | FDIC USD thousands |
| `roa` | Return on assets | Reported percent |
| `roe` | Return on equity | Reported percent |
| `nim` | Net interest margin | Reported percent |
| `noncurrentLoanRatio` | Noncurrent loans to loans | Reported percent |
| `tier1Ratio` | Tier-1 ratio snapshot | Reported percent |
| `domesticOffices` | Domestic offices | Count |
| `employees` | Employees | Count |

Example:

```text
/api/v2/banks/screen?state=NC,VA&active=active&asset_min=10000000&conditions=%5B%7B%22metric%22%3A%22roa%22%2C%22operator%22%3A%22gte%22%2C%22value%22%3A1%7D%5D&sort=roa&order=desc&limit=25
```

## Response

`data` contains enough institution metadata and stored latest metrics to render a cohort row. `total` counts every match before `limit`; `truncated` reports whether rows were omitted; `asOf` is the newest stored reporting date among matches. `provenance` states the source, units, condition logic, and null behavior.
