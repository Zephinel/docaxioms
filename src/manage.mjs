// Brings docaxioms's pinned specification core into a project, and keeps it up to date.
// A project holds a copy of core/ (pure-text axioms, guide, gardening protocol, licence),
// pinned in its docaxioms.json by package version (and commit when from git) plus each file's SHA-256 (A4).
// Nothing of a project's own is ever overwritten.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = "docaxioms";
const AXIOMS = "AXIOMS.lock.md";
const hash = (file) => createHash("sha256").update(readFileSync(file, "utf8")).digest("hex");
const stop = (why) => { throw new Error(why); };

export function packageVersion(from = HERE) {
  const pkgPath = join(from, "package.json");
  if (!existsSync(pkgPath)) stop("package.json is not there");
  return JSON.parse(readFileSync(pkgPath, "utf8")).version;
}

/** Clean git checkout commit SHA, or undefined when installed as an npm package (no .git). */
export function source(from = HERE) {
  if (!existsSync(join(from, ".git"))) return undefined;
  const git = (...args) => execFileSync("git", ["-C", from, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (git("status", "--porcelain")) stop("this checkout of docaxioms has uncommitted changes: a project pins a commit");
  return git("rev-parse", "HEAD");
}

/**
 * The command that checks `project`, as typed from `cwd` in a POSIX shell. It changes into the project first,
 * so that npx finds the project's own installation; the directory is quoted so that the shell reads it literally,
 * and starts with `./` or `../` so that `cd` neither searches CDPATH nor reads it as an option.
 */
export function checkCommand(project, cwd = process.cwd()) {
  const run = "npx --no-install docaxioms check";
  const rel = relative(cwd, project).split(sep).join("/");
  if (!rel) return run;
  const dir = isAbsolute(rel) || /^(\.\.\/|\.\.$)/.test(rel) ? rel : `./${rel}`;
  const quoted = /^[\w./:@%+=,-]+$/.test(dir) ? dir : `'${dir.replace(/'/g, "'\\''")}'`;
  return `cd ${quoted} && ${run}`;
}

const CORE = () => readdirSync(join(HERE, "core")).filter((name) => !name.startsWith(".")).sort();

/** Where a project holds the core: a folder of its own, inside the project. */
function folder(project, profile) {
  const dir = profile.core?.dir ?? DIR;
  const inside = typeof dir === "string" && dir !== "" && !isAbsolute(dir) && normalize(dir) === dir && !dir.split("/").includes("..") && dir !== ".";
  return inside ? dir : stop(`core.dir "${dir}" is not a folder inside the project`);
}

function putCore(project, profile, commit) {
  const dir = folder(project, profile);
  const core = join(project, dir);
  mkdirSync(core, { recursive: true });
  // What the core no longer has: only files the project's pin names, which `update` found unchanged.
  for (const name of Object.keys(profile.core?.files ?? {})) {
    if (!CORE().includes(name) && existsSync(join(core, name))) rmSync(join(core, name));
  }
  for (const name of CORE()) {
    const to = join(core, name);
    if (existsSync(to)) {
      if (hash(to) === hash(join(HERE, "core", name))) continue;
      chmodSync(to, 0o644);
    }
    copyFileSync(join(HERE, "core", name), to);
    chmodSync(to, name === AXIOMS ? 0o444 : 0o644);
  }
  const coreMeta = {
    dir,
    source: "https://github.com/Zephinel/docaxioms",
    version: packageVersion(),
    ...(commit ? { commit } : {}),
    files: Object.fromEntries(CORE().map((name) => [name, hash(join(core, name))])),
  };
  profile.core = coreMeta;
  writeFileSync(join(project, "docaxioms.json"), `${JSON.stringify(profile, null, 2)}\n`);
}

export function init(project, commit) {
  if (existsSync(join(project, "docaxioms.json"))) stop("the project has a docaxioms.json: use update");
  if (existsSync(join(project, DIR))) stop(`the project has a ${DIR}/ folder of its own`);
  const made = [];
  const copy = (from, to) => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      const target = join(to, entry.name);
      if (entry.isDirectory()) {
        copy(join(from, entry.name), target);
      } else if (entry.name !== "docaxioms.json" && !existsSync(target)) {
        mkdirSync(to, { recursive: true });
        copyFileSync(join(from, entry.name), target);
        made.push(target.slice(project.length + 1));
      }
    }
  };
  copy(join(HERE, "templates"), project);
  putCore(project, JSON.parse(readFileSync(join(HERE, "templates", "docaxioms.json"), "utf8")), commit);
  return made;
}

export function update(project, commit, { acceptAxioms = false } = {}) {
  const file = join(project, "docaxioms.json");
  if (!existsSync(file)) stop("the project has no docaxioms.json: use init");
  const profile = JSON.parse(readFileSync(file, "utf8"));
  const pinned = profile.core?.files ?? {};
  const where = folder(project, profile);
  const dir = join(project, where);
  for (const name of Object.keys(pinned)) {
    if (name !== basename(name)) stop(`docaxioms.json pins ${name}, which is not a file of the core folder`);
  }
  for (const [name, pin] of Object.entries(pinned)) {
    if (existsSync(join(dir, name)) && hash(join(dir, name)) !== pin) {
      stop(`${where}/${name} was changed in the project: take that change to docaxioms first`);
    }
  }
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((one) => one !== ".DS_Store")) {
      if (!(name in pinned)) stop(`${where}/${name} is not part of the core: move it out first`);
    }
  }
  if (pinned[AXIOMS] && pinned[AXIOMS] !== hash(join(HERE, "core", AXIOMS)) && !acceptAxioms) {
    stop("the axioms changed: only on the owner's word (A0). With it, use --accept-axioms and add a decision that quotes it");
  }
  putCore(project, profile, commit);
}
