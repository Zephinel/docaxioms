// The portability test of the docs check: a project with nothing in common with the one the kit came from (Python, other
// names, other ids). Each check must catch its own fault, and what is allowed must pass. `node --test test/`
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { check, project, withoutFences } from "../src/check.mjs";
import { gardenManifest } from "../src/garden.mjs";
import { hashSourceSlice, syncPins } from "../src/pins.mjs";
import { withoutNulls } from "../src/profile.mjs";

const CLI_PY = "# ADR-2: the cache is kept on disk (design 1.1)\ndef ttl():\n    return 3600\n";
const CLI_PIN = hashSourceSlice(CLI_PY, 2, 3).short;

const FILES = {
  "weather/cli.py": CLI_PY,
  "weather/@scope/mod.py": "MODE = 'strict'\n",
  "weather/empty.py": "",
  "docs/img/diagram.png": "PNG",
  "Makefile": "test:\n\tpytest\nlint fmt:\n\truff\n",
  "README.md": "# weather\n\nSee [docs](docs/index.md). The command lives in `weather/cli.py`. Run `make test` and `make fmt`.\n",
  "docs/index.md": "# Index\n\n[Design](design.md#1-cache) [Decisions](adr.md) [Plan](todo.md) [Log](log.md) [Card](../NOW.md) ![diagram](img/diagram.png)\n",
  "docs/design.md": `# Design\n\n## 1. Cache\n\n<!-- pin: weather/cli.py#L2-L3@${CLI_PIN} -->\n\nOn disk (ADR-2).\n\n### 1.1 Expiry\n\nOne hour.\n`,
  "docs/adr.md": "# Decisions\n\n| Id | What | Decision | Status | Landing |\n|---|---|---|---|---|\n| ADR-1 | Units | metric | withdrawn | - |\n| ADR-2 | Cache | on disk | active | [design](design.md#1-cache) |\n",
  "docs/log.md": "# Log\n\n- 2026-11-23: ran `make legacy-build` before removing it.\n",
  "docs/todo.md": "# To do\n\n- wind: [notes](ideas/wind.md)\n- future command: `make deploy`\n",
  "docs/ideas/wind.md": "# Wind\n\nStatus: open (wind)\n",
  "docs/old/first.md": "# First design\n\n> OUT OF DATE, a record.\n\nOld text, see [plan](../todo.md).\n",
  "docs/old/plain.md": "# Plain\n\n> OUT OF DATE, a record.\n\nNo newline",
  "docs/old/refs.md": "# Refs\n\n> OUT OF DATE, a record.\n\n[Plan][p] and [odd](../todo_(1).md \"A\ntitle\").\n\n```\n[x](../keep.md)\n```\n\n[p]: ../todo.md\n\n> [q](\n> ../todo.md\n> \"Q\")\n\n![a `](../alt.md)`](../img/a.png) [s](../todo.md \"S\")\n",
  "docs/old/label.md": "# Label\n\n> OUT OF DATE, a record.\n\n[`a]: ../todo.md\n\nSee `x` and note]: secret\n",
  "docs/old/span.md": "# Span\n\n> OUT OF DATE, a record.\n\n![`](a.png)\n\n` ](OLD)\n\n> [r](\r> ../todo.md\r> \"R\")\n",
  "docs/old/html.md": "# Html\n\n> OUT OF DATE, a record.\n\n![<span title=\"](OLD)\">](../img/a.png)\n",
  "docs/old/crlf.md": "# Crlf\r\n\r\n> OUT OF DATE, a record.\r\n\r\n[c](\r\n../todo.md)\r\n",
  "NOW.md": "# Now\n\nNothing active.\n",
  "law/LAW.md": "locked\n",
};
const PROFILE = {
  core: { dir: "law", files: { "LAW.md": createHash("sha256").update(FILES["law/LAW.md"]).digest("hex") } },
  entries: ["README.md"],
  reachable: "^docs/",
  codeExtensions: [".py"],
  pathPrefixes: ["weather/", "docs/"],
  gonePaths: ["weather/legacy/"],
  decisions: { file: "docs/adr.md", id: "ADR-" },
  log: "docs/log.md",
  sections: [{ cite: "\\bdesign (\\d+(?:\\.\\d+)*)\\b", files: "^weather/", document: "docs/design.md" }],
  commands: [{ prefix: "make ", makefile: "Makefile" }],
  research: { dir: "docs/ideas", items: "docs/todo.md" },
  history: { dir: "docs/old", banner: "OUT OF DATE", erratum: "## Erratum ", base: "main" },
  card: { file: "NOW.md", maxLines: 10, maxChars: 300 },
  budgets: [{ files: "README.md", maxLines: 20, maxChars: 1000 }],
  codeToDocs: [{ code: "weather/**", docs: ["docs/design.md"], base: "main" }],
  evolutionary: { phrases: ["used to", "was replaced by"], exempt: ["README.md"] },
};

