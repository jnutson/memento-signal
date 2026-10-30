# Demo 1 — original UI restoration

The user identified that the first hosted Demo 1 used the wrong interface. The
matching interface was already present on `origin/codex/connected-demo-insight-details`
at `c4555ba`. The implementation restores that source rather than recreating the
screenshot in a second visual system. The former main working tree is preserved.

The original `ReimaginedView.tsx` is unchanged. The original Explore/search header,
financial tiles, attention timeline, insight cards, weekly-report dialog, investigation,
and evidence/details views remain. Start and Restart wrap that interface. Restart
uses a fresh document navigation and clears only this demo's browser-session notes.

The screenshot's mock milk numbers and holiday explanation are not copied into the
connected data. The hosted fixture is the branch's existing synthetic one-item,
four-store fixture, published through its real deterministic metric backend. It
naturally includes availability, excess, and sustained-outperformance findings.
The frozen API exports whole validated responses, including separate member-level
attention valuations for each finding, so detail ledgers reconcile with the overview.
It performs no browser-side metric or ranking replacement.

## Checks

- Frontend: 68 unit tests passed, including the original layout/style preservation
  test. TypeScript, ESLint, Prettier and the production build passed.
- Five existing connected browser tests passed against the real Python/Parquet API.
- Hosted-mode browser test passed: original header and timeline, weekly report,
  all three outcome lenses, detail tables, restart from a detail, and separate sessions.
- Python typecheck passed. Runtime and development dependency audits are clean with
  zero exceptions; Next.js/eslint-config-next 16.4.3 and Zod/Vitest security fixes
  remain in place.
- The restored branch's unchanged Python suite reports 201 passing, two skipped and
  15 failures on exact floating-point assertions (for example 18.000000000000007
  compared with 18). The failures reproduce with the branch's locked environment.
  Metric logic and those tests were not changed or relaxed for this UI restoration.
  A full-repository passing gate is therefore not claimed.

## Release boundary

Only this named synthetic demo is hosted. `memento-os`, customer data, source
extracts, and Vercel access controls are unchanged. The deployment archive includes
only the required demo pages, application modules, and the frozen synthetic result
bundle. Unrelated prototype routes, secrets, local authentication state and raw
Parquet are excluded. Publication remains manual.

## Published restoration

- Production status: READY.
- Stable URL: https://demo-1-omega-ten.vercel.app.
- Deployment: `dpl_K27DVSdRHoNaQmkY8F1HoyA3QnUJ`.
- Exact origin: https://demo-1-igblxkbi3-memento-loop.vercel.app.
- Source application commit: `0ba536a`, branch `codex/demo-1-original-ui`.
- Uploaded source fingerprint: `7babece3e6ce24477077f731e9dedfa74e643f4a061783e1ec19060fc83a4e5b`.
- Frozen metric release: `met_343358122db25f35be6a9d5ba8392c5a3740f9022f80cc8e96b70831965f1ea0`.

Authenticated live metadata returned HTTP 200 and the exact release above. The live
browser check passed across the original interface, weekly report, all three outcome
lenses, member-detail tables, restart and independent sessions. A post-deploy error
scan returned zero error records. Existing Vercel sign-in protection remains intact.
