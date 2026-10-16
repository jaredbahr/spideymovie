# Contributor and agent guidance

## GitHub usage: no additional fees

Jared's policy is to avoid additional GitHub charges. Prefer local validation.
Before an operation that could consume metered GitHub services, verify that it
uses free service or fits the account's remaining included allowance. If new
fees are possible or the remaining allowance is unknown, stop and ask Jared
with the proposed operation, expected usage and uncertainty. Do not treat
routine publication approval as permission to incur fees. These instructions
are not an account-level spending cap.

- Inspect the actual head and target workflows and triggers before a push or
  PR, including reusable workflows, PR events, Pages builds and release hooks.
  A docs-only change or draft PR can still start jobs. Preserve a local patch
  for review when publication cannot be verified safe; do not add skip directives
  or disable checks to publish it.
- Run targeted local checks first, then the repository's required validation.
  Record the exact tested SHA, commands, results and limitations; distinguish
  later documentation commits from tested code. Keep required tests, security
  checks and release gates intact. A local pass never substitutes for a required
  hosted check; report a cost blocker instead of bypassing it.
- Batch coherent changes after local review. Reuse valid evidence for the same
  SHA, check for in-flight runs before requesting work, and avoid duplicate CI,
  gratuitous pushes, manual dispatches and reruns. Retry only a failed job with
  a diagnosed cause and justified retry; the fee/allowance check still applies.
- Report gross usage separately from included/free usage and net billed cost,
  with the billing period and source. Unknown cost is not zero. Standard hosted
  runner compute in public repos is generally free; this does not make every
  GitHub product free. Check larger runners, artifact/cache storage, Packages,
  LFS, Codespaces and paid review/AI usage separately against current terms.
  See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- Do not change budgets, spending limits, branch protection, required checks,
  workflow definitions, runner configuration or credentials to save cost without
  separate authorization. Do not merge just to deliver this documentation.

Read `README.md` and open `index.html` locally for playback checks. Its `node generate-visuals.mjs --dry-run` previews prompts; actual image generation uses a paid external API and requires separate authorization. No automated test/package command is defined in this snapshot.
