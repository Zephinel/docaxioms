# For agents

Read [`core/AXIOMS.lock.md`](core/AXIOMS.lock.md), [`core/GUIDE.md`](core/GUIDE.md), [`core/GARDEN.md`](core/GARDEN.md), and [`README.md`](README.md). The axioms file is locked (AD-1).

- This repository is the source of the pure-text specification that other projects hold as a pinned copy, so nothing in `core/` may name a project, a tool, a path of one, or a language; a test holds that for the words it lists (AD-2, AD-3, AD-4).
- `npm run check` must pass before a commit.
- Of this repository's own check, only its links, paths, commands and axiom pin block a merge, held by a test; findings of the rest are a report, though an error running it still fails (AD-7).
- Decision rows here summarise instead of quoting the owner's words, except for a change to the axioms; that overrides GUIDE's "in the owner's words" in this repository only (AD-6).
