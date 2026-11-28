# docaxioms

[![npm](https://img.shields.io/npm/v/docaxioms)](https://www.npmjs.com/package/docaxioms) [![check](https://github.com/Zephinel/docaxioms/actions/workflows/check.yml/badge.svg)](https://github.com/Zephinel/docaxioms/actions/workflows/check.yml) [![licence](https://img.shields.io/npm/l/docaxioms)](LICENSE) [![node](https://img.shields.io/node/v/docaxioms)](package.json)

**Checks a project's documentation against its code: it fails on broken links and anchors, stale code pins, decisions without a landing, and documents over budget.**

> **Status**: pre-release (`0.x`); commands and profile keys may still change. This README describes `main`, which can be ahead of the npm package; installing from GitHub gets `main`.

## Use it in a project

Needs Node 22 or later; the project's own code may be in any language. Projects pin only the pure-text specification from `core/` and run the checks through this CLI.

```bash
npm install --save-dev docaxioms   # or: npm install --save-dev github:Zephinel/docaxioms
npx --no-install docaxioms init .
npx --no-install docaxioms check
```

`init` writes `docaxioms/` (the pinned specification), `docaxioms.json` (the profile) and the starter documents it does not find, among them `CLAUDE.md` holding only `@AGENTS.md`, for a tool that reads that name: a bridge, not a dependency. `check` prints one line per check and exits 1 when a gate fails, for example after a broken link:

```text
ok   core files are the pinned version (A4, A6)
FAIL links and anchors resolve (A2, A4): 1
       CURRENT.md: docs/design.md leads to a file that does not exist
...
```

Each check names, in brackets, the axioms it follows from: a few statements that do not go stale ([`core/AXIOMS.lock.md`](core/AXIOMS.lock.md)). A check is a precise gate or an advisory review aid. No check holds that prose is right; [`GARDEN.md`](core/GARDEN.md) is the read-only audit for that.

| Command | What it does |
|---|---|
| `check` | Runs every check; exits 1 on a failing gate. `--strict-aids` also fails on review aids; `--report` does not fail on findings (errors still exit 1) |
| `pin` | Lists code pins that no longer match; `--relocate` and `--write` update them (see code pins below) |
| `garden` | Lists current descriptions, the stage card, their pins and mapped code, for the audit |
| `init <dir>` | Sets up a project; never overwrites its files |
| `update <dir>` | Brings the pinned specification up to date; refuses changed axioms without `--accept-axioms`, which needs the owner's explicit word |

`check`, `pin` and `garden` take `--root <dir>`; `check` and `garden` also take `--json`. A project pins the CLI version and the SHA-256 of each file in `core/`; a local edit, or a CLI of another version, fails the check. When the CLI runs from a git checkout of docaxioms, its commit is pinned and compared too.

### Profile checks

- **Code pins (`gate`):** a comment such as `<!-- pin: path/to/file#L10-L30@<hash> -->` anchors a passage to the code it describes. Any mismatch fails, shifted lines included: `pin --relocate` fixes a shift, `pin --write --file <doc>` re-pins after review ([the guide](core/GUIDE.md#code-pins-review-aids-and-gardening)).
- **Code-to-docs mapping (`aid`):** `codeToDocs` globs flag documents left untouched when mapped source files change in git.
- **Budgets (`gate`):** `budgets` (and `card`) cap entry documents such as `AGENTS.md` and the stage card `CURRENT.md`.
- **Commands (`gate`):** `commands` checks backticked commands in current descriptions against a JSON file's keys (such as `package.json` scripts), a `Makefile`, or a list.
- **Project checks:** `projectChecks` names a module whose default export is a list of `{ name, axioms, level?, run(project) }`.

Every key is in [the profile](core/GUIDE.md#the-profile).

### Run the check

`docaxioms check` exits 1 when a gate fails, so any tool can call it; nothing calls it for you. From the strongest hold to the weakest:

- **A required CI check.** Run the command in your CI and require it for merging. It holds for the revision CI tested. Fetch enough history for the comparison base (`history.base`, `codeToDocs`); without it those checks compare with HEAD only and print a note saying so. On the base branch itself, such as a push to `main`, the base is HEAD, so they compare nothing committed: they hold on pull requests.
- **The project's verify command.** Call it from the task that people and agents already run (`npm run check`, `make check`, …), so that any agent following `AGENTS.md` runs it too.
- **A local hook, optional.** Prefer `pre-push` to `pre-commit`: code and its documentation may be separate commits, and it is the pair that must pass. It is a reminder, not a gate: clones do not get it, `--no-verify` skips it, and `check` reads the working tree, not what is staged.

Never enforce with `--report`. Without a local install, `npx --no-install` can run a global or cached copy: the check fails if its version differs from the pinned one, not if only its build does.

### Protect the axioms

`init` makes `AXIOMS.lock.md` read-only, and the check fails when it no longer matches its hash in `docaxioms.json`. That stops an accidental edit, not a deliberate one: changing the file and its hash together passes, and git does not keep the read-only mode. For a stronger hold, use what your tools offer and say in the project what it does not hold, for example:

- an owner review rule on `docaxioms/` and `docaxioms.json`, such as a code owners file on your host: it covers the file and its hash;
- your agent's file permissions on the file itself, such as a Claude Code deny rule `Edit(**/AXIOMS.lock.md)` in `.claude/settings.json`; it does not stop shell commands or an edit of the hash.

## Work on docaxioms

```bash
git clone https://github.com/Zephinel/docaxioms.git
cd docaxioms
npm ci
npm run check
```

While docaxioms is in development, `npm run check` runs the tests, which hold this repository's links, paths, commands and axiom pin, then prints the rest of its own check as a report; CI runs it on every pull request and it must pass to merge. Agents start from [`AGENTS.md`](AGENTS.md). A change to `core/AXIOMS.lock.md` follows that file's own "Changing this file" and updates its pin in `docaxioms.json` in the same commit.

| Part | What it is |
|---|---|
| [`core/`](core) | The specification projects pin: the axioms, [`GUIDE.md`](core/GUIDE.md), [`GARDEN.md`](core/GARDEN.md), and licence |
| [`bin/docaxioms.mjs`](bin/docaxioms.mjs) | The CLI |
| [`src/`](src) | The engine: checks, pins, gardening, `init` and `update`; also the package's export |
| [`templates/`](templates) | Starter documents, the `CLAUDE.md` bridge, and the profile |
| [`test/`](test) | Seeded faults on a Python fixture, plus init, update, pin and aid tests |
| [`docs/decisions.md`](docs/decisions.md) | What the owner decided about docaxioms; its ids, statuses and landings are in the check's report |

## Licence

[MIT](LICENSE).
