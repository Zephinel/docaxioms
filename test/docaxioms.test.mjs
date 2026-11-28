// init, update and CLI: a project's own files are never touched, and the core comes whole, pinned, or not at all.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { check } from "../src/check.mjs";
import { checkCommand, init, packageVersion, source, update } from "../src/manage.mjs";

const CLI = fileURLToPath(new URL("../bin/docaxioms.mjs", import.meta.url));

const inProject = (name, run) => test(name, async () => {
  const root = mkdtempSync(join(tmpdir(), "docaxioms-"));
  const at = (file) => join(root, file);
  try {
    await run({
      root,
      at,
      read: (file) => readFileSync(at(file), "utf8"),
      profile: () => JSON.parse(readFileSync(at("docaxioms.json"), "utf8")),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
const failing = async (root, profile) => (await check(root, profile))
  .filter((result) => result.level !== "aid" && result.problems.length)
  .map((result) => result.name);

inProject("a new project passes its own check and pins version plus pure-text core files", async ({ root, at, read, profile }) => {
  init(root, "c1");
  assert.equal(profile().core.commit, "c1");
  assert.equal(profile().core.version, packageVersion());
  assert.deepEqual(await failing(root, profile()), []);
  assert.equal(existsSync(at("docaxioms/AXIOMS.lock.md")), true);
  assert.equal(existsSync(at("docaxioms/GUIDE.md")), true);
  assert.equal(existsSync(at("docaxioms/GARDEN.md")), true);
  assert.equal(existsSync(at("docaxioms/check.mjs")), false);
  assert.equal(read("CLAUDE.md").trim(), "@AGENTS.md");
});
inProject("a project's own files stay as they are", async ({ root, at, read }) => {
  mkdirSync(at("docs")); writeFileSync(at("AGENTS.md"), "mine\n"); writeFileSync(at("docs/log.md"), "my log\n");
  init(root, "c1");
  assert.equal(read("AGENTS.md"), "mine\n"); assert.equal(read("docs/log.md"), "my log\n");
  assert.throws(() => init(root, "c2"), /run docaxioms update instead/);
});
inProject("a folder of the project's own name is not taken over", async ({ root, at, read }) => {
  mkdirSync(at("docaxioms")); writeFileSync(at("docaxioms/mine.txt"), "mine\n");
  assert.throws(() => init(root, "c1"), /of its own/);
  assert.equal(read("docaxioms/mine.txt"), "mine\n");
});
inProject("update pins the new commit and keeps the profile's other keys", async ({ root, at, profile }) => {
  init(root, "c1");
  writeFileSync(at("docaxioms.json"), JSON.stringify({ ...profile(), gonePaths: ["old/"] }));
  update(root, "c2");
  assert.equal(profile().core.commit, "c2"); assert.deepEqual(profile().gonePaths, ["old/"]);
});
inProject("update does not write over a local change, and the check names it", async ({ root, at, read, profile }) => {
  init(root, "c1"); appendFileSync(at("docaxioms/GUIDE.md"), "mine\n");
  assert.throws(() => update(root, "c2"), /was changed in the project/);
  assert.ok(read("docaxioms/GUIDE.md").endsWith("mine\n")); assert.equal(profile().core.commit, "c1");
  assert.deepEqual(await failing(root, profile()), ["core files are the pinned version"]);
});
inProject("update does not delete a file that is not the core's", async ({ root, at, read }) => {
  init(root, "c1"); writeFileSync(at("docaxioms/mine.txt"), "mine\n");
  assert.throws(() => update(root, "c2"), /is not one of the core files/);
  assert.equal(read("docaxioms/mine.txt"), "mine\n");
});
inProject("update removes a pinned core file that the core no longer has", async ({ root, at, profile }) => {
  init(root, "c1");
  writeFileSync(at("docaxioms/OLD.md"), "dropped\n");
  const pinned = profile();
  pinned.core.files["OLD.md"] = createHash("sha256").update("dropped\n").digest("hex");
  writeFileSync(at("docaxioms.json"), JSON.stringify(pinned));
  update(root, "c2");
  assert.equal(existsSync(at("docaxioms/OLD.md")), false);
  assert.equal("OLD.md" in profile().core.files, false);
});
inProject("changed axioms come only with the owner's word", async ({ root, at, profile }) => {
  init(root, "c1");
  execFileSync("chmod", ["644", at("docaxioms/AXIOMS.lock.md")]); writeFileSync(at("docaxioms/AXIOMS.lock.md"), "older axioms\n");
  const before = profile(); before.core.files["AXIOMS.lock.md"] = createHash("sha256").update("older axioms\n").digest("hex"); writeFileSync(at("docaxioms.json"), JSON.stringify(before));
  assert.throws(() => update(root, "c2"), /only on the owner's word/);
  assert.equal(profile().core.commit, "c1");
  update(root, "c2", { acceptAxioms: true });
  assert.deepEqual(await failing(root, profile()), []);
});
inProject("a project pins only what was committed, and source() returns undefined outside git", async ({ root, at }) => {
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  cpSync(new URL("../core", import.meta.url), at("core"), { recursive: true });
  writeFileSync(at("package.json"), JSON.stringify({ name: "docaxioms", version: "0.2.0" }));
  assert.equal(source(root), undefined);
  assert.equal(packageVersion(root), "0.2.0");
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "base");
  assert.match(source(root), /^[0-9a-f]{40}$/);
  appendFileSync(at("core/GUIDE.md"), "x");
  assert.throws(() => source(root), /uncommitted/);
});
inProject("a core in a folder of another name stays there, and docaxioms/ stays the project's", async ({ root, at, read, profile }) => {
  init(root, "c1");
  cpSync(at("docaxioms"), at("law"), { recursive: true }); execFileSync("chmod", ["-R", "u+w", at("docaxioms")]); rmSync(at("docaxioms"), { recursive: true });
  const moved = profile(); moved.core.dir = "law"; writeFileSync(at("docaxioms.json"), JSON.stringify(moved));
  mkdirSync(at("docaxioms")); writeFileSync(at("docaxioms/mine.txt"), "mine\n");
  update(root, "c2");
  assert.equal(read("docaxioms/mine.txt"), "mine\n"); assert.equal(profile().core.dir, "law"); assert.equal(profile().core.commit, "c2");
});
inProject("a core folder outside the project is refused", async ({ root, at, profile }) => {
  init(root, "c1");
  for (const dir of ["../elsewhere", "", "/tmp/x", "a/../.."]) {
    const bad = profile(); bad.core.dir = dir; writeFileSync(at("docaxioms.json"), JSON.stringify(bad));
    assert.throws(() => update(root, "c2"), /folder/);
  }
});
inProject("an update writes only what changed", async ({ root, at }) => {
  const { statSync } = await import("node:fs");
  init(root, "c1"); const before = statSync(at("docaxioms/AXIOMS.lock.md"));
  update(root, "c2"); const after = statSync(at("docaxioms/AXIOMS.lock.md"));
  assert.deepEqual([after.ino, after.mtimeMs, after.mode], [before.ino, before.mtimeMs, before.mode]);
});
inProject("a pinned name outside the core folder removes nothing", async ({ root, at, read, profile }) => {
  init(root, "c1"); writeFileSync(at("mine.md"), "mine\n");
  const bad = profile(); bad.core.files["../mine.md"] = createHash("sha256").update("mine\n").digest("hex"); writeFileSync(at("docaxioms.json"), JSON.stringify(bad));
  assert.throws(() => update(root, "c2"), /not a file of the core folder/);
  assert.equal(read("mine.md"), "mine\n");
});
inProject("CLI check respects gate vs aid exit codes, notes on --strict-aids, scoped pin --write previews, and garden", async ({ root, at, profile }) => {
  init(root, "c1");
  const configured = {
    ...profile(),
    evolutionary: { phrases: ["used to"] },
    codeToDocs: [{ code: "src/**", docs: ["docs/guide.md"], base: "origin/missing" }],
  };
  writeFileSync(at("docaxioms.json"), JSON.stringify(configured));
  writeFileSync(at("docs/guide.md"), "# Guide\n\nThis used to be manual.\n\n<!-- pin: README.md#L1-L2 -->\n");
  writeFileSync(at("docs/other.md"), "# Other\n\n<!-- pin: README.md -->\n");
  writeFileSync(at("README.md"), "# Demo\n\nSee [Guide](docs/guide.md) and [Other](docs/other.md).\n");
  appendFileSync(at("docs/README.md"), "\n- [Guide](guide.md)\n- [Other](other.md)\n");

  // Unpinned comment fails gate -> exit 1
  assert.throws(() => execFileSync("node", [CLI, "check", "--root", root], { stdio: "pipe" }));
  // --report exits 0 on findings
  execFileSync("node", [CLI, "check", "--root", root, "--report"], { stdio: "pipe" });
  // Bare pin --write without scope is refused (A7)
  assert.throws(() => execFileSync("node", [CLI, "pin", "--root", root, "--write"], { stdio: "pipe" }));
  // Scoped pin --write --file updates ONLY docs/guide.md and prints covered lines (R1)
  const pinOut = execFileSync("node", [CLI, "pin", "--root", root, "--write", "--file", "docs/guide.md"], { encoding: "utf8" });
  assert.match(pinOut, /1 \| # Demo/);
  assert.throws(() => execFileSync("node", [CLI, "check", "--root", root], { stdio: "pipe" }));
  // Pin the remaining doc
  execFileSync("node", [CLI, "pin", "--root", root, "--write", "--file", "docs/other.md"], { stdio: "pipe" });
  // A scope that names no pin is an error; one whose pins are all up to date is not
  assert.throws(() => execFileSync("node", [CLI, "pin", "--root", root, "--write", "--file", "README.md"], { stdio: "pipe" }));
  assert.throws(() => execFileSync("node", [CLI, "pin", "--root", root, "--write", "--pin", "docs/guide.md:99"], { stdio: "pipe" }));
  assert.match(execFileSync("node", [CLI, "pin", "--root", root, "--write", "--file", "docs/guide.md"], { encoding: "utf8" }), /all code pins are up to date/);
  // Now evolutionary aid triggers -> default check exits 0, --strict-aids exits 1
  const out = execFileSync("node", [CLI, "check", "--root", root], { encoding: "utf8" });
  assert.match(out, /aid  current descriptions narrate past changes/);
  assert.match(out, /note: there is no commit to compare with/);
  assert.match(out, /^note code changed, but the documents mapped to it did not/m);
  assert.throws(() => execFileSync("node", [CLI, "check", "--root", root, "--strict-aids"], { stdio: "pipe" }));
  // Remove evolutionary wording: ONLY degraded note remains -> even --strict-aids MUST exit 0 (R3)
  writeFileSync(at("docs/guide.md"), readFileSync(at("docs/guide.md"), "utf8").replace("used to be", "is"));
  execFileSync("node", [CLI, "check", "--root", root, "--strict-aids"], { stdio: "pipe" });
  // garden --json lists descriptions (excluding CLAUDE.md and docs/log.md) and stageCard
  const garden = JSON.parse(execFileSync("node", [CLI, "garden", "--root", root, "--json"], { encoding: "utf8" }));
  assert.equal(garden.guidePath, "docaxioms/GARDEN.md");
  assert.equal(garden.stageCard.file, "CURRENT.md");
  assert.equal(garden.descriptions.some((d) => d.file === "CLAUDE.md"), false);
  assert.equal(garden.descriptions.some((d) => d.file === "docs/log.md"), false);
  assert.equal(garden.descriptions.find((d) => d.file === "docs/guide.md").pins, 1);
});
inProject("check exits 1 when a check cannot run, even with --report or --json (A6)", async ({ root, at, profile }) => {
  init(root, "c1");
  writeFileSync(at("own.mjs"), "export default [{ name: \"own\", axioms: \"A6\", run: () => { throw new Error(\"boom\"); } }];\n");
  writeFileSync(at("docaxioms.json"), JSON.stringify({ ...profile(), projectChecks: "own.mjs" }));
  for (const flags of [[], ["--report"], ["--json"], ["--report", "--json"]]) {
    let failed;
    try { execFileSync("node", [CLI, "check", "--root", root, ...flags], { stdio: "pipe" }); } catch (error) { failed = error; }
    assert.equal(failed?.status, 1, `check ${flags.join(" ")}`);
    assert.match(String(failed.stdout), /boom/);
  }
});

inProject("check reports an invalid profile as a finding; pin and garden refuse to run", async ({ root, at, profile }) => {
  init(root, "c1");
  writeFileSync(at("docaxioms.json"), JSON.stringify({ ...profile(), foo: 1 }));
  assert.throws(() => execFileSync("node", [CLI, "check", "--root", root], { stdio: "pipe" }));
  assert.match(execFileSync("node", [CLI, "check", "--root", root, "--report"], { encoding: "utf8" }), /foo is not a key/);
  for (const args of [["pin"], ["garden"]]) {
    let failed;
    try { execFileSync("node", [CLI, ...args, "--root", root], { stdio: "pipe" }); } catch (error) { failed = error; }
    assert.equal(failed?.status, 1, args.join(" "));
    assert.match(String(failed.stderr), /foo is not a key/);
  }
});

test("a project's copy carries the licence, the same as here", () => {
  assert.equal(readFileSync(new URL("../core/LICENSE", import.meta.url), "utf8"), readFileSync(new URL("../LICENSE", import.meta.url), "utf8"));
});

test("the printed check command changes into the project, and a POSIX shell reads the directory literally, CDPATH or not", { skip: process.platform === "win32" }, () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "docaxioms-cmd-")));
  try {
    assert.equal(checkCommand(base, base), "npx --no-install docaxioms check");
    const decoy = join(base, "decoy");
    for (const name of ["packages/docs", "bin", ".hidden", "C:/docs", "my docs", "docs$(echo injected)", "it's", "-docs", "a\\b", "x;y&z`w`"]) {
      mkdirSync(join(decoy, name), { recursive: true });
      const dir = join(base, name);
      mkdirSync(dir, { recursive: true });
      const command = checkCommand(dir, base);
      assert.ok(command.endsWith(" && npx --no-install docaxioms check"), command);
      const landed = execFileSync("/bin/sh", ["-c", command.replace("npx --no-install docaxioms check", "pwd -P")], { cwd: base, encoding: "utf8", env: { ...process.env, CDPATH: decoy } }).trim();
      assert.equal(landed, realpathSync(dir), command);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
