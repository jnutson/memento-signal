"""Small read-only demo review vocabulary; not an action/feasibility engine.

These are questions a human may choose to investigate. No option authorizes a
shipment, predicts its benefit, or claims that its prerequisites have been met.
"""
from pydantic import BaseModel


class ReviewOption(BaseModel):
    key: str
    label: str
    verification: str


class ReviewContext(BaseModel):
    metric_release_id: str
    finding_id: str
    cue: str
    cue_basis: str
    options: list[ReviewOption]
    recommendation: None = None
    priority_score: None = None
    estimated_action_benefit: None = None
    action_deadline: None = None
    result: str = "Not measured. Observed changes do not establish action effectiveness."
    workflow: str = "Session-only user notes; no external approval or execution."


def review_context(release_id: str, finding: dict) -> ReviewContext:
    code = finding["finding_code"]
    if code == "availability_unknown":
        cue, options = "Evidence incomplete", [ReviewOption(key="verify_data", label="Investigate missing evidence",
            verification="Verify missing inventory, forecast and planned-order inputs before interpreting coverage.")]
    elif code == "promised_distribution_gap":
        cue, options = "Reported zero", [ReviewOption(key="verify_distribution", label="Review initial distribution",
            verification="Confirm the promise, available observation history, retailer PO and store receipt evidence.")]
    elif code in {"current_out_of_stock", "future_supply_gap"}:
        cue = "Reported zero" if code == "current_out_of_stock" else "Projected gap"
        options = [ReviewOption(key="review_supply", label="Review replenishment evidence",
            verification="Confirm the retailer PO, inventory location, transport capacity and store arrival timing. No expedite or transfer is assumed feasible.")]
    elif code in {"excess_inventory", "conditional_excess_inventory", "conditional_plan_dependency"}:
        cue = "Conditional plan review" if code == "conditional_plan_dependency" else "Inventory review"
        options = [ReviewOption(key="review_plans", label="Review future planned orders",
            verification="Confirm unconverted quantity, source placement date, stock readiness and retailer change permissions. Plans are not firm POs; reviewing is not cancelling.")]
    elif code == "sustained_outperformance":
        cue, options = "Expansion evidence", [ReviewOption(key="prepare_case", label="Prepare an expansion discussion",
            verification="Review the internal baseline, both recent windows, inventory exposure, seasonality and promotions. No peer benchmark or buyer approval is established.")]
    else:
        cue, options = "Observed change", []
    options.append(ReviewOption(key="monitor", label="Monitor the next release",
        verification="A later finding or recovery is evidence to review, not proof that this choice worked."))
    return ReviewContext(metric_release_id=release_id, finding_id=finding["finding_id"], cue=cue,
        cue_basis="Finding type only. Not a priority rank, confidence probability or feasible-action deadline.", options=options)
