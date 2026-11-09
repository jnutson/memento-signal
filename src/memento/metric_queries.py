"""Deterministic DuckDB transformations over validated canonical inputs."""

DAILY = """
CREATE TEMP TABLE sales_day AS
SELECT business_date,location_id,product_id,
 CASE WHEN count(sales_quantity)=count(*) THEN sum(sales_quantity)::DOUBLE END units,
 CASE WHEN count(sales_amount)=count(*) THEN sum(sales_amount)::DOUBLE END dollars
FROM sales_daily WHERE business_date<= (SELECT observation_date FROM cfg) GROUP BY ALL;

CREATE TEMP TABLE pairs AS
WITH keys AS (
 SELECT location_id,product_id FROM inventory_daily UNION
 SELECT location_id,product_id FROM sales_daily UNION
 SELECT location_id,product_id FROM promises
), mapping AS (
 SELECT * FROM company_item WHERE effective_from<=(SELECT observation_date FROM cfg)
 AND (effective_to IS NULL OR effective_to>=(SELECT observation_date FROM cfg))
)
SELECT k.*,l.location_name,l.source_location_id,
 coalesce(nullif(l.source_region_name,''),'Unknown region') region,
 p.product_name,p.source_product_id,p.effective_date product_effective_date,m.company_item_id,
 (upper(l.source_status_code) IN ('O','OPEN','A','ACTIVE')
 AND upper(p.source_status_code) IN ('A','ACTIVE') AND p.effective_date<=(SELECT observation_date FROM cfg)
 AND m.product_id IS NOT NULL) business_active,
 pr.effective_from,pr.effective_to,pr.stocking_due_date,pr.minimum_on_hand_units
FROM keys k JOIN location l USING(location_id) JOIN product p USING(product_id)
LEFT JOIN mapping m USING(product_id) LEFT JOIN promises pr USING(location_id,product_id);

CREATE TEMP TABLE daily AS
WITH dates AS (
 SELECT d::DATE business_date FROM range(
 (SELECT history_start FROM cfg), (SELECT observation_date+1 FROM cfg),INTERVAL 1 DAY) t(d)
), spine AS (
 SELECT p.location_id,p.product_id,d.business_date,
 p.product_effective_date,p.effective_from,p.effective_to,p.stocking_due_date,
 EXISTS(SELECT 1 FROM company_item m WHERE m.product_id=p.product_id
 AND m.effective_from<=d.business_date AND (m.effective_to IS NULL OR m.effective_to>=d.business_date)) mapping_eligible,
 last_value(i.assorted IGNORE NULLS) OVER w last_assorted,
 last_value(i.replenishment_enabled IGNORE NULLS) OVER w last_replenishable,
 min(CASE WHEN i.business_date IS NOT NULL OR s.business_date IS NOT NULL THEN d.business_date END)
 OVER(PARTITION BY p.location_id,p.product_id) first_observed_date,
 s.units,s.dollars,CASE WHEN i.on_hand_quantity>=0 THEN i.on_hand_quantity END on_hand
 FROM pairs p CROSS JOIN dates d
 LEFT JOIN sales_day s USING(location_id,product_id,business_date)
 LEFT JOIN inventory_daily i USING(location_id,product_id,business_date)
 WINDOW w AS (PARTITION BY p.location_id,p.product_id ORDER BY d.business_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
), eligibility AS (
 SELECT *,mapping_eligible AND business_date>=product_effective_date AND
 CASE WHEN effective_from IS NOT NULL THEN business_date>=greatest(effective_from,stocking_due_date)
 AND (effective_to IS NULL OR business_date<=effective_to)
 ELSE business_date>=first_observed_date AND coalesce(last_assorted,true)
 AND coalesce(last_replenishable,true) END eligible FROM spine
)
SELECT location_id,product_id,business_date,eligible,
 CASE WHEN last_assorted IS NULL OR last_replenishable IS NULL THEN 'assortment_unknown'
 ELSE 'past_observed_assortment' END eligibility_evidence,
 units,dollars,on_hand,eligible AND units IS NOT NULL AND dollars IS NOT NULL sales_valid,
 eligible AND on_hand IS NOT NULL inventory_valid,
 (date_trunc('week',business_date+INTERVAL 2 DAY)-INTERVAL 2 DAY)::DATE week_start,
 date_trunc('month',business_date)::DATE month_start,
 isodow(business_date)::INTEGER weekday FROM eligibility;

CREATE TEMP TABLE tiers AS
WITH baseline AS (
 SELECT location_id,product_id,sum(units)/56 rate
 FROM daily WHERE business_date BETWEEN (SELECT baseline_end-55 FROM cfg) AND (SELECT baseline_end FROM cfg)
 GROUP BY ALL HAVING count(*) FILTER(WHERE sales_valid)=56
), ranked AS (
 SELECT *,ntile(3) OVER(PARTITION BY product_id ORDER BY rate DESC,location_id) bucket FROM baseline
)
SELECT p.location_id,p.product_id,CASE r.bucket WHEN 1 THEN 'high' WHEN 2 THEN 'medium'
 WHEN 3 THEN 'low' ELSE 'unranked' END tier FROM pairs p LEFT JOIN ranked r USING(location_id,product_id);

CREATE TEMP TABLE dimensions AS
SELECT p.location_id,p.product_id,'store' grain,p.location_id scope_id,p.location_name scope_name FROM pairs p
UNION ALL SELECT p.location_id,p.product_id,'item',p.product_id,p.product_name FROM pairs p
UNION ALL SELECT p.location_id,p.product_id,'region',p.region,p.region FROM pairs p
UNION ALL SELECT location_id,product_id,'tier',tier,tier FROM tiers;
"""

