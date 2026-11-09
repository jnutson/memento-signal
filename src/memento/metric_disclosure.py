"""Reviewed customer table projections; adding a stored column cannot expose it."""
FIELDS = {
    'periods': 'grain scope_id scope_name product_id period_kind period_start period_end stores expected_days sales_days inventory_days zero_days units dollars store_day_rate units_store_week dollars_store_week sales_coverage inventory_coverage reported_oos_rate in_stock_rate same_store_count same_store_coverage current_rate prior_rate rate_change adjusted_unit_change current_dollar_rate prior_dollar_rate adjusted_dollar_change trend_pct trend_status raw_direction trend_highlight',
    'distribution': 'grain scope_id scope_name product_id promised_stores stocked_stores confirmed_zero_stores unknown_stores unconfirmed_stores',
    'findings': 'finding_id product_id promise finding_code title interpretation supply_basis units_basis as_of affected_store_count eligible_store_count affected_store_share context_json first_event_date last_event_date earliest_plan_review_date units retail_exposure_amount inventory_capital_amount carrying_cost_28d_amount retail_valued_store_count cost_valued_store_count missing_evidence limitations',
    'finding-evidence': 'finding_id evidence_id location_id product_id finding_code facts_json event_date plan_review_date units retail_exposure_amount inventory_capital_amount carrying_cost_28d_amount missing_evidence',
    'daily': 'location_id product_id business_date eligible eligibility_evidence units dollars on_hand sales_valid inventory_valid week_start month_start weekday',
    'projection': 'location_id product_id projection_date path demand_units inbound_units opening_units available_units fulfilled_units unfulfilled_units ending_units',
    'expected-projection': 'location_id product_id projection_date path demand_units inbound_units opening_units available_units fulfilled_units unfulfilled_units ending_units firm_inbound_units planned_inbound_units supply_basis',
}


def columns(kind: str) -> str:
    # All identifiers originate in this module, never a client or manifest.
    return ','.join('"' + name + '"' for name in FIELDS[kind].split())
