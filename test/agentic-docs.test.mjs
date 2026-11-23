// init and update: a project's own files are never touched, and the core comes whole, pinned, or not at all.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { check } from "../core/check.mjs";
import { init, source, update } from "../agentic-docs.mjs";

const inProject = (name, run) => test(name, async () => {
  const root = mkdtempSync(join(tmpdir(), "agentic-docs-")); const at = (file) => join(root, file);
  try { await run({ root, at, read: (file) => readFileSync(at(file), "utf8"), profile: () => JSON.parse(readFileSync(at("agentic-docs.json"), "utf8")) }); } finally { rmSync(root, { recursive: true, force: true }); }
});
const failing = async (root, profile) => (await check(root, profile)).filter((result) => result.problems.length).map((result) => result.name);

inProject("a new project passes its own check", async ({ root, at, profile }) => {
  init(root, "c1");
  assert.equal(profile().core.commit, "c1");
  assert.deepEqual(await failing(root, profile()), []);
  assert.equal(existsSync(at("agentic-docs/check.mjs")), true);
});
inProject("a project's own files stay as they are", async ({ root, at, read }) => {
  mkdirSync(at("docs")); writeFileSync(at("AGENTS.md"), "mine\n"); writeFileSync(at("docs/log.md"), "my log\n");
  init(root, "c1");
  assert.equal(read("AGENTS.md"), "mine\n"); assert.equal(read("docs/log.md"), "my log\n");
  assert.throws(() => init(root, "c2"), /use update/);
});
inProject("a folder of the project's own name is not taken over", async ({ root, at, read }) => {
  mkdirSync(at("agentic-docs")); writeFileSync(at("agentic-docs/mine.txt"), "mine\n");
  assert.throws(() => init(root, "c1"), /of its own/);
  assert.equal(read("agentic-docs/mine.txt"), "mine\n");
});
inProject("update pins the new commit and keeps the profile's other keys", async ({ root, at, profile }) => {
  init(root, "c1");
  writeFileSync(at("agentic-docs.json"), JSON.stringify({ ...profile(), gonePaths: ["old/"] }));
  update(root, "c2");
  assert.equal(profile().core.commit, "c2"); assert.deepEqual(profile().gonePaths, ["old/"]);
});
inProject("update does not write over a local change, and the check names it", async ({ root, at, read, profile }) => {
  init(root, "c1"); appendFileSync(at("agentic-docs/GUIDE.md"), "mine\n");
  assert.throws(() => update(root, "c2"), /was changed in the project/);
  assert.ok(read("agentic-docs/GUIDE.md").endsWith("mine\n")); assert.equal(profile().core.commit, "c1");
  assert.deepEqual(await failing(root, profile()), ["core files are the pinned version"]);
});
inProject("update does not delete a file that is not the core's", async ({ root, at, read }) => {
  init(root, "c1"); writeFileSync(at("agentic-docs/mine.txt"), "mine\n");
  assert.throws(() => update(root, "c2"), /not part of the core/);
  assert.equal(read("agentic-docs/mine.txt"), "mine\n");
});
inProject("changed axioms come only with the owner's word", async ({ root, at, profile }) => {
  init(root, "c1");
  execFileSync("chmod", ["644", at("agentic-docs/AXIOMS.lock.md")]); writeFileSync(at("agentic-docs/AXIOMS.lock.md"), "older axioms\n");
  const { createHash } = await import("node:crypto");
  const before = profile(); before.core.files["AXIOMS.lock.md"] = createHash("sha256").update("older axioms\n").digest("hex"); writeFileSync(at("agentic-docs.json"), JSON.stringify(before));
  assert.throws(() => update(root, "c2"), /only on the owner's word/);
  assert.equal(profile().core.commit, "c1");
  update(root, "c2", { acceptAxioms: true });
  assert.deepEqual(await failing(root, profile()), []);
});
inProject("a project pins only what was committed", async ({ root, at }) => {
  const git = (...args) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8" });
  cpSync(new URL("../core", import.meta.url), at("core"), { recursive: true });
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "base");
  assert.match(source(root), /^[0-9a-f]{40}$/);
  appendFileSync(at("core/GUIDE.md"), "x");
  assert.throws(() => source(root), /uncommitted/);
});
inProject("a core in a folder of another name stays there, and agentic-docs/ stays the project's", async ({ root, at, read, profile }) => {
  init(root, "c1");
  cpSync(at("agentic-docs"), at("law"), { recursive: true }); execFileSync("chmod", ["-R", "u+w", at("agentic-docs")]); rmSync(at("agentic-docs"), { recursive: true });
  const moved = profile(); moved.core.dir = "law"; writeFileSync(at("agentic-docs.json"), JSON.stringify(moved));
  mkdirSync(at("agentic-docs")); writeFileSync(at("agentic-docs/mine.txt"), "mine\n");
  update(root, "c2");
  assert.equal(read("agentic-docs/mine.txt"), "mine\n"); assert.equal(profile().core.dir, "law"); assert.equal(profile().core.commit, "c2");
});
inProject("a core folder outside the project is refused", async ({ root, at, profile }) => {
  init(root, "c1");
  for (const dir of ["../elsewhere", "", "/tmp/x", "a/../.."]) {
    const bad = profile(); bad.core.dir = dir; writeFileSync(at("agentic-docs.json"), JSON.stringify(bad));
    assert.throws(() => update(root, "c2"), /folder/);
  }
});
inProject("an update writes only what changed", async ({ root, at }) => {
  const { statSync } = await import("node:fs");
  init(root, "c1"); const before = statSync(at("agentic-docs/AXIOMS.lock.md"));
  update(root, "c2"); const after = statSync(at("agentic-docs/AXIOMS.lock.md"));
  assert.deepEqual([after.ino, after.mtimeMs, after.mode], [before.ino, before.mtimeMs, before.mode]);
});
inProject("a pinned name outside the core folder removes nothing", async ({ root, at, read, profile }) => {
  init(root, "c1"); writeFileSync(at("mine.md"), "mine\n");
  const { createHash } = await import("node:crypto");
  const bad = profile(); bad.core.files["../mine.md"] = createHash("sha256").update("mine\n").digest("hex"); writeFileSync(at("agentic-docs.json"), JSON.stringify(bad));
  assert.throws(() => update(root, "c2"), /not a file of the core folder/);
  assert.equal(read("mine.md"), "mine\n");
});
test("a project's copy carries the licence, the same as here", () => {
  assert.equal(readFileSync(new URL("../core/LICENSE", import.meta.url), "utf8"), readFileSync(new URL("../LICENSE", import.meta.url), "utf8"));
});
