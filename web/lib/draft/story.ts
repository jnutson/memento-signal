import type { SignalRow } from "@/lib/signal/schema";
import { formatMoney, formatNumber } from "@/lib/signal/presentation";

export const stories = {
  acceleration: {
    label: "Demand opportunity",
    verb: "Meet the momentum.",
    title: "Demand is moving. Your forecast isn't.",
    short: "Demand is pulling ahead of the forecast.",
    theme: "mint",
    symbol: "↗",
    outcome: "forward sales opportunity",
    read: "Recent sales are consistently stronger relative to the retailer forecast. The model carries that momentum into the next four weeks. This is a reason to review supply, not proof that additional stock will sell.",
    question: "Can supply keep up?",
    watch:
      "Sales relative to forecast, receipt timing, and whether the demand gap persists.",
    options: [
      {
        id: "review-supply",
        label: "Review the supply plan",
        description:
          "Check stock and incoming receipts against the higher demand path.",
        watch: "Did available supply cover the demand gap?",
      },
      {
        id: "review-forecast",
        label: "Review the forecast",
        description:
          "Bring the persistent demand gap to the planning conversation.",
        watch: "Did the forecast move closer to observed demand?",
      },
      {
        id: "observe",
        label: "Watch for another week",
        description:
          "Keep the signal visible while you check whether momentum holds.",
        watch: "Did the forecast-relative acceleration continue?",
      },
    ],
  },
  risk: {
    label: "Availability risk",
    verb: "Close the supply gap.",
    title: "The shelf could empty before help arrives.",
    short: "Stock may run out before supply catches up.",
    theme: "peach",
    symbol: "↘",
    outcome: "retail sales at risk",
    read: "Projected demand consumes the available stock before the end of the horizon. Expected receipts are included, but their timing matters. The orange portion is demand the model cannot fulfill from the projected balance.",
    question: "What can arrive in time?",
    watch: "The next receipt, on-shelf availability, and unfulfilled demand.",
    options: [
      {
        id: "confirm-receipt",
        label: "Confirm the next receipt",
        description:
          "Check the arrival date and outstanding quantity with your supply team.",
        watch: "Did the receipt arrive before the projected depletion?",
      },
      {
        id: "review-expedite",
        label: "Explore an earlier arrival",
        description:
          "Review an expedite or transfer; timing alone does not confirm feasibility.",
        watch: "Was the supply gap shortened?",
      },
      {
        id: "observe",
        label: "Monitor availability closely",
        description:
          "Track the risk while a supply response is being assessed.",
        watch: "How much demand went unfulfilled?",
      },
    ],
  },
  deceleration: {
    label: "Demand slowdown",
    verb: "Give the plan a second look.",
    title: "The forecast is running ahead of demand.",
    short: "Recent demand is softer than the forecast expects.",
    theme: "lilac",
    symbol: "↘",
    outcome: "forward forecast overstatement",
    read: "Recent sales are consistently weaker relative to the retailer forecast. The model projects a lower demand path. The dollar gap describes forecast overstatement, not realized loss or a guaranteed saving.",
    question: "Should the next order change?",
    watch:
      "Sales relative to forecast and whether incoming inventory still fits demand.",
    options: [
      {
        id: "review-forecast",
        label: "Review the demand forecast",
        description:
          "Check the lower demand path with the planning team before changing orders.",
        watch: "Did the forecast gap narrow?",
      },
      {
        id: "review-orders",
        label: "Review upcoming orders",
        description:
          "Check whether future receipts are appropriate for the softer demand path.",
        watch: "Did inventory stay aligned with demand?",
      },
      {
        id: "observe",
        label: "Watch for another week",
        description:
          "Look for recovery before deciding whether the plan needs to change.",
        watch: "Did the slowdown persist?",
      },
    ],
  },
  excess: {
    label: "Inventory exposure",
    verb: "Put stock back in balance.",
    title: "More stock than the demand path calls for.",
    short: "Inventory stays above the policy target.",
    theme: "sand",
    symbol: "≈",
    outcome: "inventory capital exposed",
    read: "Projected inventory remains above the declared target-cover policy. That ties up capital and creates carrying exposure. It is a prompt to review stock and future receipts, not proof of an ordering mistake.",
    question: "Where can inventory work harder?",
    watch:
      "Closing stock versus the policy target, future receipts, and carrying exposure.",
    options: [
      {
        id: "review-orders",
        label: "Review future replenishment",
        description:
          "Check whether the next receipts should be adjusted to the demand path.",
        watch: "Did closing inventory move toward the policy target?",
      },
      {
        id: "review-allocation",
        label: "Explore a stock rebalance",
        description:
          "Look for another location with demand before considering a transfer.",
        watch: "Did exposed inventory find a better use?",
      },
      {
        id: "observe",
        label: "Keep the target under review",
        description:
          "Confirm the cover policy and watch whether the exposure unwinds.",
        watch: "Did stock above target decrease?",
      },
    ],
  },
} as const;

export function storyFor(signal: SignalRow) {
  return stories[signal.signal_direction];
}

export function economics(signal: SignalRow) {
  return signal.signal_type === "inventory_imbalance"
    ? signal.inventory_cost_exposed_amount
    : signal.estimated_retail_sales_impact_amount;
}

export function calculation(signal: SignalRow) {
  const units = formatNumber(signal.headline_metric_value);
  if (signal.signal_type === "inventory_imbalance")
    return `Published horizon-end excess inventory × unit cost = ${formatMoney(signal.inventory_cost_exposed_amount)} capital exposed. ${formatMoney(signal.carrying_cost_28d_amount)} is the separate 28-day carrying estimate. Capital is not lost revenue.`;
  return `${units} ${signal.signal_type === "availability" ? "projected unfulfilled" : "forward forecast-gap"} units × applicable retail price = ${formatMoney(signal.estimated_retail_sales_impact_amount)}. Estimated contribution: ${formatMoney(signal.estimated_contribution_impact_amount)}. Horizon: 28 days; modeled magnitude, not realized revenue.`;
}

export function timing(signal: SignalRow) {
  const days = signal.decision_slack_days;
  if (days == null) return "Timing needs review";
  if (days < 0) return `${Math.abs(days)}d past start-by`;
  if (days === 0) return "Start today at snapshot";
  return `${days}d to start`;
}

export function nextWeek(day: string) {
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