PERIODS = """
CREATE TEMP TABLE store_period AS
WITH periods AS (
 SELECT *, 'week' period_kind,week_start period_start,week_start+6 period_end FROM daily
 UNION ALL
 SELECT *, 'month',month_start,(month_start+INTERVAL 1 MONTH-INTERVAL 1 DAY)::DATE FROM daily
)
SELECT period_kind,period_start,period_end,location_id,product_id,
 count(*) FILTER(WHERE eligible)::BIGINT expected_days,
 count(*) FILTER(WHERE sales_valid)::BIGINT sales_days,
 count(*) FILTER(WHERE inventory_valid)::BIGINT inventory_days,
 count(*) FILTER(WHERE inventory_valid AND on_hand=0)::BIGINT zero_days,
 sum(units) FILTER(WHERE sales_valid)::DOUBLE units,
 sum(dollars ORDER BY business_date) FILTER(WHERE sales_valid)::DOUBLE dollars
FROM periods WHERE period_start>=(SELECT history_start FROM cfg)
 AND period_end<=(SELECT observation_date FROM cfg)
GROUP BY ALL HAVING count(*) FILTER(WHERE eligible)>0;

CREATE TEMP TABLE rolled AS
SELECT d.grain,d.scope_id,d.scope_name,s.product_id,s.period_kind,s.period_start,s.period_end,
 count(*)::BIGINT stores,sum(expected_days)::BIGINT expected_days,sum(sales_days)::BIGINT sales_days,
 sum(inventory_days)::BIGINT inventory_days,sum(zero_days)::BIGINT zero_days,
 sum(units)::DOUBLE units,sum(dollars ORDER BY s.location_id)::DOUBLE dollars,
 sum(units)/nullif(sum(sales_days),0) store_day_rate,
 7*sum(units)/nullif(sum(sales_days),0) units_store_week,
 7*sum(dollars ORDER BY s.location_id)/nullif(sum(sales_days),0) dollars_store_week,
 sum(sales_days)::DOUBLE/nullif(sum(expected_days),0) sales_coverage,
 sum(inventory_days)::DOUBLE/nullif(sum(expected_days),0) inventory_coverage,
 sum(zero_days)::DOUBLE/nullif(sum(inventory_days),0) reported_oos_rate,
 1-sum(zero_days)::DOUBLE/nullif(sum(inventory_days),0) in_stock_rate
FROM store_period s JOIN dimensions d USING(location_id,product_id) GROUP BY ALL;

CREATE TEMP TABLE comparable AS
SELECT d.grain,d.scope_id,c.product_id,c.period_kind,c.period_start,
 count(*)::BIGINT same_store_count,
 sum(c.units)/nullif(sum(c.sales_days),0) current_rate,
 sum(p.units)/nullif(sum(p.sales_days),0) prior_rate,
 sum(c.units)-sum(c.sales_days)*sum(p.units)/nullif(sum(p.sales_days),0) adjusted_unit_change,
 sum(c.dollars ORDER BY c.location_id)/nullif(sum(c.sales_days),0) current_dollar_rate,
 sum(p.dollars ORDER BY c.location_id)/nullif(sum(p.sales_days),0) prior_dollar_rate,
 sum(c.dollars ORDER BY c.location_id)-sum(c.sales_days)*sum(p.dollars ORDER BY c.location_id)/nullif(sum(p.sales_days),0) adjusted_dollar_change
FROM store_period c JOIN store_period p ON c.location_id=p.location_id AND c.product_id=p.product_id
 AND c.period_kind=p.period_kind AND p.period_start=CASE WHEN c.period_kind='week' THEN c.period_start-7
 ELSE (c.period_start-INTERVAL 1 MONTH)::DATE END
JOIN dimensions d ON d.location_id=c.location_id AND d.product_id=c.product_id
WHERE c.sales_days::DOUBLE/c.expected_days>=(SELECT minimum_coverage FROM cfg)
 AND p.sales_days::DOUBLE/p.expected_days>=(SELECT minimum_coverage FROM cfg)
GROUP BY ALL;

CREATE TEMP TABLE metric_period AS
WITH changes AS (
 SELECT r.*,coalesce(c.same_store_count,0)::BIGINT same_store_count,
 c.same_store_count::DOUBLE/r.stores same_store_coverage,c.current_rate,c.prior_rate,
 c.current_rate-c.prior_rate rate_change,c.adjusted_unit_change,
 c.current_dollar_rate,c.prior_dollar_rate,c.adjusted_dollar_change,
 CASE WHEN c.prior_rate>0 THEN 100*(c.current_rate/c.prior_rate-1) END trend_pct,
 CASE WHEN c.prior_rate=0 AND c.current_rate>0 THEN 'from_zero'
 WHEN c.prior_rate<=0 THEN 'nonpositive_baseline'
 WHEN c.prior_rate IS NULL THEN 'insufficient_comparable_history' ELSE 'comparable' END trend_status
 FROM rolled r LEFT JOIN comparable c USING(grain,scope_id,product_id,period_kind,period_start)
), flags AS (
 SELECT *,CASE WHEN same_store_coverage>=(SELECT minimum_coverage FROM cfg)
 AND abs(trend_pct)>=(SELECT trend_percent FROM cfg)
 AND abs(adjusted_unit_change)>=(SELECT trend_minimum_units FROM cfg)
 THEN sign(trend_pct)::INTEGER ELSE 0 END raw_direction FROM changes
), runs AS (
 SELECT *,sum(CASE WHEN raw_direction<>previous_direction THEN 1 ELSE 0 END)
 OVER(PARTITION BY grain,scope_id,product_id,period_kind ORDER BY period_start) run_id
 FROM (SELECT *,coalesce(lag(raw_direction) OVER(
 PARTITION BY grain,scope_id,product_id,period_kind ORDER BY period_start),0) previous_direction FROM flags)
)
SELECT * EXCLUDE(previous_direction,run_id),raw_direction<>0 AND
 (period_kind='month' OR row_number() OVER(PARTITION BY grain,scope_id,product_id,period_kind,run_id ORDER BY period_start)
 >=(SELECT weekly_persistence FROM cfg)) trend_highlight
FROM runs;
"""

