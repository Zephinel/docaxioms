#!/usr/bin/env node
// Brings agentic-docs into a project, and a project up to date. Run from a clean checkout of agentic-docs:
//
//   node agentic-docs.mjs init <project>                       the core, a profile and starter documents
//   node agentic-docs.mjs update <project> [--accept-axioms]   the core as it is at this checkout's commit
//
// A project holds a copy of core/, pinned in its agentic-docs.json by this commit and each file's SHA-256 (A4: a checked copy
// does not diverge). Nothing of a project's own is ever overwritten.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = "agentic-docs";
const AXIOMS = "AXIOMS.lock.md";
const hash = (file) => createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
const stop = (why) => { throw new Error(why); };

/** The commit of this checkout, which must be what was committed. */
export function source(from = HERE) {
  const git = (...args) => execFileSync("git", ["-C", from, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("status", "--porcelain")) stop("this checkout of agentic-docs has uncommitted changes: a project pins a commit");
  return git("rev-parse", "HEAD");
}

const CORE = () => readdirSync(join(HERE, "core")).filter((name) => !name.startsWith(".")).sort();

/** Where a project holds the core: a folder of its own, inside the project. */
function folder(project, profile) {
  const dir = profile.core?.dir ?? DIR;
  const inside = typeof dir === "string" && dir !== "" && !isAbsolute(dir) && normalize(dir) === dir && !dir.split("/").includes("..") && dir !== ".";
  return inside ? dir : stop(`core.dir "${dir}" is not a folder inside the project`);
}

function putCore(project, profile, commit) {
  const dir = folder(project, profile); const core = join(project, dir);
  mkdirSync(core, { recursive: true });
  // What the core no longer has: only files the project's pin names, which `update` found unchanged.
  for (const name of Object.keys(profile.core?.files ?? {})) if (!CORE().includes(name) && existsSync(join(core, name))) rmSync(join(core, name));
  for (const name of CORE()) {
    const to = join(core, name);
    if (existsSync(to)) { if (hash(to) === hash(join(HERE, "core", name))) continue; chmodSync(to, 0o644); }
    copyFileSync(join(HERE, "core", name), to);
    chmodSync(to, name === AXIOMS ? 0o444 : 0o644);
  }
  profile.core = { dir, source: "https://github.com/Zephinel/agentic-docs", commit, files: Object.fromEntries(CORE().map((name) => [name, hash(join(core, name))])) };
  writeFileSync(join(project, "agentic-docs.json"), `${JSON.stringify(profile, null, 2)}\n`);
}

export function init(project, commit) {
  if (existsSync(join(project, "agentic-docs.json"))) stop("the project has a agentic-docs.json: use update");
  if (existsSync(join(project, DIR))) stop(`the project has a ${DIR}/ folder of its own`);
  const made = [];
  const copy = (from, to) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const target = join(to, entry.name);
      if (entry.isDirectory()) copy(join(from, entry.name), target);
      else if (entry.name !== "agentic-docs.json" && !existsSync(target)) { mkdirSync(to, { recursive: true }); copyFileSync(join(from, entry.name), target); made.push(target.slice(project.length + 1)); }
    }
  };
  copy(join(HERE, "templates"), project);
  putCore(project, JSON.parse(readFileSync(join(HERE, "templates", "agentic-docs.json"), "utf8")), commit);
  return made;
}

export function update(project, commit, { acceptAxioms = false } = {}) {
  const file = join(project, "agentic-docs.json");
  if (!existsSync(file)) stop("the project has no agentic-docs.json: use init");
  const profile = JSON.parse(readFileSync(file, "utf8"));
  const pinned = profile.core?.files ?? {};
  const where = folder(project, profile); const dir = join(project, where);
  for (const name of Object.keys(pinned)) if (name !== basename(name)) stop(`agentic-docs.json pins ${name}, which is not a file of the core folder`);
  for (const [name, pin] of Object.entries(pinned)) if (existsSync(join(dir, name)) && hash(join(dir, name)) !== pin) stop(`${where}/${name} was changed in the project: take that change to agentic-docs first`);
  if (existsSync(dir)) for (const name of readdirSync(dir).filter((one) => one !== ".DS_Store")) if (!(name in pinned)) stop(`${where}/${name} is not part of the core: move it out first`);
  if (pinned[AXIOMS] && pinned[AXIOMS] !== hash(join(HERE, "core", AXIOMS)) && !acceptAxioms) stop("the axioms changed: only on the owner's word (A0). With it, use --accept-axioms and add a decision that quotes it");
  putCore(project, profile, commit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, project] = process.argv.slice(2);
  try {
    if (!["init", "update"].includes(command) || !project) stop("usage: node agentic-docs.mjs init|update <project> [--accept-axioms]");
    if (!existsSync(project)) stop(`${project} is not there`);
    const root = resolve(project); const commit = source();
    if (command === "init") for (const made of init(root, commit)) console.log(`made ${made}`);
    else update(root, commit, { acceptAxioms: process.argv.includes("--accept-axioms") });
    console.log(`${DIR}/ is agentic-docs ${commit.slice(0, 8)}; now: node ${DIR}/check.mjs`);
  } catch (error) { console.error(error.message); process.exit(1); }
}