async function runFixture(change, profile = PROFILE) {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-"));
  try {
    const at = (file) => join(root, file);
    const put = (file, text) => { mkdirSync(dirname(at(file)), { recursive: true }); writeFileSync(at(file), text); };
    for (const [file, text] of Object.entries(FILES)) put(file, text);
    const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
    git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-qm", "base"); git("checkout", "-qb", "work");
    const swap = (file, from, to) => { const text = readFileSync(at(file), "utf8"); assert.ok(text.includes(from), `${file} has no "${from}"`); writeFileSync(at(file), text.replace(from, to)); };
    change({ root, at, put, swap, add: (file, text) => appendFileSync(at(file), text), drop: (file) => rmSync(at(file)), bare: () => {} });
    return await check(root, profile);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

async function failing(change, profile = PROFILE, { includeAids = false, errorsAllowed = false } = {}) {
  const results = await runFixture(change, profile);
  // A check that could not run has no findings to compare; it must not read as a pass. A fault in the profile
  // itself may leave the checks that read it unable to run.
  if (!errorsAllowed) assert.deepEqual(results.filter((result) => result.errors.length).map(({ name, errors }) => ({ name, errors })), []);
  return results
    .filter((result) => result.problems.length && (includeAids || result.level !== "aid"))
    .map((result) => result.name);
}

test("a project in order passes (gates and aids)", async () => {
  assert.deepEqual(await failing(() => {}, PROFILE, { includeAids: true }), []);
});

const FAULTS = [
  ["core files", ({ add }) => add("law/LAW.md", "x")],
  ["core files", ({ drop }) => drop("law/LAW.md")],
  ["core files", ({ put }) => put("law/extra.md", "# Extra\n")],
  ["core files", () => {}, { ...PROFILE, core: { ...PROFILE.core, version: "0.0.1" } }],
  ["core files", () => {}, { ...PROFILE, core: { ...PROFILE.core, commit: "0".repeat(40) } }],
  ["links and anchors", ({ swap }) => swap("docs/index.md", "#1-cache", "#1-cash")],
  ["links and anchors", ({ swap }) => swap("docs/index.md", "(todo.md)", "(gone.md)")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n![missing](img/missing.png)\n")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n![missing][img]\n\n[img]: img/missing.png\n")],
  ["decision numbers", ({ add }) => add("weather/cli.py", "# ADR-9\n")],
  ["decision numbers", ({ add }) => add("docs/design.md", "\n<!-- see ADR-99 -->\n")],
  ["decision numbers", ({ add }) => add("docs/adr.md", "| ADR-2 | again | x | withdrawn | - |\n")],
  ["cited sections", ({ swap }) => swap("weather/cli.py", "design 1.1", "design 4.2")],
  ["documents named in code", ({ add }) => add("weather/cli.py", "# see docs/ideas/rain.md\n")],
  ["paths named", ({ swap }) => swap("README.md", "weather/cli.py", "weather/main.py")],
  ["paths named", ({ put }) => put("weather/legacy/a.py", "")],
  ["code pins", ({ swap }) => swap("weather/cli.py", "3600", "7200")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: weather/missing.py@000000000000 -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: weather/cli.py#L1-L99@000000000000 -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: weather/cli.py#L2-L3 -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin weather/cli.py -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: weather/a b.py -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: ../../outside.py@000000000000 -->\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: weather/empty.py#L1@000000000000 -->\n")],
  ["commands named", ({ add }) => add("README.md", "\nRun `make deploy`.\n")],
  ["commands named", ({ put }) => put("pkg.json", "{bad json"), { ...PROFILE, commands: [{ prefix: "run ", jsonFile: "pkg.json", key: "scripts" }] }],
  ["open research", ({ swap }) => swap("docs/ideas/wind.md", "open (wind)", "built")],
  ["open research", ({ swap }) => swap("docs/todo.md", "[notes](ideas/wind.md)", "notes")],
  ["open research", ({ swap }) => swap("docs/old/first.md", "OUT OF DATE", "Fine")],
  ["every current document", ({ put }) => put("docs/lost.md", "# Lost\n")],
  ["a decision names", ({ swap }) => swap("docs/design.md", "On disk (ADR-2).", "On disk.")],
  ["a decision names", ({ swap }) => swap("docs/adr.md", "| active |", "| done |")],
  ["a decision names", ({ swap }) => { swap("docs/todo.md", "- wind:", "- <a id=\"wind\"></a>wind:\n- other (ADR-2)\n- more:"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["a decision names", ({ swap }) => { swap("docs/todo.md", "- wind:", "- <a data-id=\"wind\"></a>wind (ADR-2):"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["the stage card", ({ add }) => add("NOW.md", "line\n".repeat(12))],
  ["bounded documents", ({ add }) => add("README.md", "line\n".repeat(25))],
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
// The iteration reference of 2026-11-26, first batch: checks that did not hold what they say.
FAULTS.push(
  ["the profile", () => {}, { ...PROFILE, commmands: PROFILE.commands }],
  ["the profile", () => {}, { ...PROFILE, card: { ...PROFILE.card, maxLines: "10" } }],
  ["the profile", () => {}, { ...PROFILE, research: { dir: "docs/ideas" } }],
  ["the profile", () => {}, { ...PROFILE, pathExempt: "(" }],
  ["the profile", () => {}, { ...PROFILE, commands: [{ prefix: "make " }] }],
  ["the profile", () => {}, { ...PROFILE, decisions: { ...PROFILE.decisions, idd: "X-" } }],
  ["paths named", ({ add }) => add("NOW.md", "`weather/gone.py`\n")],
  ["paths named", ({ add }) => add("README.md", "\nSee `weather/gone.py#L10`.\n")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[out](../../outside.md)\n")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[out](../../outside.md#a)\n")],
  ["a decision names", ({ swap }) => swap("docs/adr.md", "design.md#1-cache", "../../outside.md#a")],
  ["a history file", ({ swap }) => swap("docs/old/refs.md", "A\ntitle", "A\nnew title")],
  ["a history file", ({ swap }) => swap("docs/old/refs.md", "[x](../keep.md)", "[x](../other.md)")],
  ["decision numbers", ({ drop }) => drop("docs/adr.md")],
  ["cited sections", () => {}, { ...PROFILE, sections: [{ ...PROFILE.sections[0], document: "docs/nope.md" }] }],
  ["open research", ({ drop }) => drop("docs/todo.md")],
  ["open research", () => {}, { ...PROFILE, research: { ...PROFILE.research, openUntil: "## Done" } }],
  ["open research", ({ swap, add }) => { swap("docs/todo.md", "[notes](ideas/wind.md)", "notes"); add("docs/todo.md", "\n## Done (old)\n\n- wind: [notes](ideas/wind.md)\n"); }, { ...PROFILE, research: { ...PROFILE.research, openUntil: "## Done (old)" } }],
  ["commands named", ({ add }) => add("README.md", "\nRun `make -s deploy`.\n")],
);
// Review of 2026-11-27 of the first batch.
FAULTS.push(
  ["the profile", () => {}, { ...PROFILE, toString: true }],
  ["the profile", () => {}, { ...PROFILE, decisions: { ...PROFILE.decisions, constructor: 1 } }],
  ["the profile", () => {}, { ...PROFILE, core: { ...PROFILE.core, files: { "LAW.md": ["a".repeat(64)] } } }],
  ["a history file", ({ swap }) => swap("docs/old/refs.md", "../alt.md", "../other.md")],
  ["a history file", ({ swap }) => swap("docs/old/refs.md", "\"S\"", "\"New\"")],
  ["the profile", () => {}, { ...PROFILE, research: { ...PROFILE.research, dir: "docs/ideas/" } }],
  ["the profile", () => {}, { ...PROFILE, commmands: null }],
  ["the profile", () => {}, { ...PROFILE, history: { ...PROFILE.history, dir: "docs//old" } }],
  ["the profile", () => {}, { ...PROFILE, research: { ...PROFILE.research, dir: "docs/./ideas" } }],
  ["the profile", () => {}, { ...PROFILE, commands: [{ prefix: "make ", makefile: "" }] }],
  ["a history file", ({ swap }) => swap("docs/old/html.md", "(OLD)", "(NEW)")],
  ["paths named", ({ add }) => add("README.md", "\nSee `docs/gone.md#one#two`.\n")],
  ["code pins", ({ add }) => add("docs/design.md", "\n<!-- pin: docs -->\n")],
  ["a history file", ({ swap }) => swap("docs/old/span.md", "(OLD)", "(NEW)")],
  ["the profile", () => {}, { ...PROFILE, history: { ...PROFILE.history, banner: "" } }],
  ["the profile", () => {}, { ...PROFILE, budgets: [{ files: "README.md" }] }],
  ["the profile", () => {}, { ...PROFILE, ignore: "docs" }],
  ["a history file", ({ add }) => add("docs/old/first.md", "\nhttps://example.com/added\n")],
  ["a history file", ({ swap }) => swap("docs/old/label.md", "secret", "other")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[x](/docs/gone.md)\n")],
  ["links and anchors", ({ add }) => add("docs/index.md", "\n[x](/docs/design.md#nope)\n")],
  ["a decision names", ({ swap }) => swap("docs/adr.md", "design.md#1-cache", "/")],
  ["a decision names", ({ swap }) => swap("docs/adr.md", "design.md#1-cache", "img/diagram.png")],
  ["paths named", ({ add }) => add("README.md", "\nSee `docs/gone.md#1-cache`.\n")],
  ["paths named", ({ add }) => add("README.md", "\nSee `docs/../../outside.md`.\n")],
  ["the stage card", () => {}, { ...PROFILE, card: { ...PROFILE.card, file: "GONE.md" } }],
  ["commands named", () => {}, { ...PROFILE, commands: [{ prefix: "make ", makefile: "Makfile" }] }],
  ["open research", ({ add }) => add("docs/todo.md", "\n## Done (later)\n\n- rain\n"), { ...PROFILE, research: { ...PROFILE.research, openUntil: "## Done" } }],
);
const rows = (profile) => (profile === "rows" ? { ...PROFILE, sections: [{ ...PROFILE.sections[0], cite: "\\bdesign (\\d+(?:\\.\\d+)*(?:-\\d+)?)\\b", rowTables: { 1.2: "### 1.2", 2: "## 2" } }] } : profile);
for (const [name, change, profile] of FAULTS) test(`caught: ${name} (${change.toString().slice(change.toString().indexOf("=>") + 3, 90)})`, async () => {
  assert.ok((await failing(change, rows(profile), { errorsAllowed: name === "the profile" })).some((one) => one.startsWith(name)));
});

const ALLOWED = [
  ["a dated erratum", ({ add }) => add("docs/old/first.md", "\n## Erratum 2026-11-23\n\nIt was two hours.\n")],
  ["a link target fixed in history", ({ swap }) => swap("docs/old/first.md", "../todo.md", "../design.md")],
  ["a new file in history", ({ put }) => put("docs/old/second.md", "# Second\n\n> OUT OF DATE, a record.\n")],
  ["a withdrawn decision without a landing", ({ add }) => add("docs/adr.md", "| ADR-3 | x | y | withdrawn | - |\n")],
  ["a landing at an explicit id anchor", ({ swap }) => { swap("docs/todo.md", "- wind:", "- <a id=\"wind\"></a>wind (ADR-2):"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["a landing at an explicit name anchor", ({ swap }) => { swap("docs/todo.md", "- wind:", "- <a name=\"wind\"></a>wind (ADR-2):"); swap("docs/adr.md", "design.md#1-cache", "todo.md#wind"); }],
  ["a made-up document path in a fixture", ({ add }) => add("weather/cli.py", "# a fixture: made/up/notes.md\n")],
  ["a partly superseded decision with its landing", ({ swap }) => swap("docs/adr.md", "| active |", "| partly superseded (expiry by ADR-1) |")],
  ["a pin example inside a fenced code block", ({ add }) => add("docs/design.md", "\n```md\n<!-- pin: weather/missing.py@000000000000 -->\n```\n")],
  ["a command placeholder in inline code", ({ add }) => add("README.md", "\nRun `make <target>`.\n")],
  ["a whole-file code pin", ({ add }) => add("docs/design.md", `\n<!-- pin: weather/cli.py@${hashSourceSlice(CLI_PY).short} -->\n`)],
  ["a pin whose path contains @", ({ add }) => add("docs/design.md", `\n<!-- pin: weather/@scope/mod.py#L1@${hashSourceSlice(FILES["weather/@scope/mod.py"], 1, 1).short} -->\n`)],
  ["a whole-file pin on an empty file", ({ add }) => add("docs/design.md", `\n<!-- pin: weather/empty.py@${hashSourceSlice("").short} -->\n`)],
  ["an ordinary prose comment starting with pin", ({ add }) => add("docs/design.md", "\n<!-- pin the version here -->\n")],
  ["a fake decision row inside an HTML comment", ({ add }) => add("docs/adr.md", "\n<!-- | ADR-2 | commented | x | invalid | - | -->\n")],
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
ALLOWED.push(
  ["a key of the project's own", () => {}, { ...PROFILE, "x-mine": { any: 1 } }],
  ["a log, a plan and research naming paths not there", ({ add }) => { add("docs/log.md", "- 2026-11-24: removed `weather/old.py`.\n"); add("docs/todo.md", "- later: `weather/wind.py`\n"); add("docs/ideas/wind.md", "\nIn `weather/wind.py`.\n"); }],
  ["a path with a line fragment", ({ add }) => add("README.md", "\nSee `weather/cli.py#L2-L3`.\n")],
  ["a command after an option", ({ add }) => add("README.md", "\nRun `make -s test`.\n")],
  ["a link from the repository root", ({ add }) => add("docs/index.md", "\n[design](/docs/design.md#1-cache)\n")],
  ["a reference definition fixed in history", ({ swap }) => swap("docs/old/refs.md", "[p]: ../todo.md", "[p]: ../design.md")],
  ["a target with parentheses fixed in history", ({ swap }) => swap("docs/old/refs.md", "../todo_(1).md", "../plan_(1)/x.md")],
  ["a target on its own line in a block quote fixed in history", ({ swap }) => swap("docs/old/refs.md", "> ../todo.md", "> ../design.md")],
  ["a target after a CRLF line ending fixed in history", ({ swap }) => swap("docs/old/crlf.md", "\r\n../todo.md)", "\r\n../design.md)")],
  ["an image target fixed in history past code in its text", ({ swap }) => swap("docs/old/refs.md", "../img/a.png", "../img/b.png")],
  ["a key the profile leaves unset with null", () => {}, { ...PROFILE, core: { ...PROFILE.core, source: null }, sections: [{ ...PROFILE.sections[0], rowTables: null }], history: { ...PROFILE.history, base: null } }],
  ["a link to another site that starts with //", ({ add }) => add("docs/index.md", "\n[x](//example.com/a.md)\n")],
  ["an image target fixed in history past HTML in its text", ({ swap }) => swap("docs/old/html.md", "../img/a.png", "../img/b.png")],
  ["a target after a lone CR in a block quote fixed in history", ({ swap }) => swap("docs/old/span.md", "> ../todo.md", "> ../design.md")],
  ["a link with a query", ({ add }) => add("docs/index.md", "\n[d](design.md?plain=1#1-cache)\n")],
  ["a definition target fixed in history past a backtick in its label", ({ swap }) => swap("docs/old/label.md", "../todo.md", "../design.md")],
  ["open items that end at a heading with parentheses", ({ add }) => add("docs/todo.md", "\n## Done (old)\n\n- rain\n"), { ...PROFILE, research: { ...PROFILE.research, openUntil: "## Done (old)" } }],
);
for (const [name, change, profile] of ALLOWED) test(`allowed: ${name}`, async () => assert.deepEqual(await failing(change, rows(profile)), []));

test("B1 regression: pin --write inside indented list and blockquote HTML blocks preserves markdown intact", async () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-b1-"));
  try {
    const at = (file) => join(root, file);
    for (const [file, text] of Object.entries(FILES)) {
      mkdirSync(dirname(at(file)), { recursive: true });
      writeFileSync(at(file), text);
    }
    const blockDoc = [
      "# Nested",
      "",
      "- item",
      "  <details>",
      "  <summary>s</summary>",
      "  <!-- pin: weather/cli.py#L2-L3 -->",
      "  </details>",
      "",
      "> <details>",
      "> <summary>q</summary>",
      "> <!-- pin: weather/cli.py#L2-L3 -->",
      "> </details>",
      "",
    ].join("\n");
    writeFileSync(at("docs/nested.md"), blockDoc);
    appendFileSync(at("docs/index.md"), "\n[Nested](nested.md)\n");

    const dry = syncPins(project(root, PROFILE), { write: false });
    const nestedChanges = dry.filter((c) => c.file === "docs/nested.md");
    assert.deepEqual(nestedChanges.map((c) => c.line), [6, 11]);

    syncPins(project(root, PROFILE), { write: true, files: ["docs/nested.md"] });
    const written = readFileSync(at("docs/nested.md"), "utf8");
    assert.equal(written, blockDoc.replaceAll("<!-- pin: weather/cli.py#L2-L3 -->", `<!-- pin: weather/cli.py#L2-L3@${CLI_PIN} -->`));
    const after = await check(root, PROFILE);
    assert.equal(after.find((r) => r.name.startsWith("code pins match")).problems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("B2 + N1 regression: shifted lines fail gate closed, relocate safely, and 1-line collisions never silently pass", async () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-b2-"));
  try {
    const at = (file) => join(root, file);
    for (const [file, text] of Object.entries(FILES)) {
      mkdirSync(dirname(at(file)), { recursive: true });
      writeFileSync(at(file), text);
    }
    // Insert unrelated imports above the pinned function
    writeFileSync(at("weather/cli.py"), `import os\nimport sys\n${CLI_PY}`);

    const shifted = await check(root, PROFILE);
    const gate = shifted.find((r) => r.name.startsWith("code pins match"));
    assert.equal(gate.problems.length, 1);
    assert.match(gate.problems[0], /#L2-L3 moved to #L4-L5/);

    // Relocate updates line numbers ONLY, keeping the exact same hash, and now gate passes
    syncPins(project(root, PROFILE), { relocate: true });
    assert.match(readFileSync(at("docs/design.md"), "utf8"), new RegExp(`<!-- pin: weather/cli\\.py#L4-L5@${CLI_PIN} -->`));
    const relocated = await check(root, PROFILE);
    assert.equal(relocated.find((r) => r.name.startsWith("code pins match")).problems.length, 0);

    // N1: 1-line pin whose line is edited while another function happens to contain the old line MUST fail gate
    const twoFns = "def a():\n    return 0\n\ndef b():\n    return 0\n";
    const ret0Pin = hashSourceSlice(twoFns, 2, 2).short;
    writeFileSync(at("weather/fns.py"), twoFns.replace("def a():\n    return 0", "def a():\n    return 1"));
    appendFileSync(at("docs/design.md"), `\n<!-- pin: weather/fns.py#L2@${ret0Pin} -->\n`);
    const n1 = await check(root, PROFILE);
    assert.equal(n1.find((r) => r.name.startsWith("code pins match")).problems.length, 1);
    assert.match(n1.find((r) => r.name.startsWith("code pins match")).problems[0], /#L2 moved to #L5/);

    // Insert 3 more lines above AND mutate the function body: gate MUST fail
    writeFileSync(at("weather/cli.py"), `import a\nimport b\nimport c\nimport os\nimport sys\n${CLI_PY.replace("3600", "999")}`);
    const mutated = await check(root, PROFILE);
    assert.equal(mutated.find((r) => r.name.startsWith("code pins match")).problems.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("B2 edge: ambiguous move (duplicate identical windows) fails gate closed", async () => {
  const dup = await runFixture(({ put }) => put("weather/cli.py", `import os\n${CLI_PY}${CLI_PY}`));
  const gate = dup.find((r) => r.name.startsWith("code pins match"));
  assert.equal(gate.problems.length, 1);
  assert.match(gate.problems[0], /moved ambiguously/);
});

test("review aid: codeToDocs warns without failing gates, clears on doc edit, and reports missing base (A6)", async () => {
  const withCodeOnly = await runFixture(({ put }) => put("weather/new.py", "# helper\n"));
  assert.deepEqual(withCodeOnly.filter((r) => r.level === "gate" && r.problems.length), []);
  const aid = withCodeOnly.find((r) => r.name.startsWith("code changes"));
  assert.equal(aid.level, "aid");
  assert.equal(aid.problems.length, 1);

  const withDocUpdated = await runFixture(({ put, add }) => {
    put("weather/new.py", "# helper\n");
    add("docs/design.md", "\nHelper note.\n");
  });
  assert.equal(withDocUpdated.find((r) => r.name.startsWith("code changes")).problems.length, 0);

  const degraded = await runFixture(() => {}, {
    ...PROFILE,
    codeToDocs: [{ code: "weather/**", docs: ["docs/design.md"], base: "origin/missing" }],
  });
  const codeToDocsResult = degraded.find((r) => r.name.startsWith("code changes"));
  assert.deepEqual(codeToDocsResult.problems, []);
  assert.equal(codeToDocsResult.notes.length, 1);
  assert.match(codeToDocsResult.notes[0], /base "origin\/missing" not found/);
});

test("a check that cannot run says why, and the others still run (A6)", async () => {
  const results = await runFixture(() => {}, { ...PROFILE, projectChecks: "nope.mjs" });
  const load = results.find((r) => r.name === "project checks load");
  assert.equal(load.errors.length, 1);
  assert.match(load.errors[0], /^nope\.mjs: /);
  assert.ok(results.filter((r) => r.name !== "project checks load").every((r) => Array.isArray(r.errors) && !r.errors.length));
  const thrown = await runFixture(({ put }) => put("own.mjs", "export default [{ name: \"own\", axioms: \"A6\", run: () => { throw new Error(\"boom\"); } }];\n"), { ...PROFILE, projectChecks: "own.mjs" });
  assert.deepEqual(thrown.find((r) => r.name === "own").errors, ["boom"]);
});

test("a link out of the repository is not followed even when the file there exists (A2, A4)", async () => {
  let outside;
  const run = (change) => runFixture((tools) => {
    outside = `${tools.root}-outside.md`;
    const name = outside.split(/[\\/]/).pop();
    writeFileSync(outside, `# A\n\n[back](${tools.root.split(/[\\/]/).pop()}/docs/orphan.md)\n`);
    tools.put("docs/orphan.md", "# Orphan\n");
    change(tools, `../../${name}`);
  });
  try {
    const named = (results, start) => results.find((r) => r.name.startsWith(start)).problems;
    const linked = await run(({ add }, target) => add("docs/index.md", `\n[out](${target}#a)\n`));
    assert.deepEqual(named(linked, "links and anchors").filter((one) => /outside/.test(one)).length, 1);
    assert.ok(named(linked, "every current document is reachable").some((one) => one.includes("docs/orphan.md")));
    const landed = await run(({ swap }, target) => swap("docs/adr.md", "design.md#1-cache", `${target}#a`));
    assert.ok(named(landed, "a decision names").some((one) => /leads outside the repository/.test(one)));
  } finally { if (outside) rmSync(outside, { force: true }); }
});

test("a command after an option is named by its first word that is not an option", async () => {
  const results = await runFixture(({ add }) => add("README.md", "\nRun `make -s deploy`.\n"));
  const found = results.find((r) => r.name.startsWith("commands named")).problems;
  assert.equal(found.length, 1);
  assert.match(found[0], /\bdeploy\b/);
  assert.doesNotMatch(found[0], /-s\b/);
});

test("a link through a symbolic link that leads out of the repository is not followed (A2, A4)", async () => {
  let outside;
  try {
    const results = await runFixture(({ root, add }) => {
      outside = mkdtempSync(join(tmpdir(), "docaxioms-out-"));
      writeFileSync(join(outside, "a.md"), "# A\n");
      symlinkSync(outside, join(root, "external"));
      add("docs/index.md", "\n[x](/external/a.md#a)\n");
    });
    assert.ok(results.find((r) => r.name.startsWith("links and anchors")).problems.some((one) => /external\/a\.md#a leads outside/.test(one)));
  } finally { if (outside) rmSync(outside, { recursive: true, force: true }); }
});

test("a profile that is not valid stops every check, and says why (A6)", async () => {
  for (const [profile, said] of [[[], /the profile must be an object/], [{ ...PROFILE, codeExtensions: ".py" }, /codeExtensions must be a list of strings/]]) {
    const results = await runFixture(() => {}, profile);
    assert.match(results[0].problems.join("\n"), said);
    assert.ok(results.slice(1).every((r) => r.errors.length === 1 && !r.problems.length));
  }
  assert.throws(() => project(process.cwd(), { ignore: 1 }), /ignore must be a list of strings/);
});

test("a folder's README that is a symbolic link out of the repository is not followed (A2, A4)", async () => {
  const outside = mkdtempSync(join(tmpdir(), "docaxioms-readme-"));
  try {
    writeFileSync(join(outside, "README.md"), "# Out\n\n[o](orphan.md)\n");
    const results = await runFixture(({ root, put, add }) => {
      put("docs/orphan.md", "# Orphan\n");
      symlinkSync(join(outside, "README.md"), join(root, "docs/README.md"));
      add("README.md", "\n[d](docs)\n");
    });
    assert.ok(results.find((r) => r.name.startsWith("every current document is reachable")).problems.includes("docs/orphan.md"));
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("an entry that is a symbolic link out of the repository, or one that leads nowhere, is not followed (A2, A4)", async () => {
  const outside = mkdtempSync(join(tmpdir(), "docaxioms-entry-"));
  try {
    writeFileSync(join(outside, "START.md"), "# Out\n\n[o](docs/orphan.md)\n");
    const results = await runFixture(({ root, put, add }) => {
      put("docs/orphan.md", "# Orphan\n");
      symlinkSync(join(outside, "START.md"), join(root, "START.md"));
      symlinkSync(join(outside, "nothing"), join(root, "external"));
      add("docs/index.md", "\n[x](/external/missing.md)\n");
    }, { ...PROFILE, entries: ["README.md", "START.md"] });
    assert.ok(results.find((r) => r.name.startsWith("every current document is reachable")).problems.includes("docs/orphan.md"));
    assert.ok(results.find((r) => r.name.startsWith("links and anchors")).problems.some((one) => /external\/missing\.md leads outside/.test(one)));
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("project checks that are not a list of checks are refused, and none of them runs", async () => {
  for (const exported of ["{}", "[null]", "new Set([{ name: \"own\", axioms: \"A6\", run: () => [\"ran\"] }])"]) {
    const results = await runFixture(({ put }) => put("own.mjs", `export default ${exported};\n`), { ...PROFILE, projectChecks: "own.mjs" });
    assert.match(results.find((r) => r.name === "project checks load").errors[0], /not a list of checks/);
    assert.equal(results.find((r) => r.name === "own"), undefined);
  }
});

test("pin --write with a scope does not read the pins of other documents", () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-scope2-"));
  try {
    const at = (file) => join(root, file);
    for (const [file, text] of Object.entries(FILES)) { mkdirSync(dirname(at(file)), { recursive: true }); writeFileSync(at(file), text); }
    writeFileSync(at("docs/other.md"), "# Other\n\n<!-- pin: docs -->\n");
    const scoped = syncPins(project(root, PROFILE), { write: true, files: ["docs/design.md"] });
    assert.deepEqual(scoped, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("withoutNulls keeps a project's own x- data as it is", () => {
  assert.deepEqual(withoutNulls({ a: null, b: { c: null }, "x-own": { d: null }, "x-none": null }), { b: {}, "x-own": { d: null }, "x-none": null });
});

test("a code pin through a symbolic link out of the repository is not read (A2, A4)", async () => {
  const outside = mkdtempSync(join(tmpdir(), "docaxioms-pinout-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "one\ntwo\n");
    const results = await runFixture(({ root, add }) => {
      symlinkSync(join(outside, "secret.txt"), join(root, "docs/secret.txt"));
      add("docs/design.md", "\n<!-- pin: docs/secret.txt#L1-L2 -->\n");
    });
    const pins = results.find((r) => r.name.startsWith("code pins")).problems;
    assert.ok(pins.some((one) => /leads outside the repository/.test(one)), pins.join("\n"));
  } finally { rmSync(outside, { recursive: true, force: true }); }
});

test("pin --write with a scope reports only that scope, and writes nothing when part of it names no pin", () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-scope-"));
  try {
    const at = (file) => join(root, file);
    for (const [file, text] of Object.entries(FILES)) { mkdirSync(dirname(at(file)), { recursive: true }); writeFileSync(at(file), text); }
    writeFileSync(at("docs/other.md"), "# Other\n\n<!-- pin: weather/gone.py#L1@000000000000 -->\n");
    writeFileSync(at("docs/stale.md"), "# Stale\n\n<!-- pin: weather/cli.py#L2-L3@000000000000 -->\n");
    const scoped = syncPins(project(root, PROFILE), { write: true, files: ["/docs/stale.md"] });
    assert.deepEqual(scoped.map((one) => [one.file, one.status, one.written]), [["docs/stale.md", "updated", true]]);
    writeFileSync(at("docs/stale.md"), "# Stale\n\n<!-- pin: weather/cli.py#L2-L3@000000000000 -->\n");
    const typo = syncPins(project(root, PROFILE), { write: true, files: ["docs/stale.md", "docs/typo.md"] });
    assert.deepEqual(typo.map((one) => one.status), ["no-match"]);
    assert.match(readFileSync(at("docs/stale.md"), "utf8"), /@000000000000/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a check that throws a value that is not an error still says why, and the next runs", async () => {
  const results = await runFixture(({ put }) => put("own.mjs", "export default [{ name: \"first\", axioms: \"A6\", run: () => { throw null; } }, { name: \"second\", axioms: \"A6\", run: () => [] }];\n"), { ...PROFILE, projectChecks: "own.mjs" });
  assert.deepEqual(results.find((r) => r.name === "first").errors, ["null"]);
  const bare = await runFixture(({ put }) => put("own.mjs", "export default [{ name: \"first\", axioms: \"A6\", run: () => { throw Object.create(null); } }, { name: \"second\", axioms: \"A6\", run: () => [] }];\n"), { ...PROFILE, projectChecks: "own.mjs" });
  assert.equal(bare.find((r) => r.name === "first").errors.length, 1);
  assert.deepEqual(bare.find((r) => r.name === "second").errors, []);
  assert.deepEqual(results.find((r) => r.name === "second").errors, []);
});

test("history gate says when its base is missing instead of comparing silently against HEAD (A6)", async () => {
  const history = (results) => results.find((r) => r.name.startsWith("a history file"));
  const found = history(await runFixture(() => {}));
  assert.deepEqual(found.notes, []);
  const missing = history(await runFixture(() => {}, { ...PROFILE, history: { ...PROFILE.history, base: "origin/missing" } }));
  assert.deepEqual(missing.problems, []);
  assert.equal(missing.notes.length, 1);
  assert.match(missing.notes[0], /base "origin\/missing" not found/);
  const changed = history(await runFixture(({ swap }) => swap("docs/old/first.md", "Old text,", "New text,"), { ...PROFILE, history: { ...PROFILE.history, base: "origin/missing" } }));
  assert.equal(changed.problems.length, 1);
  assert.equal(changed.notes.length, 1);
  const unset = history(await runFixture(() => {}, { ...PROFILE, history: { ...PROFILE.history, base: null } }));
  assert.match(unset.notes[0], /base "origin\/main" not found/);
});

test("history gate says when there is no commit to compare with", async () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-nocommit-"));
  try {
    mkdirSync(join(root, "docs/old"), { recursive: true });
    writeFileSync(join(root, "docs/old/a.md"), "# A\n\n> OUT OF DATE\n");
    execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
    const results = await check(root, { history: { dir: "docs/old", banner: "OUT OF DATE", erratum: "## Erratum ", base: "main" } });
    const gate = results.find((r) => r.name.startsWith("a history file"));
    assert.deepEqual(gate.problems, []);
    assert.match(gate.notes[0], /no commit to compare with/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("review aid: evolutionary phrasing reports exact line inside multi-line paragraph and skips exempt/fences", async () => {
  const flagged = await runFixture(({ add }) => add("docs/design.md", "\nLine one of paragraph.\nLine two used to live in memory.\n"));
  assert.deepEqual(flagged.filter((r) => r.level === "gate" && r.problems.length), []);
  const aid = flagged.find((r) => r.name.startsWith("current descriptions"));
  assert.equal(aid.level, "aid");
  assert.equal(aid.problems.length, 1);
  assert.match(aid.problems[0], /docs\/design\.md:14:/);

  const exempt = await runFixture(({ add }) => {
    add("README.md", "\nThis project used to have a flag.\n");
    add("docs/design.md", "\n```txt\nThis used to apply.\n```\n");
  });
  assert.equal(exempt.find((r) => r.name.startsWith("current descriptions")).problems.length, 0);
});

test("gardenManifest includes README and stageCard, ignores evolutionary.exempt, and honours garden.exempt", () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-garden-"));
  try {
    const at = (file) => join(root, file);
    for (const [file, text] of Object.entries(FILES)) {
      mkdirSync(dirname(at(file)), { recursive: true });
      writeFileSync(at(file), text);
    }
    const manifest = gardenManifest(root, { ...PROFILE, garden: { exempt: ["docs/index.md"] } });
    assert.ok(manifest.descriptions.some((item) => item.file === "README.md"));
    assert.equal(manifest.descriptions.some((item) => item.file === "docs/index.md"), false);
    assert.equal(manifest.stageCard.file, "NOW.md");
    const design = manifest.descriptions.find((item) => item.file === "docs/design.md");
    assert.equal(design.pins, 1);
    assert.deepEqual(design.mappedCode, ["weather/**"]);
    assert.equal(manifest.descriptions.some((item) => item.file === "docs/adr.md"), false);
    assert.equal(manifest.descriptions.some((item) => item.file === "docs/log.md"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("withoutFences strips fenced blocks while preserving 4-space indented code", () => {
  const src = "def f():\n    return 1\n```\nignored\n```\n    return 2\n";
  const out = withoutFences(src);
  assert.match(out, /return 1/);
  assert.match(out, /return 2/);
  assert.doesNotMatch(out, /ignored/);
});

test("the core names no project: no path of a machine, no address, no tool, no other script", async () => {
  const core = ["GUIDE.md", "GARDEN.md", "AXIOMS.lock.md"].map((file) => readFileSync(new URL(`../core/${file}`, import.meta.url), "utf8"));
  for (const text of core) assert.doesNotMatch(text, /\/(?:Users|home)\/|@\w+\.\w|https?:|\b(?:Claude|Codex|Gemini|GPT|npm|cargo|pip|git)\b|\p{Script=Han}|\b[A-Z]{1,3}\d{2,}\b|\bAD-/u);
});
