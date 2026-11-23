// The portability test of the docs check: a project with nothing in common with the one the kit came from (Python, other
// names, other ids). Each check must catch its own fault, and what is allowed must pass. `node --test test/`
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { check } from "../core/check.mjs";

const FILES = {
  "weather/cli.py": "# ADR-2: the cache is kept on disk (design 1.1)\n",
  "README.md": "# weather\n\nSee [docs](docs/index.md). The command lives in `weather/cli.py`.\n",
  "docs/index.md": "# Index\n\n[Design](design.md#1-cache) [Decisions](adr.md) [Plan](todo.md) [Card](../NOW.md)\n",
  "docs/design.md": "# Design\n\n## 1. Cache\n\nOn disk (ADR-2).\n\n### 1.1 Expiry\n\nOne hour.\n",
  "docs/adr.md": "# Decisions\n\n| Id | What | Decision | Status | Landing |\n|---|---|---|---|---|\n| ADR-1 | Units | metric | withdrawn | - |\n| ADR-2 | Cache | on disk | active | [design](design.md#1-cache) |\n",
  "docs/todo.md": "# To do\n\n- wind: [notes](ideas/wind.md)\n",
  "docs/ideas/wind.md": "# Wind\n\nStatus: open (wind)\n",
  "docs/old/first.md": "# First design\n\n> OUT OF DATE, a record.\n\nOld text, see [plan](../todo.md).\n",
  "docs/old/plain.md": "# Plain\n\n> OUT OF DATE, a record.\n\nNo newline",
  "NOW.md": "# Now\n\nNothing active.\n",
  "law/LAW.md": "locked\n",
};
const PROFILE = {
  core: { dir: "law", files: { "LAW.md": createHash("sha256").update(FILES["law/LAW.md"]).digest("hex") } },
  entries: ["README.md"], reachable: "^docs/", codeExtensions: [".py"], pathPrefixes: ["weather/", "docs/"], gonePaths: ["weather/legacy/"],
  decisions: { file: "docs/adr.md", id: "ADR-" },
  sections: [{ cite: "\\bdesign (\\d+(?:\\.\\d+)*)\\b", files: "^weather/", document: "docs/design.md" }],
  research: { dir: "docs/ideas", items: "docs/todo.md" },
  history: { dir: "docs/old", banner: "OUT OF DATE", erratum: "## Erratum ", base: "main" },
  card: { file: "NOW.md", maxLines: 10, maxChars: 300 },
};

