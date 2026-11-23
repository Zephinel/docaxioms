# Axioms of the documentation (locked)

Status: locked. It changes only on the owner's explicit word (see "Changing this file"). It names no project, path, tool or person, so that it can be the same file in every project and cannot go stale in any.

Documents, skills and memory are copies of one moment, and a reader who starts without memory has nothing else. So every rule, structure and check of the documentation is derived from the axioms below and names the axioms it follows from. A rule that cannot be derived from them does not belong. What is derived may change; this file does not.

## Axioms

- **A0 Authority.** What the software should do is what its owner decided; what it does is shown by code, tests and runs. Neither proves the other; a difference between them is a defect in one of them, found only by comparing.
- **A1 Scoped evidence.** A run shows behaviour for its revision, inputs and environment, not beyond.
- **A2 Dependence.** A claim stays valid only while what it depends on, inside the project or outside it, is unchanged since it was last checked.
- **A3 Fresh reader, finite attention.** Every reader starts with only what it can reach from where it enters, and reads a limited amount.
- **A4 Hand-kept copies diverge.** Two hand-maintained copies of a fact disagree after enough changes; generated or checked copies do not.
- **A5 Records are dated snapshots.** An account of the past is about its time and may have been wrong then; it is corrected by a dated, attributed erratum, never silently rewritten as the present.
- **A6 A gate guarantees only its predicate.** A check holds exactly what it evaluates, where it runs; everything else rests on attention.
- **A7 Gates cost attention.** A gate that often fires without finding a real problem trains people to pass it without looking, and is then worse than none. A gate must be precise.
- **A8 Why is not in the code.** Intent, rejected options and the owner's word exist for the next reader only if written down.

## Method

- **M1 Every claim has a kind** (A0, A1, A5, A8): K1 record (past; dated, never rewritten, corrected by erratum), K2 norm (must hold; its authority is the owner's decision, a test is evidence that it is enforced, read from the assertion), K3 description (is now; goes stale when what it depends on changes, so it is kept small and checked), K4 plan (will be; open, built or dropped). A document that mixes kinds marks them where they mix.
- **M2 Hard gate or review aid** (A6, A7): a rule becomes a failing check only where the checked predicate is the property itself and the check is precise; otherwise it is a review aid, measured before it may become a gate. What no check holds is said where it is read.
- **M3 One owner per fact** (A4): a fact is kept by hand in one place; other places link to it, or are generated or checked from it.
- **M4 Reachable and bounded** (A3): what a reader needs is reachable from where it enters and fits in what it can read; what is out of date is kept off that path.

## Changing this file

- Only on the owner's explicit word, recorded as a decision that quotes it. An agent never edits this file on its own judgement, also not to fix wording.
- An axiom or method is never renumbered or deleted; a withdrawn one keeps its number and says when and why.
- A project that uses this file pins its content, and says in its own documents which mechanisms keep it from changing and what they do not hold (A6).
