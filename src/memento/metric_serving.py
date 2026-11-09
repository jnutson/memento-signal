"""Read-only access to all published metrics, not just ranked candidates."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import duckdb
from .query import serving_connection
from fastapi import APIRouter, HTTPException, Query

from .metric_publication import RELEASE_ID, scalar, validate_release
from .metric_source import member
from .metric_evaluation_serving import read_evaluation
from .demo_review import ReviewContext, review_context
from .metric_display import display_series, exposure_summary
from .metric_attention import attention_values
from .metric_disclosure import columns
from .http_security import current_policy
from .workspace import summary as workspace_summary, product_view, store_page


class MetricStore:
    def __init__(self, data_root: Path):
        self.root = data_root / "metrics"

    def current(self, release_id: str | None = None) -> tuple[Path, dict]:
        if release_id is None:
            pointer = json.loads(member(self.root, "current.json").read_text())
            release_id = pointer["metric_release_id"]
            if not isinstance(release_id, str) or pointer.get("manifest") != release_id + "/manifest.json":
                raise ValueError("invalid metric current pointer")
        if not isinstance(release_id, str) or not RELEASE_ID.fullmatch(release_id):
            raise ValueError("invalid metric release ID")
        manifest = member(self.root, release_id + "/manifest.json")
        policy = current_policy.get()
        if policy:
            policy.approved_manifest(self.root.parent, manifest)
        if policy is None and json.loads(manifest.read_bytes()).get("source_classification") != "synthetic":
            raise ValueError("local serving requires declared synthetic inputs")
        document = validate_release(manifest.parent)
        if policy:
            if document.get("source_classification") != policy.classification:
                raise ValueError("publication classification mismatch")
            dataset = document.get("canonical_dataset_id")
            import re
            if not isinstance(dataset, str) or not re.fullmatch(r"mds_[A-Za-z0-9_]+", dataset):
                raise ValueError("invalid canonical identity")
            canonical = member(self.root.parent / "canonical", dataset + "/manifest.json")
            from .manifest import sha256_file
            if sha256_file(canonical) != document.get("canonical_manifest_sha256"):
                raise ValueError("canonical publication binding mismatch")
            policy.approved_manifest(self.root.parent, canonical)
        elif document.get("source_classification") != "synthetic":
            raise ValueError("local serving requires declared synthetic inputs")
        if document["metric_release_id"] != release_id:
            raise ValueError("metric pointer identity mismatch")
        return manifest.parent, document

    def metadata(self, release_id: str | None = None) -> dict:
        root, manifest = self.current(release_id)
        with serving_connection(root) as con:
            items = con.execute("SELECT DISTINCT product_id,product_name,source_product_id,company_item_id FROM read_parquet(?) ORDER BY source_product_id", [str(root / "current_store.parquet")]).to_arrow_table().to_pylist()
            periods = con.execute("SELECT DISTINCT period_kind,period_start,period_end FROM read_parquet(?) ORDER BY period_start DESC,period_kind", [str(root / "metric_period.parquet")]).to_arrow_table().to_pylist()
            checks = con.execute("SELECT check_code,count(*) count FROM read_parquet(?) GROUP BY ALL ORDER BY check_code", [str(root / "checks.parquet")]).to_arrow_table().to_pylist()
        capabilities = sorted(f["path"].removesuffix(".parquet") for f in manifest["files"] if f["path"].endswith(".parquet"))
        keys = {"metric_release_id", "contract_version", "observation_date", "population", "states", "formulas", "limitations", "configuration", "as_of", "supply_model", "expected_supply_model", "finding_model"}
        public = {key: value for key, value in manifest.items() if key in keys}
        public["files"] = [{"path": f["path"]} for f in manifest["files"]]
        return {**public, "items": items, "periods": periods, "check_counts": checks, "capabilities": capabilities}

    def rows(self, kind: str, *, release_id: str | None = None, grain: str = "item",
             product_id: str | None = None, scope_id: str | None = None, period_kind: str = "week",
             period_start: str | None = None, check_code: str | None = None,
             current_state: str | None = None,
             measure: str | None = None, projection_status: str | None = None,
             finding_id: str | None = None, promise: str | None = None,
             highlights_only: bool = False, limit: int = 50, offset: int = 0) -> dict:
        files = {"periods": "metric_period", "weekday": "metric_weekday", "stores": "current_store",
                 "distribution": "distribution_summary", "checks": "checks",
                 "trends": "metric_trend", "daily": "daily", "episodes": "stockout_episode",
                 "supply": "supply_assessment", "projection": "supply_projection", "orders": "supply_order", "forecasts": "supply_forecast",
                 "planned-orders": "planned_order", "planned-conversions": "planned_conversion", "planned-coverage": "planned_coverage",
                 "expected-supply": "expected_supply_assessment", "expected-projection": "expected_supply_projection",
                 "findings": "finding", "finding-evidence": "finding_evidence"}
        if kind not in files or grain not in {"store", "item", "region", "tier"} or period_kind not in {"week", "month"}:
            raise ValueError("invalid metric query")
        if not 1 <= limit <= 200 or not 0 <= offset <= 1_000_000:
            raise ValueError("invalid metric pagination")
        root, manifest = self.current(release_id)
        predicates = ["true"]
        params: list = [str(root / (files[kind] + ".parquet"))]
        grouped = kind in {"periods", "weekday", "distribution", "trends"}
        if kind == "findings" and scope_id is not None:
            raise ValueError("store filtering requires finding-evidence")
        if grouped:
            predicates.append("grain=?")
            params.append(grain)
        for key, value in (("product_id", product_id),
                           ("scope_id" if grouped else "location_id", scope_id)):
            if value is not None:
                predicates.append(key + "=?")
                params.append(value)
        if kind in {"periods", "trends"}:
            predicates.append("period_kind=?")
            params.append(period_kind)
            if period_start is not None:
                predicates.append("period_start=?::DATE")
                params.append(period_start)
            if highlights_only:
                predicates.append("highlight" if kind=="trends" else "trend_highlight")
        if kind=="trends" and measure:
            predicates.append("measure=?")
            params.append(measure)
        if kind in {"findings", "finding-evidence"} and finding_id is not None:
            predicates.append("finding_id=?")
            params.append(finding_id)
        if kind == "findings" and promise is not None:
            predicates.append("promise=?")
            params.append(promise)
        if kind in {"supply", "expected-supply"} and projection_status:
            predicates.append("projection_status=?")
            params.append(projection_status)
        if kind == "checks" and check_code:
            predicates.append("check_code=?")
            params.append(check_code)
        if kind == "stores" and current_state:
            predicates.append("current_state=?")
            params.append(current_state)
        where = " AND ".join(predicates)
        ordering = {"periods": "period_start DESC,product_id,scope_id", "weekday": "product_id,scope_id,weekday",
                    "stores": "source_product_id,source_location_id,location_id",
                    "distribution": "product_id,scope_id", "checks": "check_code,product_id,location_id",
                    "trends": "period_start DESC,product_id,scope_id,measure",
                    "daily": "business_date DESC,product_id,location_id",
                    "episodes": "onset_date DESC,product_id,location_id,episode_number",
                    "supply": "product_id,location_id", "projection": "product_id,location_id,path,projection_date",
                    "orders": "product_id,location_id,retailer_order_id,order_line_number",
                    "forecasts": "product_id,location_id,target_retail_year_week",
                    "planned-orders": "product_id,location_id,plan_id",
                    "planned-conversions": "product_id,location_id,plan_id,retailer_order_id,order_line_nbr",
                    "planned-coverage": "product_id,location_id", "expected-supply": "product_id,location_id",
                    "expected-projection": "product_id,location_id,path,projection_date",
                    "findings": "promise,product_id,finding_code,finding_id",
                    "finding-evidence": "product_id,location_id,evidence_id"}[kind]
        if not (root/(files[kind]+".parquet")).is_file():
            raise ValueError("requested table is not in this historical metric contract")
        projection = columns(kind) if current_policy.get() else "*"
        with serving_connection(root) as con:
            total = scalar(con, f"SELECT count(*) FROM read_parquet(?) WHERE {where}", params)
            rows = con.execute(f"SELECT {projection} FROM read_parquet(?) WHERE {where} ORDER BY {ordering} LIMIT ? OFFSET ?",
                               [*params, limit, offset]).to_arrow_table().to_pylist()
        return {"metric_release_id": manifest["metric_release_id"], "kind": kind, "total": total,
                "limit": limit, "offset": offset, "rows": rows}


def metric_router(data_root: Path) -> APIRouter:
    router = APIRouter(prefix="/v1/metrics", tags=["Descriptive metrics"])
    store = MetricStore(data_root)

    @router.get("/workspace-summary")
    def workspace(release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            return workspace_summary(root, manifest)
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Workspace publication unavailable or failed validation.") from None

    @router.get("/product-view")
    def product(product_id: str = Query(..., min_length=1, max_length=100),
                release_id: str = Query(..., pattern=r"^met_[a-f0-9]{64}$"),
                region: str | None = Query(None, min_length=1, max_length=200),
                finding_id: str | None = Query(None, pattern=r"^find_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            return product_view(root, manifest, product_id, region=region, finding_id=finding_id)
        except LookupError:
            raise HTTPException(404, "Product, region or finding unavailable in this publication.") from None
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Product publication unavailable or failed validation.") from None

    @router.get("/workspace-stores")
    def workspace_stores(product_id: str = Query(..., min_length=1, max_length=100),
                         release_id: str = Query(..., pattern=r"^met_[a-f0-9]{64}$"),
                         region: str | None = Query(None, min_length=1, max_length=200),
                         search: str = Query("", max_length=120),
                         limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0, le=1_000_000)):
        try:
            root, manifest = store.current(release_id)
            return store_page(root, manifest, product_id, region=region, search=search,limit=limit,offset=offset)
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Store visibility unavailable or failed validation.") from None

    @router.get("/evaluations/{evaluation_id}")
    def evaluation(evaluation_id: str):
        try:
            return read_evaluation(data_root,evaluation_id)
        except (OSError,ValueError,KeyError,TypeError):
            raise HTTPException(503,"Metric evaluation unavailable or failed validation.") from None

    @router.get("/metadata")
    def metadata(release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$")):
        try:
            return store.metadata(release_id)
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    @router.get("/review-context", response_model=ReviewContext)
    def review(finding_id: str = Query(..., pattern=r"^find_[a-f0-9]{64}$"),
               release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            if not (root / "finding.parquet").is_file():
                raise HTTPException(409, "This historical release does not include findings.")
            with serving_connection(root) as con:
                rows = con.execute("SELECT finding_id,finding_code FROM read_parquet(?) WHERE finding_id=?",
                                   [str(root / "finding.parquet"), finding_id]).to_arrow_table().to_pylist()
            if not rows:
                raise HTTPException(404, "Finding not found in the selected release.")
            return review_context(manifest["metric_release_id"], rows[0])
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    @router.get("/attention-values")
    def attention(release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$"),
                  finding_id: str | None = Query(None, pattern=r"^find_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            if not (root / "finding_evidence.parquet").is_file():
                raise HTTPException(409, "This historical release does not include finding evidence.")
            result = attention_values(root, manifest, finding_id=finding_id)
            if finding_id and not result["rows"]:
                raise HTTPException(404, "No financial attention estimate for this finding.")
            return result
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    @router.get("/exposure-summary")
    def exposures(release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            if not (root / "finding_evidence.parquet").is_file():
                raise HTTPException(409, "This historical release does not include finding evidence.")
            return exposure_summary(root, manifest)
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    @router.get("/display-series")
    def display(product_id: str = Query(..., min_length=1, max_length=100),
                finding_id: str | None = Query(None, pattern=r"^find_[a-f0-9]{64}$"),
                release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$")):
        try:
            root, manifest = store.current(release_id)
            if not (root / "finding_evidence.parquet").is_file():
                raise HTTPException(409, "This historical release does not include finding evidence.")
            result = display_series(root, manifest, product_id, finding_id)
            if not result["member_count"]:
                raise HTTPException(404, "No matching members in the selected release.")
            return result
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    @router.get("/{kind}")
    def rows(kind: Literal["periods", "weekday", "stores", "distribution", "checks", "trends", "daily", "episodes", "supply", "projection", "orders", "forecasts",
                           "planned-orders", "planned-conversions", "planned-coverage", "expected-supply", "expected-projection", "findings", "finding-evidence"],
             release_id: str | None = Query(None, pattern=r"^met_[a-f0-9]{64}$"),
             grain: Literal["store", "item", "region", "tier"] = "item",
             product_id: str | None = Query(None, max_length=100),
             scope_id: str | None = Query(None, max_length=200),
             period_kind: Literal["week", "month"] = "week",
             period_start: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
             check_code: str | None = Query(None, max_length=80),
             current_state: Literal["not_applicable", "unknown_inventory", "reported_zero_on_hand", "positive_reported_inventory"] | None = None,
             measure: Literal["unit_velocity", "dollar_velocity", "units", "retail_sales"] | None = None,
             projection_status: Literal["not_applicable", "insufficient_data", "healthy_28d", "projected_depletion", "projected_unfulfilled_demand",
                                        "conditional_healthy_28d", "conditional_projected_depletion", "conditional_projected_unfulfilled_demand"] | None = None,
             highlights_only: bool = False,
             finding_id: str | None = Query(None, pattern=r"^find_[a-f0-9]{64}$"),
             promise: Literal["expansion", "availability", "excess"] | None = None,
             limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0, le=1_000_000)):
        if period_start:
            from datetime import date
            try:
                date.fromisoformat(period_start)
            except ValueError:
                raise HTTPException(422, "Invalid metric period date.") from None
        try:
            return store.rows(kind, release_id=release_id, grain=grain, product_id=product_id,
                              scope_id=scope_id, period_kind=period_kind, period_start=period_start,
                              check_code=check_code, current_state=current_state,
                              measure=measure, projection_status=projection_status,
                              finding_id=finding_id, promise=promise,
                              highlights_only=highlights_only, limit=limit, offset=offset)
        except (OSError, ValueError, KeyError, TypeError, duckdb.Error):
            raise HTTPException(503, "Metric release unavailable or failed validation.") from None

    return router