async function failing(change, profile = PROFILE) {
  const root = mkdtempSync(join(tmpdir(), "agentic-docs-"));
  try {
    const at = (file) => join(root, file);
    const put = (file, text) => { mkdirSync(dirname(at(file)), { recursive: true }); writeFileSync(at(file), text); };
    for (const [file, text] of Object.entries(FILES)) put(file, text);
    const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
    git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-qm", "base"); git("checkout", "-qb", "work");
    const swap = (file, from, to) => { const text = readFileSync(at(file), "utf8"); assert.ok(text.includes(from), `${file} has no "${from}"`); writeFileSync(at(file), text.replace(from, to)); };
    change({ put, swap, add: (file, text) => appendFileSync(at(file), text), drop: (file) => rmSync(at(file)), bare: () => {} });
    return (await check(root, profile)).filter((result) => result.problems.length).map((result) => result.name);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("a project in order passes", async () => assert.deepEqual(await failing(() => {}), []));

const FAULTS = [
  ["core files", ({ add }) => add("law/LAW.md", "x")],
  ["core files", ({ drop }) => drop("law/LAW.md")],
  ["core files", ({ put }) => put("law/extra.md", "# Extra\n")],
  ["links and anchors", ({ swap }) => swap("docs/index.md", "#1-cache", "#1-cash")],
  ["links and anchors", ({ swap }) => swap("docs/index.md", "(todo.md)", "(gone.md)")],
  ["decision numbers", ({ add }) => add("weather/cli.py", "# ADR-9\n")],
  ["decision numbers", ({ add }) => add("docs/adr.md", "| ADR-2 | again | x | withdrawn | - |\n")],
  ["cited sections", ({ swap }) => swap("weather/cli.py", "design 1.1", "design 4.2")],
  ["documents named in code", ({ add }) => add("weather/cli.py", "# see docs/ideas/rain.md\n")],
  ["paths named", ({ swap }) => swap("README.md", "weather/cli.py", "weather/main.py")],
  ["paths named", ({ put }) => put("weather/legacy/a.py", "")],
  ["open research", ({ swap }) => swap("docs/ideas/wind.md", "open (wind)", "built")],
  ["open research", ({ swap }) => swap("docs/todo.md", "[notes](ideas/wind.md)", "notes")],
  ["open research", ({ swap }) => swap("docs/old/first.md", "OUT OF DATE", "Fine")],
  ["every current document", ({ put }) => put("docs/lost.md", "# Lost\n")],
  ["a decision names", ({ swap }) => swap("docs/design.md", "On disk (ADR-2).", "On disk.")],
  ["a decision names", ({ swap }) => swap("docs/adr.md", "| active |", "| done |")],
  ["a decision names", ({ put, swap }) => { swap("docs/todo.md", "- wind:", "- <a id=\"wind\"></a>wind:\n- other (ADR-2)\n- more:"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["the stage card", ({ add }) => add("NOW.md", "line\n".repeat(12))],
  ["a history file", ({ swap }) => swap("docs/old/first.md", "Old text,", "New text,")],
  ["a history file", ({ swap }) => swap("docs/old/first.md", "Old text,", "Extra.\n\nOld text,")],
  ["a history file", ({ add }) => add("docs/old/first.md", "\nnot an erratum\n")],
  ["a history file", ({ drop }) => drop("docs/old/first.md")],
];
// Review of 2026-11-23: what ordinary faults passed.
FAULTS.push(
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[Rain]\n\n[rain]: <rain.md> \"Title\"\n")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[Rain][rain]\n\n[rain]: rain.md\n")],
  ["documents named in code", ({ add }) => add("weather/cli.py", "# see docs/gone.md\n")],
  ["a decision names", ({ add }) => add("docs/adr.md", "\n## Later\n\n| ADR-4 | x | y | done | - |\n"), { ...PROFILE, decisions: { ...PROFILE.decisions, landedSection: "# Decisions" } }],
  ["a decision names", ({ add }) => add("docs/adr.md", "\n## Second\n\n| ADR-4 | x | y | active | [here](#nowhere) |\n")],
  ["a decision names", ({ add }) => add("docs/adr.md", "\n## Now\n\n| ADR-4 | x | y | active | [d](design.md#1-cache) |\n\n## Then\n\n| ADR-5 | x | y | done | - |\n"), { ...PROFILE, decisions: { ...PROFILE.decisions, landedSection: "## Now" } }],
  ["cited sections", ({ add, swap }) => { add("docs/design.md", "\n### 1.2 Rows\n\n| 1 | a |\n\n### 1.3 Other\n\n| 2 | b |\n"); swap("weather/cli.py", "design 1.1", "design 1.2-2"); }, "rows"],
  ["a history file", ({ add, swap }) => { add("docs/old/first.md", "\n## Erratum 2026-11-23\n\nIt was two hours.\n"); swap("docs/old/first.md", "Old text,", "It was two hours.\n\nOld text,"); }],
  ["a history file", ({ swap, bare }) => { swap("docs/old/first.md", "Old text,", "New text,"); bare(); }, { ...PROFILE, history: { ...PROFILE.history, base: "origin/main" } }],
);
const rows = (profile) => (profile === "rows" ? { ...PROFILE, sections: [{ ...PROFILE.sections[0], cite: "\\bdesign (\\d+(?:\\.\\d+)*(?:-\\d+)?)\\b", rowTables: { 1.2: "### 1.2", 2: "## 2" } }] } : profile);
for (const [name, change, profile] of FAULTS) test(`caught: ${name} (${change.toString().slice(change.toString().indexOf("=>") + 3, 90)})`, async () => {
  assert.ok((await failing(change, rows(profile))).some((one) => one.startsWith(name)));
});

const ALLOWED = [
  ["a dated erratum", ({ add }) => add("docs/old/first.md", "\n## Erratum 2026-11-23\n\nIt was two hours.\n")],
  ["a link target fixed in history", ({ swap }) => swap("docs/old/first.md", "../todo.md", "../design.md")],
  ["a new file in history", ({ put }) => put("docs/old/second.md", "# Second\n\n> OUT OF DATE, a record.\n")],
  ["a withdrawn decision without a landing", ({ add }) => add("docs/adr.md", "| ADR-3 | x | y | withdrawn | - |\n")],
  ["a landing at an explicit anchor", ({ swap }) => { swap("docs/todo.md", "- wind:", "- <a id=\"wind\"></a>wind (ADR-2):"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["a made-up document path in a fixture", ({ add }) => add("weather/cli.py", "# a fixture: made/up/notes.md\n")],
  ["a partly superseded decision with its landing", ({ swap }) => swap("docs/adr.md", "| active |", "| partly superseded (expiry by ADR-1) |")],
];
const landing = (target) => ({ swap }) => swap("docs/adr.md", "design.md#1-cache", target);
ALLOWED.push(
  ["text in brackets before a colon", ({ add }) => add("docs/index.md", "\n[Note]: see below\n\n[1]: first option\n\n[TODO]: later\n")],
  ["a footnote and a reference to a site", ({ add }) => add("docs/index.md", "\nA[^1] [b][b]\n\n[^1]: gone.md is a name\n[b]: https://example.com/x.md\n")],
  ["a landing past a comment in a code block", ({ swap }) => swap("docs/design.md", "On disk (ADR-2).", "```bash\n# a comment\n```\n\nOn disk (ADR-2).")],
  ["a landing at an encoded heading", (p) => { p.swap("docs/design.md", "### 1.1 Expiry", "### 缓存\n\nADR-2\n\n### 1.1 Expiry"); landing(`design.md#${encodeURIComponent("缓存")}`)(p); }],
  ["a landing at the second of two headings", (p) => { p.add("docs/design.md", "\n## Limits\n\nNone.\n\n## Limits\n\nADR-2\n"); landing("design.md#limits-1")(p); }],
  ["a landing in the decisions themselves", (p) => { p.add("docs/adr.md", "\n## Notes\n\nADR-2\n"); landing("#notes")(p); }],
  ["a row of a section of level two", ({ add, swap }) => { add("docs/design.md", "\n## 2. Rows\n\n| 1 | a |\n"); swap("weather/cli.py", "design 1.1", "design 2-1"); }, "rows"],
  ["an erratum after a file with no newline at its end", ({ add }) => add("docs/old/plain.md", "\n\n## Erratum 2026-11-23\n\nx\n")],
  ["a second erratum", ({ add }) => add("docs/old/first.md", "\n## Erratum 2026-11-23\n\nx\n\n## Erratum 2026-11-24\n\ny\n")],
  ["a folder the profile ignores by its path", ({ put }) => put("docs/tmp/lost.md", "# Lost\n\n[x](gone.md)\n"), { ...PROFILE, ignore: ["docs/tmp"] }],
);
for (const [name, change, profile] of ALLOWED) test(`allowed: ${name}`, async () => assert.deepEqual(await failing(change, rows(profile)), []));

test("the core names no project: no path of a machine, no address, no tool, no other script", async () => {
  const core = ["check.mjs", "GUIDE.md", "AXIOMS.lock.md"].map((file) => readFileSync(new URL(`../core/${file}`, import.meta.url), "utf8"));
  for (const text of core) assert.doesNotMatch(text, /\/(?:Users|home)\/|@\w+\.\w|https?:|\b(?:Claude|Codex|Gemini|GPT|npm|cargo|pip)\b|\p{Script=Han}|\b[A-Z]{1,3}\d{2,}\b|\bAD-/u);
});
