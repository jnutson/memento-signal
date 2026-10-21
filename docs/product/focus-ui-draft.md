# Focus UI draft

Open `/draft` on the local web app. This is an alternative interface concept using
the current validated signal API. The existing Monday, Attention, and Reports
routes remain available through the draft's Original demo link.

The draft organizes information into successive decisions:

1. The weekly briefing recommends the first published priority and initially shows
   three more signals. Outcome lenses narrow the remaining published queue without
   reranking it. Economic bases remain distinct.
2. A signal room explains the risk or opportunity in plain language. Impact,
   urgency (or legacy actionability), and confidence retain their published values.
   Each dimension can be expanded, and dollar metrics reveal their calculation on
   hover, focus, or tap.
3. The response layer offers choices tailored to availability, accelerating demand,
   slowing demand, or inventory exposure. A choice and optional note become a local
   follow-through card with a question to revisit seven days after recording it.
4. The evidence layer loads release-matched calculation evidence on demand. A date
   scrubber, calculation, supply assumptions, full ledger, and lineage provide
   progressively more detail.

The analytical commentary is deterministic draft copy. No model API is called.
Follow-through is a versioned, schema-validated browser-local mock; it does not
execute orders, share decisions, or measure outcomes. A later published snapshot is
required to assess a result. The draft introduces no new backend or datastore.

Keyboard navigation, browser back/forward, persistent home navigation, responsive
layouts, and reduced-motion preferences are supported. Browser tests cover all four
outcome directions, deferred evidence loading, the ledger, response persistence,
and mobile navigation.