TRENDS = """
CREATE TEMP TABLE metric_trend AS
WITH totals AS (
 SELECT c.*,p.units prior_total_units,p.dollars prior_total_dollars,
 p.sales_coverage prior_sales_coverage FROM metric_period c LEFT JOIN metric_period p
 ON c.grain=p.grain AND c.scope_id=p.scope_id AND c.product_id=p.product_id
 AND c.period_kind=p.period_kind AND p.period_start=CASE WHEN c.period_kind='week'
 THEN c.period_start-7 ELSE (c.period_start-INTERVAL 1 MONTH)::DATE END
), measures AS (
 SELECT *, 'unit_velocity' measure,'same_store' comparison_basis,current_rate current_value,
 prior_rate prior_value,adjusted_unit_change material_change,
 (SELECT trend_minimum_units FROM cfg) minimum_change,same_store_coverage comparison_coverage FROM totals
 UNION ALL
 SELECT *, 'dollar_velocity','same_store',current_dollar_rate,prior_dollar_rate,adjusted_dollar_change,
 (SELECT trend_minimum_dollars FROM cfg),same_store_coverage FROM totals
 UNION ALL
 SELECT *, 'units','total_including_distribution',units,prior_total_units,units-prior_total_units,
 (SELECT trend_minimum_units FROM cfg),least(sales_coverage,prior_sales_coverage) FROM totals
 UNION ALL
 SELECT *, 'retail_sales','total_including_distribution',dollars,prior_total_dollars,dollars-prior_total_dollars,
 (SELECT trend_minimum_dollars FROM cfg),least(sales_coverage,prior_sales_coverage) FROM totals
), changes AS (
 SELECT grain,scope_id,scope_name,product_id,period_kind,period_start,period_end,measure,comparison_basis,
 current_value,prior_value,current_value-prior_value absolute_change,material_change,comparison_coverage,
 CASE WHEN prior_value>0 THEN 100*(current_value/prior_value-1) END change_pct,
 CASE WHEN prior_value IS NULL THEN 'insufficient_comparable_history'
 WHEN prior_value=0 AND current_value>0 THEN 'from_zero'
 WHEN prior_value<=0 THEN 'nonpositive_baseline' ELSE 'comparable' END comparison_status
 FROM measures
), flags AS (
 SELECT *,CASE WHEN comparison_coverage>=(SELECT minimum_coverage FROM cfg)
 AND abs(change_pct)>=(SELECT trend_percent FROM cfg)
 AND abs(material_change)>=CASE WHEN measure IN ('unit_velocity','units')
 THEN (SELECT trend_minimum_units FROM cfg) ELSE (SELECT trend_minimum_dollars FROM cfg) END
 THEN sign(change_pct)::INTEGER ELSE 0 END direction FROM changes
), runs AS (
 SELECT *,sum(CASE WHEN direction<>prior_direction OR NOT contiguous THEN 1 ELSE 0 END)
 OVER(PARTITION BY grain,scope_id,product_id,period_kind,measure ORDER BY period_start) run_id
 FROM (SELECT *,coalesce(lag(direction) OVER w,0) prior_direction,
 coalesce(lag(period_end) OVER w=period_start-1,false) contiguous FROM flags
 WINDOW w AS (PARTITION BY grain,scope_id,product_id,period_kind,measure ORDER BY period_start))
)
SELECT * EXCLUDE(prior_direction,contiguous,run_id),direction<>0 AND
 (period_kind='month' OR row_number() OVER(PARTITION BY grain,scope_id,product_id,period_kind,measure,run_id
 ORDER BY period_start)>=(SELECT weekly_persistence FROM cfg)) highlight FROM runs;
"""

