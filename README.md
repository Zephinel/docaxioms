# agentic-docs

A documentation system for software projects, derived from axioms instead of habits.

Documents are copies of one moment, and a reader who starts without memory, such as a model in a new context, has nothing else. So the rules here are derived from a few statements that do not go stale ([`core/AXIOMS.lock.md`](core/AXIOMS.lock.md)), every rule names the axioms it follows from, and what can be held by a precise check is.

| Part | What it is |
|---|---|
| [`core/`](core/GUIDE.md) | What every project holds, the same in each: the axioms, the guide, and the check (Node, no dependencies; the project's code may be in any language) |
| [`agentic-docs.mjs`](agentic-docs.mjs) | Brings the core into a project and keeps it up to date |
| [`templates/`](templates/AGENTS.md) | Starter documents and profile; what a project already has is never overwritten |
| [`test/`](test/check.test.mjs) | Each check catches its own seeded fault on a project unlike any other, and lets the legitimate changes pass |
| [`docs/decisions.md`](docs/decisions.md) | What the owner decided about agentic-docs itself, which is checked by its own check |

## Use it in a project

```bash
git clone https://github.com/Zephinel/agentic-docs.git
node agentic-docs/agentic-docs.mjs init <project>      # the core, agentic-docs.json, starter documents
cd <project> && node agentic-docs/check.mjs       # --report lists problems without failing
```

Later, from an up to date checkout: `node agentic-docs.mjs update <project>`. A project pins a commit and the SHA-256 of each core file, and its check fails on a local edit: a change belongs here first. When the axioms themselves changed, `update` refuses without `--accept-axioms`, which needs the word of that project's owner.

A project's own checks go in a module named by `projectChecks` ([the profile](core/GUIDE.md#the-profile)). Protect the axioms from edits with what your tools offer, and say in the project what that does not hold (A6). For Claude Code: `"deny": ["Edit(**/AXIOMS.lock.md)"]` in `.claude/settings.json`; shell commands are not held by it.

## Work on agentic-docs

`npm run check` (run on Node 22.18 and 24.19). A change of the axioms needs the owner's explicit word, a decision that quotes it, and the new pin in `agentic-docs.json`, in one commit.

## Licence

[MIT](LICENSE).
