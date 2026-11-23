# docaxioms

A documentation system for software projects, derived from axioms instead of habits.

Documents are copies of one moment, and a reader who starts without memory, such as a model in a new context, has nothing else. So every rule here is derived from a few statements that do not go stale ([`core/AXIOMS.lock.md`](core/AXIOMS.lock.md)), names the axioms it follows from, and separates precise hard gates (`gate`) from advisory review aids (`aid`, M2).

| Part | What it is |
|---|---|
| [`core/`](core/GUIDE.md) | Pure-text specification pinned in every project: the axioms, [`GUIDE.md`](core/GUIDE.md), [`GARDEN.md`](core/GARDEN.md), and licence |
| [`bin/docaxioms.mjs`](bin/docaxioms.mjs) | CLI (`check`, `pin`, `garden`, `init`, `update`) |
| [`src/`](src/index.mjs) | Check engine built on `remark` (CommonMark + GFM), `github-slugger`, and `picomatch` |
| [`templates/`](templates/AGENTS.md) | Starter documents, multi-agent bridge (`CLAUDE.md`), and profile; existing project files are never overwritten |
| [`test/`](test/check.test.mjs) | Seeded-fault portability suite on a Python fixture plus init/update/pin/aid tests |
| [`docs/decisions.md`](docs/decisions.md) | What the owner decided about docaxioms itself, verified by its own check |

## Use it in a project

`docaxioms` runs as a Node CLI package (**requires Node >= 22** and the installed package; the project's own code may be in any language, A6), while consumer projects pin only the pure-text specification files from `core/` (`AD-4`). Install it from GitHub. Its name is `docaxioms` (`AD-5`); projects set up under the earlier name `agentic-docs` (an `agentic-docs.json` profile) are not read, so set them up again with `init`:

```bash
npm install --save-dev github:Zephinel/docaxioms
npx --no-install docaxioms init .             # pins core/ into docaxioms/, writes starter docs & docaxioms.json
npx --no-install docaxioms check              # fails on hard gates; prints review aids without failing
npx --no-install docaxioms check --report     # prints all gates and aids, always exits 0
npx --no-install docaxioms check --strict-aids # fails on review aids too
npx --no-install docaxioms pin                # lists shifted, stale, or uninitialized <!-- pin: ... --> anchors
npx --no-install docaxioms pin --relocate     # updates shifted line numbers when pinned content is unchanged
npx --no-install docaxioms pin --write --file docs/design.md  # refreshes hashes for reviewed docs (or --pin <doc:line>)
npx --no-install docaxioms garden             # lists K3 descriptions, stage card, pins and mapped code
```

To update the pinned specification after upgrading the package: `npx --no-install docaxioms update .`. A project pins the CLI version (plus commit when installed from git) and the SHA-256 of each file in `core/`; local edits or CLI/spec version mismatches fail the check. When the axioms change, `update` refuses without `--accept-axioms`, which requires the project owner's explicit word (A0).

### Code drift anchoring and review aids

- **Exact code pins (`gate`, A2, A6, A7):** embed an invisible HTML comment anywhere in a Markdown document:
  `<!-- pin: src/auth.ts#L10-L30@a1b2c3d4e5f6 -->` (paths resolve from repo root, or relative with `./`/`../`). Any mismatch fails the gate, including shifted lines: when an identical hash moves to a unique line range, `pin --relocate` updates only the line numbers without changing hashes. When pinned content changes, review the passage against code and re-pin with `pin --write --file <doc>` (prints the newly covered lines for verification).
- **Code-to-docs mapping (`aid`, A2, A6, M2):** configure `codeToDocs` globs in `docaxioms.json` to flag untouched documents when mapped source files change in git (prints a separate note if the configured git base is unavailable, without counting it as a finding).
- **Progressive disclosure budgets (`gate`, A3, M4):** configure `budgets` (and `card`) to cap entry routing maps (`AGENTS.md`) and stage cards (`CURRENT.md`).
- **Command validation (`gate`, A2, A7):** configure `commands` to check backticked commands in K3 descriptions against `package.json` scripts, a `Makefile`, or an explicit list.
- **Project-specific checks:** point `projectChecks` at a module exporting `{ name, axioms, level?, run(project) }` ([the profile](core/GUIDE.md#the-profile)).

### Multi-agent bridge and axiom protection

Keep `AGENTS.md` as the single source of truth (M3). For tools that read another filename, bridge instead of copying — `init` creates `CLAUDE.md` containing only `@AGENTS.md`.

Protect `AXIOMS.lock.md` with the mechanisms your environment offers and document what they do not hold (A6):

- **Claude Code** (`.claude/settings.json`; does not block shell commands):
  `"permissions": { "deny": ["Edit(**/AXIOMS.lock.md)", "Write(**/AXIOMS.lock.md)"] }`
- **Git pre-commit hook** (`.git/hooks/pre-commit`):
  `npx --no-install docaxioms check`
- **GitHub Actions** (`.github/workflows/docs.yml`):
  run `npx --no-install docaxioms check` on every pull request.

## Work on docaxioms

`npm run check` (Node 22+). A change to `core/AXIOMS.lock.md` requires the owner's explicit word, a decision quoting it, and the updated pin in `docaxioms.json`, in one commit.

## Licence

[MIT](LICENSE).