QUALITY_EPISODES = """
CREATE TEMP TABLE coverage AS
SELECT location_id,product_id,count(*) FILTER(WHERE eligible)::BIGINT expected_days,
 count(*) FILTER(WHERE sales_valid)::BIGINT valid_sales_days,
 count(*) FILTER(WHERE inventory_valid)::BIGINT valid_inventory_days,
 count(*) FILTER(WHERE sales_valid)::DOUBLE/nullif(count(*) FILTER(WHERE eligible),0) sales_coverage,
 count(*) FILTER(WHERE inventory_valid)::DOUBLE/nullif(count(*) FILTER(WHERE eligible),0) inventory_coverage
FROM daily WHERE business_date>(SELECT observation_date-quality_window_days::INTEGER FROM cfg) GROUP BY ALL;

CREATE TEMP TABLE stockout_episode AS
WITH flags AS (
 SELECT *,coalesce(eligible AND inventory_valid AND on_hand=0,false) is_zero,
 coalesce(lag(eligible AND inventory_valid AND on_hand=0) OVER w,false) prior_zero
 FROM daily WINDOW w AS (PARTITION BY location_id,product_id ORDER BY business_date)
), groups AS (
 SELECT *,sum(CASE WHEN is_zero AND NOT prior_zero THEN 1 ELSE 0 END)
 OVER(PARTITION BY location_id,product_id ORDER BY business_date) episode_number FROM flags
), episodes AS (
 SELECT location_id,product_id,episode_number,min(business_date) onset_date,max(business_date) last_zero_date,
 count(*)::BIGINT consecutive_zero_days FROM groups WHERE is_zero GROUP BY ALL
)
SELECT e.*,NOT coalesce(p.eligible AND p.inventory_valid AND p.on_hand>0,false) left_censored,
 CASE WHEN n.eligible AND n.inventory_valid AND n.on_hand>0 THEN n.business_date END recovery_date,
 CASE WHEN e.last_zero_date=(SELECT observation_date FROM cfg) THEN 'right_censored'
 WHEN NOT coalesce(n.eligible,false) THEN 'scope_or_evidence_ended'
 WHEN NOT coalesce(n.inventory_valid,false) THEN 'inventory_gap' ELSE 'recovered' END end_reason
FROM episodes e LEFT JOIN daily p ON p.location_id=e.location_id AND p.product_id=e.product_id AND p.business_date=e.onset_date-1
LEFT JOIN daily n ON n.location_id=e.location_id AND n.product_id=e.product_id AND n.business_date=e.last_zero_date+1;
"""

