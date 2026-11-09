# Agent delivery

The repository workflows are user-invoked: `$questions` and `$explorer` are read-only;
`$planner` produces a bounded handoff; `$builder` implements accepted scope; and
`$reviewer` performs an independent review-and-correction pass.

Before handing off a draft pull request, use a clean task branch and run:

```bash
make verify
make delivery-ready VERIFICATION=full
make delivery-pr-check
```

`delivery-ready` writes an ignored receipt below `.memento/delivery/`.
`delivery-pr-check` verifies that the receipt matches the current branch and exact
HEAD. Neither command deploys, migrates, merges, or changes GitHub state.

There is no production deployment or persistent operational database configured by
this repository. Any future deployment, migration, access-control change, or customer-
data use requires separate explicit approval.
