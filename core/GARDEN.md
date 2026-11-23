# Gardening protocol

A read-only audit procedure for checking current descriptions (K3) and the stage card against the software as it is now. Derived from [`AXIOMS.lock.md`](AXIOMS.lock.md): A0 (authority vs behaviour), A1 (scoped evidence), A2 (dependence), A3 (finite attention), A5 (immutable records), A6 (limits of mechanical gates), M1 and M2.

## When to run

- After a significant refactor or release.
- When `docaxioms check --report` surfaces review aids (`codeToDocs` or opt-in evolutionary phrasing).
- Periodically, on a schedule or before a major planning cycle.

## Scope and boundaries

- **Audit only K3 descriptions and the stage card.** Leave `AXIOMS.lock.md`, active owner decisions (K2), dated logs (K1), and the history folder (K1) untouched unless reporting a contradiction to the owner (A0, A5).
- **Never guess behaviour from prose.** Verify every claim against source code, tests, or a dated run (A0, A1).
- **Never silently change intent.** When code and an owner decision disagree, report the discrepancy as a defect to resolve with the owner; do not rewrite the decision to match the code (A0).

## Steps

1. Run `docaxioms check --report` and `docaxioms garden` to list every K3 description, the stage card, sizes, code pins, and mapped source paths.
2. For each listed document, extract its concrete claims: behaviour, defaults, boundaries, paths, commands, and limits.
3. Compare each claim against the current code and recent test runs (A1).
4. Classify each finding into one of four buckets:
   - **False**: contradicts current code or test assertions (state the file, line, and observed behaviour).
   - **Stale**: names a removed/renamed concept, outdated default, or broken pin (A2).
   - **Unmarked history**: narrates past behaviour inside a K3 description without marking it as a record or moving it to decisions or history (M1, A3).
   - **Duplicated**: repeats a fact already owned by another document or generated artefact (A4, M3).
5. Produce a short, dated drift report grouped by document, citing exact source files and line ranges.
6. Only after findings are verified (and any intent conflicts are decided by the owner): update the K3 descriptions, run `docaxioms pin --relocate` for unchanged shifts or `docaxioms pin --write --file <doc>` for reviewed changes, and finish with `docaxioms check`.