CURRENT = """
CREATE TEMP TABLE current_store AS
WITH latest AS (
 SELECT * FROM inventory_daily WHERE business_date<=(SELECT observation_date FROM cfg)
 QUALIFY row_number() OVER(PARTITION BY location_id,product_id ORDER BY business_date DESC)=1
), observations AS (
 SELECT p.*,t.tier,(SELECT observation_date FROM cfg) observation_date,i.business_date inventory_date,
 CASE WHEN i.business_date=(SELECT observation_date FROM cfg) AND i.on_hand_quantity>=0
 THEN i.on_hand_quantity END on_hand,
 coalesce(p.business_active,false) AND p.effective_from<=(SELECT observation_date FROM cfg)
 AND p.stocking_due_date<=(SELECT observation_date FROM cfg)
 AND (p.effective_to IS NULL OR p.effective_to>=(SELECT observation_date FROM cfg)) promised_due,
 coalesce(p.business_active,false) AND CASE WHEN p.effective_from IS NOT NULL
 THEN p.effective_from<=(SELECT observation_date FROM cfg) AND p.stocking_due_date<=(SELECT observation_date FROM cfg)
 AND (p.effective_to IS NULL OR p.effective_to>=(SELECT observation_date FROM cfg))
 ELSE coalesce(d.eligible,false) END eligible,
 coalesce(q.sales_coverage,0) recent_sales_coverage,coalesce(q.inventory_coverage,0) recent_inventory_coverage,
 CASE WHEN i.business_date=(SELECT observation_date FROM cfg) AND i.on_hand_quantity=0
 THEN coalesce(e.consecutive_zero_days,0) ELSE 0 END consecutive_zero_days,
 coalesce(e.left_censored,false) zero_episode_left_censored
 FROM pairs p JOIN tiers t USING(location_id,product_id) LEFT JOIN latest i USING(location_id,product_id)
 LEFT JOIN daily d ON d.location_id=p.location_id AND d.product_id=p.product_id AND d.business_date=(SELECT observation_date FROM cfg)
 LEFT JOIN coverage q ON q.location_id=p.location_id AND q.product_id=p.product_id
 LEFT JOIN stockout_episode e ON e.location_id=p.location_id AND e.product_id=p.product_id AND e.last_zero_date=(SELECT observation_date FROM cfg)
)
SELECT *,CASE WHEN NOT eligible THEN 'not_applicable' WHEN on_hand IS NULL THEN 'unknown_inventory'
 WHEN on_hand=0 THEN 'reported_zero_on_hand' ELSE 'positive_reported_inventory' END current_state,
 eligible AND on_hand=0 reported_zero_on_hand,
 CASE WHEN promised_due THEN CASE WHEN on_hand IS NULL THEN 'unknown' WHEN on_hand=0 THEN 'confirmed_zero'
 ELSE 'stocked' END ELSE 'not_due' END distribution_state
FROM observations;

CREATE TEMP TABLE distribution_summary AS
SELECT d.grain,d.scope_id,d.scope_name,s.product_id,
 count(*) FILTER(WHERE promised_due)::BIGINT promised_stores,
 count(*) FILTER(WHERE distribution_state='stocked')::BIGINT stocked_stores,
 count(*) FILTER(WHERE distribution_state='confirmed_zero')::BIGINT confirmed_zero_stores,
 count(*) FILTER(WHERE distribution_state='unknown')::BIGINT unknown_stores,
 count(*) FILTER(WHERE distribution_state IN ('confirmed_zero','unknown'))::BIGINT unconfirmed_stores
FROM current_store s JOIN dimensions d USING(location_id,product_id) GROUP BY ALL;

CREATE TEMP TABLE checks_raw AS
SELECT location_id,product_id,'reported_zero_on_hand' check_code,
 'Latest closed report has zero stock; shelf availability is not observed.' explanation
 FROM current_store WHERE reported_zero_on_hand
UNION ALL SELECT location_id,product_id,'inventory_unknown',
 'Inventory is missing or stale; this is not a confirmed stockout.' FROM current_store WHERE eligible AND on_hand IS NULL
UNION ALL SELECT location_id,product_id,'promised_distribution_gap',
 'Promised distribution is due, but this store reports zero inventory.' FROM current_store WHERE distribution_state='confirmed_zero';

INSERT INTO checks_raw
SELECT location_id,product_id,'sales_coverage_low','Recent eligible sales coverage is below the configured minimum.'
FROM current_store WHERE eligible AND recent_sales_coverage<(SELECT minimum_coverage FROM cfg)
UNION ALL
SELECT location_id,product_id,'inventory_coverage_low','Recent eligible inventory coverage is below the configured minimum.'
FROM current_store WHERE eligible AND recent_inventory_coverage<(SELECT minimum_coverage FROM cfg);

CREATE TEMP TABLE checks AS
SELECT c.*,s.location_name,s.product_name,s.source_location_id,s.source_product_id
FROM checks_raw c JOIN current_store s USING(location_id,product_id);
"""

