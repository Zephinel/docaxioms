# Guide

For whoever works in a project that uses docaxioms, a person or a model. Every rule here names the axioms it follows from ([`AXIOMS.lock.md`](AXIOMS.lock.md)). The project's profile, `docaxioms.json` at its root, says where it keeps each thing named here. The files in this folder are copies of docaxioms, pinned: change them there, never here (A4).

## Before work

Read the axioms, then the stage card, then what the index leads to for the task. Leave history alone unless you trace why something was decided (A3). Take every claim for what it is: a record, a norm, a description or a plan (M1).

## Which document owns what

| What changed | Update | How |
|---|---|---|
| The owner decided something | The passage it changes, then the decisions | First the passage, naming the decision's id; then a row: id, what was asked, what was decided in the owner's words, status, landing. Only what the owner decided (A0) |
| A decision is overturned | The status of the old row | `superseded by <id>`, or `partly superseded (<what> by <id>)`. The old text stays (A5) |
| How something behaves | The one document that describes it | In the same task as the change (A2). State what is now; if a passage must mention past behaviour, mark it as a record where it mixes, or keep past changes in decisions or history (M1, A3) |
| A limit that is known | The document of limits or design | Not the plan, which holds only what is to be done (M1) |
| A step is finished | The log | One short entry under the date; what was run and what was not (A1) |
| Something is to be done | The plan | One item; its research links back to it |
| Research for an open item | The research folder | `Status: open (<item>)` under the title |
| An item is done or dropped | The plan, then its research | Delete the item; move what is still true to its owner; move the research to history |
| What is active, what is next | The stage card | Rewrite it, short: no commit ids, counts or ranges that another document owns (A4) |

## Retire a document

When it stops describing the present: move what is still true to its owner, move the file to history, put the banner under its title with where the present is described, and fix what pointed at it. Look at who cites it first: an old document can still be the authority. After that it is a record: only a link target may change, and an erratum with its date may be added at its end (A5).

## Code pins, review aids, and gardening

- **Code pins** (A2, A6, A7): where a description depends on a specific source slice, anchor it with an invisible comment `<!-- pin: path/to/file#Lstart-Lend@hash -->` (or `<!-- pin: path/to/file@hash -->` for a whole file; paths resolve from the repository root unless prefixed with `./` or `../`). Any mismatch fails the hard gate (A6), including shifted lines: if an identical hash exists at a unique new line range, the gate names the move and `docaxioms pin --relocate` updates only the line numbers without altering hashes. When pinned content itself changes, review the passage against the code and refresh explicitly with `docaxioms pin --write --file <doc>` (or `--pin <doc:line>`), which prints the newly covered lines for verification.
- **Review aids** (M2, A6, A7): checks at level `aid` (such as `codeToDocs` reminders and opt-in evolutionary phrasing hints) report findings and counts without failing the gate. Measure their signal on the project before promoting any rule to a gate.
- **Notes** (A6): when a check, gate or aid, cannot compare as configured (for instance, a missing comparison base), it prints a note stating what it did not compare, and shows `note` instead of `ok`. A note is not a finding and does not fail; read it, because a check with a note held less than its name says.
- **Periodic gardening** (A0, A1, A6): mechanical checks do not prove that prose matches behaviour. Run `docaxioms garden` and follow [`GARDEN.md`](GARDEN.md) for a read-only audit of current descriptions and the stage card.

## Accept a change

- The check passes: `docaxioms check`, on every documentation commit and before a push. Where code and its documentation are separate commits, it is the pair that must pass.
- What changed was read against its owner. No check holds that a description is right, that a decision was really the owner's, or that a landing says the right thing (A6).
- A link leads to a file in the repository: from its document, or from the repository root when it starts with `/` (A2, A4).
- From the entry point, a reader finds what the software does now without opening research or history (A3).
- Entry documents stay concise routing maps (M4): put detail in dedicated documents and link to them.

When an item closes, look through the documents it touched for what is false, broken, said twice, or finished. Verify each finding against the code before you change anything (A0, A1).

## A new rule or check

Name the axioms it follows from. Make it a failing check (`gate`) only when what it evaluates is the property itself and it is precise; otherwise start it as a review aid (`aid`) and count what it reports on the real project first (A6, A7, M2). Give it its own seeded fault: a check that was never seen to fail proves nothing.

## The profile

Every key is optional; a check with nothing to look at passes. A key not in this table, or a value of the wrong kind, fails the check, because a misspelt key would turn its check off unseen (A6); a project's own keys, for its project checks, start with `x-`.

| Key | What it says |
|---|---|
| `core` | `dir`, `source`, `version`, `commit`, `files` (name to hash): written by docaxioms, not by hand |
| `entries`, `reachable` | Where readers enter; the pattern of documents that must be reachable from there |
| `codeExtensions`, `ignore` | What is code; folders to leave out |
| `decisions` | `file`, `id` (the prefix, such as `ADR-`), `landedSection` (the heading from which rows have a status and a landing; none: all), `citeExempt` |
| `log` | Dated log file(s) of finished steps (K1 records; excluded from K3 description checks and gardening) |
| `sections` | Citations of numbered sections in code: `cite`, `files`, `document`, `rowTables` |
| `pathPrefixes`, `pathExempt`, `gonePaths` | Paths named in documents that must exist; documents that may name other projects' paths; paths named as gone, which must stay gone |
| `codeDocExempt` | Code that may name documents that are not there |
| `commands` | Documented command checks on descriptions: `{ prefix, jsonFile, key }` or `{ prefix, makefile }` or `{ prefix, list }`, with optional `exempt`; only text that starts with the prefix is checked, and its first word that is not an option names the command |
| `research` | `dir`, `items` (the document of open items), `openUntil` (the heading where open items end) |
| `history` | `dir`, `banner`, `erratum` (the heading of an erratum, before its date), `base` (the branch to compare with) |
| `card` | `file`, `maxLines`, `maxChars` |
| `budgets` | Size limits for entry or current documents: `[{ files, maxLines, maxChars, exempt }]` |
| `codeToDocs` | Review aid (M2) mapping code globs to current documents: `[{ code, docs, base }]` |
| `evolutionary` | Opt-in review aid (M2) flagging unmarked past-tense transition phrases in descriptions: `{ phrases, exempt }` |
| `garden` | Gardening scope options: `{ exempt }` |
| `projectChecks` | A module whose default export is a list of `{ name, axioms, level?, run(project) }`: what only this project can check |
