# Decisions

<a id="the-owners-words"></a>What the owner decided about docaxioms. Each row states the decision in summary; the owner's words are not published and are kept where each was decided (AD-6). The exception is a decision that changes `core/AXIOMS.lock.md`: its row quotes the owner's word, as that file requires.

| Id | What was asked | What was decided | Status | Landing |
|---|---|---|---|---|
| AD-1 | What the documentation system is built on | Principles that do not go stale and need no proof, taken as axioms and made hard gates; the structure, and the standards for updating and accepting documents, are derived from them. The axioms are a read-only lock file (2026-11-23) | active | [AGENTS.md](../AGENTS.md) |
| AD-2 | Whether it is for one project | Portable: other software projects use it as it is, the axioms too, without designing it again (2026-11-23) | active | [AGENTS.md](../AGENTS.md) |
| AD-3 | Where it lives | In a repository of its own, which projects depend on: this one, public, under the MIT licence (2026-11-23) | active | [AGENTS.md](../AGENTS.md) |
| AD-4 | Packaging, dependencies and code drift anchoring | Standard npm CLI package using existing libraries rather than staying zero-dependency; projects pin only the pure-text specification files from core/; code drift anchoring uses pure-JS lightweight anchoring without native AST grammars (2026-11-23) | active | [AGENTS.md](../AGENTS.md) |
| AD-6 | Whether a row quotes the owner's words, which GUIDE asks for and the axioms' lock requires for changing it | Rows state decisions in summary and the words stay unpublished where each was decided; a decision that changes `core/AXIOMS.lock.md` quotes the owner's word in its row (2026-11-23) | active | [the header](#the-owners-words) |
| AD-7 | Whether this repository holds itself to its whole own check while docaxioms is in development | Not yet: only its links, paths, commands and axiom pin block a merge, the rest is a report. A check blocks again one at a time, on the owner's word, after it has run as a report in a real project other than this one through at least 10 relevant changes and 3 findings, each worth changing a document for (2026-11-23) | active | [AGENTS.md](../AGENTS.md) |

How AD-4 is carried out (not part of what was decided): the CLI parses Markdown with `remark` (`remark-parse`, `remark-gfm`) and `github-slugger`, matches globs with `picomatch`, and anchors code with line/file SHA-256 comments plus glob `codeToDocs` review aids.
