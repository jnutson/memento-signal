import { expect,test } from "@playwright/test";
import { investigationDetail,investigationFor,investigationQueue,investigationSignals } from "../investigation-fixtures";

for(const signal of investigationSignals){
  test(`linked ${signal.signal_direction} situation, explanation, weekly and daily ledger`,async({page})=>{
    await page.route("**/api/signals",route=>route.fulfill({json:investigationQueue}));
    await page.route("**/api/signals/sig_*",route=>route.fulfill({json:investigationDetail(signal)}));
    let requests=0;
    await page.route("**/api/signals/*/investigation?*",route=>{requests++;return route.fulfill({json:investigationFor(signal)});});
    await page.goto(`/attention?signal=${signal.signal_id}`);
    await expect(page.getByRole("button",{name:"1. Situation",exact:true})).toHaveAttribute("aria-current","step");
    const title=signal.signal_type==="demand_momentum"?"Demand divergence":signal.signal_type==="availability"?"Inventory runway":"Inventory versus target";
    const selector=page.getByRole("combobox",{name:`Inspect ${title} date`});
    await selector.selectOption({index:2});
    await expect(page.getByRole("button",{name:"2. Explanation",exact:true})).toHaveAttribute("aria-current","step");
    if(signal.signal_type==="demand_momentum")await expect(page.getByRole("table",{name:"Demand persistence"})).toBeVisible();
    await page.getByRole("button",{name:"Show numbers →",exact:true}).click();
    await expect(page.getByRole("table",{name:"Weekly investigation ledger"})).toBeVisible();
    await page.getByRole("button",{name:/Expand week.*actual/}).first().click();
    await expect(page.getByRole("table",{name:"Daily investigation ledger"})).toBeVisible();
    await page.getByRole("table",{name:"Daily investigation ledger"}).getByRole("button").nth(1).click();
    await expect(page.getByRole("table",{name:"Daily investigation ledger"}).locator('tr[data-selected="true"]')).toHaveCount(1);
    await page.getByRole("button",{name:"← Back one layer"}).click();
    await expect(page.getByRole("button",{name:"2. Explanation",exact:true})).toHaveAttribute("aria-current","step");
    await page.getByRole("button",{name:"← Attention queue"}).click();
    await page.getByRole("button",{name:"Feed",exact:true}).click();
    await expect(page.getByRole("region",{name:"Attention feed"})).toBeVisible();
    expect(requests).toBe(1);
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:new RegExp(`^#${signal.overall_rank_position} ·`)}).click();
    await expect(page.getByRole("button",{name:"2. Explanation",exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}

test("release conflict requires reload instead of silently showing stale charts",async({page})=>{
  const signal=investigationSignals[0];
  await page.route("**/api/signals",route=>route.fulfill({json:investigationQueue}));
  await page.route("**/api/signals/sig_*",route=>route.fulfill({json:investigationDetail(signal)}));
  await page.route("**/api/signals/*/investigation?*",route=>route.fulfill({status:409,json:{code:"release_changed"}}));
  await page.goto(`/attention?signal=${signal.signal_id}`);
  await expect(page.getByRole("button",{name:"Reload Attention"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Inventory runway"})).toHaveCount(0);
});