WEEKDAY = """
CREATE TEMP TABLE metric_weekday AS
WITH rates AS (
 SELECT d.grain,d.scope_id,d.scope_name,s.product_id,s.weekday,
 count(*) FILTER(WHERE s.eligible)::BIGINT expected_days,
 count(*) FILTER(WHERE s.sales_valid)::BIGINT sales_days,
 sum(s.units) FILTER(WHERE s.sales_valid)::DOUBLE units,
 sum(s.units) FILTER(WHERE s.sales_valid)/nullif(count(*) FILTER(WHERE s.sales_valid),0) weekday_rate
 FROM daily s JOIN dimensions d USING(location_id,product_id)
 WHERE s.business_date BETWEEN (SELECT weekday_end-55 FROM cfg) AND (SELECT weekday_end FROM cfg)
 GROUP BY ALL
), totals AS (
 SELECT *,sum(weekday_rate) OVER w total_rate,
 count(weekday_rate) OVER w weekdays_observed FROM rates
 WINDOW w AS (PARTITION BY grain,scope_id,product_id)
)
SELECT * EXCLUDE(total_rate,weekdays_observed),
 sales_days::DOUBLE/nullif(expected_days,0) sales_coverage,
 CASE WHEN weekdays_observed=7 AND total_rate>0 AND min(sales_days) OVER w>=(SELECT minimum_weekday_observations FROM cfg)
 AND min(sales_days::DOUBLE/nullif(expected_days,0)) OVER w>=(SELECT minimum_coverage FROM cfg)
 THEN weekday_rate/total_rate END weekday_share,
 CASE WHEN weekdays_observed=7 AND total_rate>0 AND min(sales_days) OVER w>=(SELECT minimum_weekday_observations FROM cfg)
 AND min(sales_days::DOUBLE/nullif(expected_days,0)) OVER w>=(SELECT minimum_coverage FROM cfg)
 THEN 7*weekday_rate/total_rate END weekday_index,
 CASE WHEN weekdays_observed<7 THEN 'missing_weekday_exposure' WHEN total_rate<=0 OR total_rate IS NULL
 THEN 'nonpositive_total_rate'
 WHEN min(sales_days) OVER w<(SELECT minimum_weekday_observations FROM cfg)
 OR min(sales_days::DOUBLE/nullif(expected_days,0)) OVER w<(SELECT minimum_coverage FROM cfg)
 THEN 'insufficient_evidence' ELSE 'observed' END pattern_status FROM totals
 WINDOW w AS (PARTITION BY grain,scope_id,product_id);
"""
