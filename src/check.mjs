// The documentation check engine of docaxioms.
// Paths, id prefixes, budgets, commands, mappings and limits come from the project's profile (docaxioms.json),
// and project-only rules from its own module (`projectChecks`).
// Per M2 (A6, A7), every check has a level:
//   - "gate": predicate is precise; fails exit code 1 on any problem.
//   - "aid":  review aid; prints findings and counts without failing exit code (unless --strict-aids).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toString } from "mdast-util-to-string";
import picomatch from "picomatch";
import { extractLinkTargets, parseMarkdown, withoutFences, withoutLinkTargets } from "./markdown.mjs";
import { verifyPins } from "./pins.mjs";
import { profileProblems, usableProfile } from "./profile.mjs";

export { withoutFences };

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;
const FULL_SHA = /^[0-9a-f]{40}$/i;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const safeDecode = (text) => {
  try { return decodeURIComponent(text); } catch { return text; }
};

/** Why a file that docaxioms.json names at `setting` cannot be read, or undefined when it can. */
function fileFault(p, file, setting) {
  const where = `${file} (${setting} in docaxioms.json)`;
  if (!p.inside(file)) return `${where} leads outside the repository`;
  if (p.isFolder(file)) return `${where} is a folder, not a file`;
  if (!p.isFile(file)) return `${where} does not exist`;
  return undefined;
}

/** The README.md of a folder; for `.`, the repository root, that is README.md itself. */
const readmeOf = (folder) => (folder === "." ? "README.md" : `${folder}/README.md`);

/**
 * Where a link target leads in the repository: from the document's folder, or from the repository root when it
 * starts with `/`. A target that leads out of the repository is marked `outside`, so that nothing reads it (A2, A4).
 */
export function resolveTarget(fromFile, rawPath) {
  const decoded = safeDecode(rawPath).replace(/\\/g, "/");
  const joined = decoded.startsWith("/") ? decoded.replace(/^\/+/, "") || "." : join(dirname(fromFile), decoded);
  const path = normalize(joined).replace(/\\/g, "/").replace(/\/$/, "");
  return path === ".." || path.startsWith("../") || isAbsolute(path) ? { path, outside: true } : { path };
}

function makeMatcher(patterns) {
  const list = asArray(patterns);
  if (!list.length) return () => false;
  return picomatch(list, { dot: true });
}

/** Git helper returning stdout, or undefined on failure. */
function runGit(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** The commit to compare with: the merge base with `wantedBase`, else HEAD; any fallback is reported (A6). */
function resolveBase(root, wantedBase) {
  const target = wantedBase ?? "origin/main";
  const base = runGit(root, ["merge-base", target, "HEAD"])?.trim();
  if (base) return { base, degraded: null };
  const head = runGit(root, ["rev-parse", "HEAD"])?.trim();
  if (!head) return { base: null, degraded: "there is no commit to compare with (this is not a git repository, or it has no commits yet), so nothing was compared" };
  return { base: head, degraded: `base "${target}" was not found, or it shares no history with HEAD, so HEAD was used instead (committed changes were not compared)` };
}

/** Changed files relative to base (including untracked files in working tree), reporting any fallback (A6). */
function changedFiles(root, baseRef) {
  const { base, degraded } = resolveBase(root, baseRef);
  if (!base) return { files: null, degraded };
  const files = new Set();
  const diff = runGit(root, ["diff", "--name-only", "-z", base]);
  if (diff) for (const file of diff.split("\0")) if (file) files.add(file);
  const untracked = runGit(root, ["ls-files", "-z", "--others", "--exclude-standard"]);
  if (untracked) for (const file of untracked.split("\0")) if (file) files.add(file);
  return { files, degraded };
}

export function project(root, given) {
  // The checks read only the valid part of the profile; the profile check reports the rest from `given` (profile.mjs).
  const profile = usableProfile(given);
  if (!profile) throw new Error("docaxioms.json: the profile must be a JSON object");
  const at = (file) => join(root, file);
  // A path can look inside the repository and still lead out of it through a symbolic link. So take the nearest part
  // of the path that exists and check where it really is, without looking at anything outside the repository.
  const realRoot = realpathSync(root);
  const inside = (path) => {
    for (let probe = at(path); ; probe = dirname(probe)) {
      try {
        const real = realpathSync(probe);
        return real === realRoot || real.startsWith(`${realRoot}${sep}`);
      } catch {
        // A broken symbolic link may point anywhere, so it counts as outside.
        try { if (lstatSync(probe).isSymbolicLink()) return false; } catch { /* not there: try its folder */ }
        if (dirname(probe) === probe) return false;
      }
    }
  };
  const cache = new Map();
  const mdCache = new Map();
  // Every read goes through here, so nothing outside the repository is read, whoever names it.
  const read = (file) => {
    if (!inside(file)) throw new Error(`${file} leads outside the repository`);
    if (!cache.has(file)) cache.set(file, readFileSync(at(file), "utf8"));
    return cache.get(file);
  };
  // has, isFile and isFolder look only inside the repository: a path that leads outside is never there.
  const has = (file) => inside(file) && existsSync(at(file));
  const isFile = (file) => has(file) && statSync(at(file)).isFile();
  const isFolder = (file) => has(file) && statSync(at(file)).isDirectory();
  const markdown = (file) => {
    if (!mdCache.has(file)) mdCache.set(file, parseMarkdown(read(file)));
    return mdCache.get(file);
  };
  const ignored = new Set([".git", "node_modules", ...(profile.ignore ?? [])]);
  const ignoredPath = (file) => file
    .split("/")
    .some((part, index, parts) => ignored.has(part) || ignored.has(parts.slice(0, index + 1).join("/")));
  const walk = (dir = "", out = []) => {
    for (const name of readdirSync(at(dir || "."))) {
      const path = dir ? `${dir}/${name}` : name;
      if (ignored.has(name) || ignored.has(path) || name === ".DS_Store") continue;
      const stat = lstatSync(at(path));
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(path, out); else out.push(path);
    }
    return out;
  };
  // What git ignores is not part of the project; without git, the profile's `ignore` is what there is.
  const listed = runGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  const all = listed !== undefined
    ? listed
      .split("\0")
      .filter((file) => file && has(file) && !lstatSync(at(file)).isSymbolicLink() && !ignoredPath(file))
    : walk();

  const inHistory = (file) => Boolean(profile.history) && file.startsWith(`${profile.history.dir}/`);
  // The core's content is its own repository's to check; here it only has to be the pinned version.
  const inCore = (file) => Boolean(profile.core?.dir) && file.startsWith(`${profile.core.dir}/`);
  const currentDocs = all.filter((file) => file.endsWith(".md") && !inHistory(file) && !inCore(file));
  const code = all.filter((file) => !inCore(file) && (profile.codeExtensions ?? []).some((extension) => file.endsWith(extension)));

  const locate = (fromFile, rawPath) => {
    const target = resolveTarget(fromFile, rawPath);
    return target.outside || inside(target.path) ? target : { ...target, outside: true };
  };
  // Where a link target in `file` leads: { target, anchor, path, outside }. Undefined for a link to another site, one
  // with a scheme or starting with `//`. A `?query` is not part of the path.
  const targetOf = (file, target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return undefined;
    const [address, anchor] = target.split("#");
    const path = address.split("?")[0];
    return { target, anchor, ...(path ? locate(file, path) : { path: file }) };
  };
  const sections = (file) => markdown(file).sections;
  const passage = (file, anchor) => markdown(file).passage(anchor);
  const links = (file) => markdown(file)
    .links()
    .map((target) => targetOf(file, target))
    .filter(Boolean);

  return {
    root,
    given,
    profile,
    read,
    has,
    isFile,
    isFolder,
    all,
    inHistory,
    inCore,
    currentDocs,
    code,
    markdown,
    sections,
    passage,
    links,
    targetOf,
    inside,
    locate,
    match: makeMatcher,
    at,
  };
}

/**
 * Decision rows: AST GFM table rows first, with non-fenced, non-comment pipe-row fallback for headerless rows.
 * Status is the fourth cell and landing the fifth, from `landedSection` onward (or all rows if unset).
 */
export function decisionRows(p) {
  const { file, id, landedSection } = p.profile.decisions;
  const md = p.markdown(file);
  const idRegex = new RegExp(`^${escape(id)}(\\d+)$`);
  const lineIdRegex = new RegExp(`^\\| ${escape(id)}(\\d+) \\|`);
  const landedAtLine = landedSection
    ? (md.sections.find((sec) => sec.line.startsWith(landedSection))?.start ?? Infinity)
    : -1;
  const isLanded = (lineIndex) => lineIndex >= landedAtLine;

  const rowsByLine = new Map();

  // Primary: real GFM table rows from the AST.
  for (const node of md.tree.children) {
    if (node.type !== "table") continue;
    for (let i = 1; i < node.children.length; i += 1) {
      const rowNode = node.children[i];
      const lineIndex = rowNode.position.start.line - 1;
      const cells = rowNode.children;
      const first = cells[0] ? toString(cells[0]).trim() : "";
      const match = idRegex.exec(first);
      if (!match) continue;
      const landed = isLanded(lineIndex);
      const status = landed && cells[3] ? toString(cells[3]).trim() : undefined;
      const landing = landed && cells[4]
        ? md.text.slice(cells[4].position.start.offset, cells[4].position.end.offset).trim()
        : undefined;
      rowsByLine.set(lineIndex, {
        number: Number(match[1]),
        name: `${id}${match[1]}`,
        status,
        landing,
        landingTargets: landed && cells[4] ? md.linksIn(cells[4]) : undefined,
      });
    }
  }

  // Fallback: headerless pipe rows outside fenced code blocks and HTML comments.
  const lines = md.withoutFencesAndComments.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (rowsByLine.has(lineIndex)) continue;
    const line = lines[lineIndex];
    const match = lineIdRegex.exec(line);
    if (!match) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());
    const landed = isLanded(lineIndex);
    const landing = landed ? cells[4] : undefined;
    rowsByLine.set(lineIndex, {
      number: Number(match[1]),
      name: `${id}${match[1]}`,
      status: landed ? cells[3] : undefined,
      landing,
      landingTargets: landing !== undefined ? extractLinkTargets(landing, md.definitions) : undefined,
    });
  }

  return [...rowsByLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

/** Resolve allowed command names for a `profile.commands` entry. */
function allowedCommands(p, rule) {
  if (Array.isArray(rule.list)) return { valid: new Set(rule.list) };
  if (rule.jsonFile) {
    const fault = fileFault(p, rule.jsonFile, "commands[].jsonFile");
    if (fault) return { error: fault };
    try {
      const parsed = JSON.parse(p.read(rule.jsonFile));
      const bucket = rule.key ? parsed?.[rule.key] : parsed;
      return { valid: bucket && typeof bucket === "object" ? new Set(Object.keys(bucket)) : new Set() };
    } catch (error) {
      return { error: `${rule.jsonFile}: invalid JSON (${error.message})` };
    }
  }
  if (rule.makefile) {
    const fault = fileFault(p, rule.makefile, "commands[].makefile");
    if (fault) return { error: fault };
    const targets = new Set();
    for (const line of p.read(rule.makefile).split("\n")) {
      if (!line || /^[\s#]/.test(line)) continue;
      const match = /^([^:=]+):(?!=)/.exec(line);
      if (!match) continue;
      for (const token of match[1].trim().split(/\s+/)) {
        if (token && !token.startsWith(".") && /^[A-Za-z0-9_.-]+$/.test(token)) targets.add(token);
      }
    }
    return { valid: targets };
  }
  return { valid: null };
}

/** Identify K3 description documents (excluding pinned core files, decisions, logs, plans, research, history, stage card, and explicit exemptions). */
export function descriptionDocs(p, extraExempt = []) {
  const { core, decisions, log, research, card } = p.profile;
  const coreDir = core?.dir ?? "";
  const pinnedCore = Object.keys(core?.files ?? {}).map((name) => (coreDir ? `${coreDir}/${name}` : name));
  const skipFiles = new Set([
    ...pinnedCore,
    decisions?.file,
    ...asArray(log),
    research?.items,
    card?.file,
  ].filter(Boolean));
  const isExempt = makeMatcher(extraExempt);
  return p.currentDocs.filter((file) => {
    if (skipFiles.has(file)) return false;
    if (research?.dir && file.startsWith(`${research.dir}/`)) return false;
    if (isExempt(file)) return false;
    return true;
  });
}

const CHECKS = [
  {
    name: "the profile has only known keys and valid values",
    axioms: "A6",
    level: "gate",
    run: ({ given }) => profileProblems(given),
  },

  {
    name: "core files are the pinned version",
    axioms: "A4, A6",
    level: "gate",
    run: ({ read, inside, isFile, isFolder, all, inCore, profile }) => {
      const { dir = "", files = {}, version, commit } = profile.core ?? {};
      const at = (file) => (dir ? `${dir}/${file}` : file);
      const versionProblem = version && version !== PACKAGE_VERSION
        ? [`docaxioms.json pins docaxioms version ${version}, but the docaxioms running is version ${PACKAGE_VERSION}: run docaxioms update, or run version ${version}`]
        : [];
      const runningCommit = commit && FULL_SHA.test(commit) && existsSync(join(PACKAGE_ROOT, ".git"))
        ? runGit(PACKAGE_ROOT, ["rev-parse", "HEAD"])?.trim()
        : undefined;
      const commitProblem = runningCommit && runningCommit.toLowerCase() !== commit.toLowerCase()
        ? [`docaxioms.json pins docaxioms commit ${commit.slice(0, 8)}, but the docaxioms checkout running is at ${runningCommit.slice(0, 8)}: run docaxioms update, or check out ${commit.slice(0, 8)}`]
        : [];
      return [
        ...versionProblem,
        ...commitProblem,
        ...Object.entries(files).flatMap(([file, hash]) => (!isFile(at(file))
          ? [fileFault({ inside, isFolder, isFile }, at(file), "core.files")]
          : createHash("sha256").update(read(at(file))).digest("hex") === hash
            ? []
            : [`${at(file)}: differs from the pinned version. It is a copy from docaxioms: change it in docaxioms, then run docaxioms update`])),
        ...all
          .filter((file) => inCore(file) && !(file.slice(dir.length + 1) in files))
          .map((file) => `${file}: is in the core folder but is not one of the core files`),
      ];
    },
  },

  {
    name: "links and anchors resolve",
    axioms: "A2, A4",
    level: "gate",
    run: (p) => p.currentDocs.flatMap((file) => p.links(file).flatMap(({ target, path, anchor, outside }) => {
      if (outside) return [`${file}: ${target} leads outside the repository`];
      if (!p.has(path)) return [`${file}: ${target} leads to a file that does not exist`];
      if (!anchor) return [];
      // A folder's headings are those of its README.
      const doc = p.isFolder(path) ? readmeOf(path) : path;
      if (!doc.endsWith(".md")) return [];
      return p.isFile(doc) && p.passage(doc, anchor) !== undefined ? [] : [`${file}: ${target} names a heading that does not exist`];
    })),
  },

  {
    name: "decision numbers are unique, and every cited decision exists",
    axioms: "A4",
    level: "gate",
    run: (p) => {
      if (!p.profile.decisions) return [];
      const fault = fileFault(p, p.profile.decisions.file, "decisions.file");
      if (fault) return [fault];
      const rows = decisionRows(p);
      const names = rows.map((row) => row.name);
      const known = new Set(names);
      const problems = names.filter((name, index) => names.indexOf(name) !== index).map((name) => `${name} has more than one row`);
      const cite = new RegExp(`\\b${escape(p.profile.decisions.id)}(\\d{1,4})\\b`, "g");
      const exempt = new RegExp(p.profile.decisions.citeExempt ?? "^$");
      const missing = new Set();
      for (const file of [...p.code, ...p.currentDocs].filter((name) => !exempt.test(name))) {
        const text = file.endsWith(".md") ? p.markdown(file).withoutFences : withoutFences(p.read(file));
        for (const [name] of text.matchAll(cite)) if (!known.has(name)) missing.add(`${file}: cites ${name}, which is not in ${p.profile.decisions.file}`);
      }
      return [...problems, ...missing];
    },
  },

  {
    name: "cited sections exist",
    axioms: "A4",
    level: "gate",
    run: (p) => (p.profile.sections ?? []).flatMap(({ cite, files, document, rowTables = {} }) => {
      const fault = fileFault(p, document, "sections[].document");
      if (fault) return [fault];
      const heads = new Set(
        p.sections(document)
          .filter((one) => one.level >= 2)
          .map((one) => /^#{2,6} (\d+(?:\.\d+)*)[. ]/.exec(one.line)?.[1])
          .filter(Boolean),
      );
      const rows = Object.fromEntries(
        Object.entries(rowTables).map(([head, heading]) => [
          head,
          new Set(
            [...(p.sections(document).find((one) => one.line.startsWith(heading))?.text ?? "").matchAll(/^\| (\d+) \|/gm)]
              .map((match) => match[1]),
          ),
        ]),
      );
      return p.code.filter((file) => new RegExp(files).test(file)).flatMap((file) => [...p.read(file).matchAll(new RegExp(cite, "g"))].flatMap(([whole, section]) => {
        const [head, row] = section.split("-");
        return row && rows[head]
          ? (rows[head].has(row) ? [] : [`${file}: cites "${whole}", but that table row is not in ${document}`])
          : heads.has(head) ? [] : [`${file}: cites "${whole}", but that section is not in ${document}`];
      }));
    }),
  },

  // A document named in code: only in a folder of documents that is there, so that a made-up path in a fixture is none.
  {
    name: "documents named in code exist",
    axioms: "A2, A7",
    level: "gate",
    run: (p) => {
      const folders = new Set(p.all.filter((file) => file.endsWith(".md") && file.includes("/")).map((file) => dirname(file)));
      const exempt = new RegExp(p.profile.codeDocExempt ?? "^$");
      return p.code
        .filter((file) => !exempt.test(file))
        .flatMap((file) => [...p.read(file).matchAll(/(?<![\w./-])((?:[\w.-]+\/)+[\w.-]+\.md)\b/g)]
          .filter(([, path]) => folders.has(dirname(path)) && !p.has(path))
          .map(([, path]) => `${file}: names ${path}, which does not exist`));
    },
  },

  // Descriptions of the present and the stage card only: a plan or research note may name paths still to come, a record names the past.
  {
    name: "paths named in current documents exist",
    axioms: "A2, A7",
    level: "gate",
    run: (p) => {
      const prefixes = (p.profile.pathPrefixes ?? []).map(escape).join("|");
      if (!prefixes) return [];
      const named = new RegExp(`^(?:${prefixes})[^\\s]*$`);
      const gone = p.profile.gonePaths ?? [];
      const elsewhere = new RegExp(p.profile.pathExempt ?? "^$");
      const back = gone
        .filter((path) => p.has(path.replace(/\/$/, "")))
        .map((path) => `${path} is listed in gonePaths in docaxioms.json, but it still exists`);
      const card = p.profile.card?.file;
      return [
        ...back,
        ...[...descriptionDocs(p), ...(card && p.currentDocs.includes(card) ? [card] : [])]
          .filter((file) => !elsewhere.test(file))
          .flatMap((file) => p.markdown(file).inlineCodes.flatMap(({ value: path }) => {
            if (!named.test(path)) return [];
            // A placeholder anywhere, even in `#<line>`, marks an example. A `#fragment` after a name is not part of the path.
            if (/[*<>{}…()|$]|\.\.\./.test(path)) return [];
            const literal = path.replace(/(?<=[^/])#.*$/, "").replace(/(:\d+)+(-\d+)?$/, "").replace(/\/$/, "");
            const lexical = normalize(literal).replace(/\\/g, "/");
            if (lexical === ".." || lexical.startsWith("../") || isAbsolute(literal) || !p.inside(lexical)) {
              return [`${file}: \`${path}\` leads outside the repository`];
            }
            return p.has(lexical)
              || gone.some((one) => `${lexical}/`.startsWith(one.replace(/\/?$/, "/")))
              ? []
              : [`${file}: \`${path}\` does not exist`];
          })),
      ];
    },
  },

  {
    name: "code pins match the current source",
    axioms: "A2, A6, A7",
    level: "gate",
    run: (p) => verifyPins(p),
  },

  // K3 descriptions only: plans (K4) and research may name commands that do not exist yet (M1, A7).
  {
    name: "commands named in current documents exist",
    axioms: "A2, A7",
    level: "gate",
    run: (p) => (p.profile.commands ?? []).flatMap((rule) => {
      const { valid, error } = allowedCommands(p, rule);
      if (error) return [error];
      if (!valid) return [];
      const problems = [];
      for (const file of descriptionDocs(p, rule.exempt)) {
        for (const { value, line } of p.markdown(file).inlineCodes) {
          // When the prefix has no trailing space, it must be a whole word: the prefix `make` does not match `makefile`.
          if (!value.startsWith(rule.prefix) || /\S/.test(value[rule.prefix.length] ?? " ") && /\S$/.test(rule.prefix)) continue;
          const rest = value.slice(rule.prefix.length).trim();
          // The first word that is not an option, such as `--silent`, names the command.
          const command = rest.split(/\s+/).find((word) => !word.startsWith("-"));
          if (!command || /[*<>{}…()|$#]|\.\.\./.test(command)) continue;
          if (!valid.has(command)) {
            problems.push(`${file}:${line}: \`${rule.prefix}${/\s$/.test(rule.prefix) ? "" : " "}${command}\` is not a defined command`);
          }
        }
      }
      return problems;
    }),
  },

  {
    name: "open research is linked from an open item, and every history file has its banner",
    axioms: "A3, A5",
    level: "gate",
    run: (p) => {
      const problems = [];
      const { research, history } = p.profile;
      if (research && fileFault(p, research.items, "research.items")) {
        problems.push(fileFault(p, research.items, "research.items"));
      } else if (research) {
        const items = p.markdown(research.items);
        // Open items end at the heading whose whole line is `openUntil`.
        const until = research.openUntil && items.sections.find((one) => one.line.trim() === research.openUntil.trim());
        if (research.openUntil && !until) problems.push(`${research.items} has no heading "${research.openUntil}" (research.openUntil in docaxioms.json)`);
        // If the heading that ends the open items is missing, treat no item as open, so that unlinked research still fails.
        const open = until ? items.withoutCode.split("\n").slice(0, until.start).join("\n") : research.openUntil ? "" : items.withoutCode;
        for (const file of p.currentDocs.filter((name) => name.startsWith(`${research.dir}/`) && !name.endsWith("/README.md"))) {
          if (!/^Status: open \(.+\)$/m.test(p.read(file).split("\n").slice(0, 12).join("\n"))) {
            problems.push(`${file}: open research must have \`Status: open (<item>)\` in its first lines; move done or dropped research to history`);
          } else if (!open.includes(file.split("/").pop())) {
            problems.push(`${file}: no open item in ${research.items} links to this research`);
          }
        }
      }
      if (history) {
        for (const file of p.all.filter((name) => p.inHistory(name) && name.endsWith(".md") && !name.endsWith("/README.md"))) {
          if (!p.read(file).split("\n").slice(0, 10).join("\n").includes(history.banner)) {
            problems.push(`${file}: a history file needs the banner "${history.banner}" under its title (within its first 10 lines)`);
          }
        }
      }
      return problems;
    },
  },

  {
    name: "every current document is reachable from an entry point",
    axioms: "A3",
    level: "gate",
    run: (p) => {
      const entries = p.profile.entries ?? [];
      const seen = new Set(entries.filter(p.isFile));
      // The entries are candidates: a project need not have all of them, but it must have at least one.
      if (entries.length && !seen.size) return [`none of the entries in docaxioms.json exists (${entries.join(", ")}); create one of them or change "entries"`];
      const queue = [...seen];
      while (queue.length) {
        for (const { path, outside } of p.links(queue.pop())) {
          if (outside) continue;
          const next = p.isFolder(path) ? readmeOf(path) : path;
          if (next.endsWith(".md") && p.isFile(next) && !p.inHistory(next) && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      const wanted = new RegExp(p.profile.reachable ?? "^docs/");
      return p.currentDocs.filter((file) => wanted.test(file) && !seen.has(file));
    },
  },

  {
    name: "a decision links to where it landed, and that passage mentions it",
    axioms: "A0, A4",
    level: "gate",
    run: (p) => {
      // A missing decisions file is already reported by the decision numbers check.
      if (!p.profile.decisions || !p.isFile(p.profile.decisions.file)) return [];
      return decisionRows(p)
        .filter((row) => row.landing !== undefined)
        .flatMap(({ name, status, landingTargets }) => {
          const id = escape(p.profile.decisions.id);
          const problems = new RegExp(`^(active|superseded by ${id}\\d+|partly superseded \\(.+ by ${id}\\d+\\)|withdrawn)$`).test(status)
            ? []
            : [`${name}: status "${status}" must be one of: active, superseded by <id>, partly superseded (<what> by <id>), withdrawn`];
          if (!/^(active|partly superseded)/.test(status)) return problems;
          const targets = landingTargets ?? [];
          if (!targets.length) problems.push(`${name}: has no landing; an active decision links to the passage where it landed`);
          for (const target of targets) {
            const where = p.targetOf(p.profile.decisions.file, target);
            if (!where) { problems.push(`${name}: landing ${target} is an external link; a decision must land in a document in the repository`); continue; }
            const { path: file, anchor, outside } = where;
            if (outside) { problems.push(`${name}: landing ${target} leads outside the repository`); continue; }
            if (!p.has(file)) { problems.push(`${name}: landing ${target} does not exist`); continue; }
            if (!file.endsWith(".md") || !p.isFile(file)) { problems.push(`${name}: landing ${target} is not a Markdown document`); continue; }
            const text = anchor ? p.passage(file, anchor) : p.read(file);
            if (text === undefined) problems.push(`${name}: landing ${target} names a heading that does not exist`);
            else if (!new RegExp(`\\b${escape(name)}\\b`).test(text)) problems.push(`${name}: landing ${target} does not mention ${name}`);
          }
          return problems;
        });
    },
  },

  {
    name: "the stage card stays within its size limits",
    axioms: "A3",
    level: "gate",
    run: (p) => {
      const { card } = p.profile;
      if (!card) return [];
      const fault = fileFault(p, card.file, "card.file");
      if (fault) return [fault];
      const text = p.read(card.file);
      const lines = text.trimEnd().split("\n").length;
      return [
        ...(card.maxLines && lines > card.maxLines ? [`${card.file}: ${lines} lines, more than the ${card.maxLines} allowed`] : []),
        ...(card.maxChars && text.length > card.maxChars ? [`${card.file}: ${text.length} characters, more than the ${card.maxChars} allowed`] : []),
      ];
    },
  },

  {
    name: "documents with a size budget stay within it",
    axioms: "A3, M4",
    level: "gate",
    run: (p) => (p.profile.budgets ?? []).flatMap((rule) => {
      const isMatch = makeMatcher(rule.files);
      const isExempt = makeMatcher(rule.exempt);
      return p.currentDocs
        .filter((file) => isMatch(file) && !isExempt(file))
        .flatMap((file) => {
          const text = p.read(file);
          const lines = text.trimEnd().split("\n").length;
          return [
            ...(rule.maxLines && lines > rule.maxLines ? [`${file}: ${lines} lines, more than the ${rule.maxLines} allowed`] : []),
            ...(rule.maxChars && text.length > rule.maxChars ? [`${file}: ${text.length} characters, more than the ${rule.maxChars} allowed`] : []),
          ];
        });
    }),
  },

  {
    name: "a history file changes only in link targets, or grows by a dated erratum",
    axioms: "A5",
    level: "gate",
    run: (p) => {
      const { history } = p.profile;
      if (!history) return [];
      const { base, degraded } = resolveBase(p.root, history.base);
      const notes = degraded ? [degraded] : [];
      if (!base) return { problems: [], notes };
      // Only a link's target may change: titles, code and prose are compared as they are.
      const bare = (text) => withoutLinkTargets(text).replace(/\n+$/, "");
      const diff = runGit(p.root, ["diff", "--name-status", "--no-renames", "--diff-filter=MD", "-z", base, "--", history.dir]);
      if (!diff) return { problems: [], notes };
      const problems = diff
        .split("\0")
        .filter(Boolean)
        .reduce((pairs, part, index, parts) => (index % 2 ? pairs : [...pairs, [part, parts[index + 1]]]), [])
        .flatMap(([kind, file]) => {
          if (file.endsWith("/README.md")) return [];
          if (kind === "D") return [`${file}: a history file was deleted; history files are kept as records`];
          const before = bare(runGit(p.root, ["show", `${base}:${file}`]) ?? "");
          const now = bare(p.read(file));
          // As it was, then nothing, or a dated erratum: the whole text, so that no line elsewhere can pass as part of it.
          const grown = now.startsWith(before) ? now.slice(before.length) : undefined;
          if (
            grown === ""
            || (grown?.trimStart().startsWith(history.erratum)
              && /^\n/.test(grown)
              && /^\d{4}-\d{2}-\d{2}/.test(grown.trimStart().slice(history.erratum.length)))
          ) return [];
          return [`${file}: a history file may change only in its link targets, or by adding a dated erratum at its end`];
        });
      return { problems, notes };
    },
  },

  // --- Review Aids (M2: advisory signals measured before they may become gates) ---

  {
    name: "code changed, but the documents mapped to it did not",
    axioms: "A2, A6, M2",
    level: "aid",
    run: (p) => {
      const mappings = p.profile.codeToDocs ?? [];
      if (!mappings.length) return { problems: [], notes: [] };
      const diffCache = new Map();
      const notedDegraded = new Set();
      const getChanged = (baseRef) => {
        const key = baseRef ?? p.profile.history?.base ?? "origin/main";
        if (!diffCache.has(key)) diffCache.set(key, changedFiles(p.root, key));
        return diffCache.get(key);
      };
      const problems = [];
      const notes = [];
      for (const mapping of mappings) {
        const { files: changed, degraded } = getChanged(mapping.base);
        if (degraded && !notedDegraded.has(degraded)) {
          notedDegraded.add(degraded);
          notes.push(degraded);
        }
        if (!changed || !changed.size) continue;
        const matchCode = makeMatcher(mapping.code);
        const touchedCode = [...changed].filter((file) => matchCode(file));
        if (!touchedCode.length) continue;
        const sample = touchedCode.slice(0, 3).join(", ") + (touchedCode.length > 3 ? ` (+${touchedCode.length - 3})` : "");
        for (const doc of asArray(mapping.docs)) {
          if (!p.has(doc)) {
            problems.push(`${doc}: is listed in codeToDocs but does not exist`);
          } else if (!changed.has(doc)) {
            problems.push(`${doc}: code it describes changed (${sample}); review this document against it`);
          }
        }
      }
      return { problems, notes };
    },
  },

  {
    name: "current descriptions narrate past changes",
    axioms: "A3, M1, M2",
    level: "aid",
    run: (p) => {
      const config = p.profile.evolutionary;
      if (!config?.phrases?.length) return [];
      const docs = descriptionDocs(p, config.exempt);
      const matchers = config.phrases.map((phrase) => ({
        phrase,
        regex: /[\p{L}\p{N}_]$/u.test(phrase) && /^[\p{L}\p{N}_]/u.test(phrase) && /^[\x00-\x7F]+$/.test(phrase)
          ? new RegExp(`\\b${escape(phrase)}\\b`, "gi")
          : new RegExp(escape(phrase), "gi"),
      }));
      const problems = [];
      for (const file of docs) {
        const seen = new Set();
        for (const { value, line } of p.markdown(file).proseSegments) {
          for (const { phrase, regex } of matchers) {
            for (const match of value.matchAll(regex)) {
              const exactLine = line + value.slice(0, match.index).split("\n").length - 1;
              const key = `${exactLine}:${phrase}`;
              if (!seen.has(key)) {
                seen.add(key);
                problems.push(`${file}:${exactLine}: contains "${phrase}" (state what is now, or mark past behaviour as a record)`);
              }
            }
          }
        }
      }
      return problems;
    },
  },
];

function normalizeOutcome(outcome) {
  if (Array.isArray(outcome)) return { problems: outcome, notes: [] };
  return { problems: outcome?.problems ?? [], notes: outcome?.notes ?? [] };
}

/** Any thrown value as text, even null or an object without a prototype; this function itself never throws. */
function why(error) {
  try { return error instanceof Error ? error.message : String(error); } catch { return "a value that could not be turned into text"; }
}

/** One check's result. A check that could not run says why in `errors`, and the others still run (A6). */
async function runCheck(one, p) {
  const { name = "a project check", axioms = "", level = "gate" } = one ?? {};
  try {
    return { name, axioms, level, ...normalizeOutcome(await one.run(p)), errors: [] };
  } catch (error) {
    return { name, axioms, level, problems: [], notes: [], errors: [why(error)] };
  }
}

export async function check(root, given) {
  // When docaxioms.json is not a JSON object, no check can run, so each one gets an error and even --report exits 1 (A6).
  const invalid = profileProblems(given);
  if (!usableProfile(given)) {
    const [first, ...rest] = CHECKS;
    return [
      { name: first.name, axioms: first.axioms, level: first.level, problems: invalid, notes: [], errors: [] },
      ...rest.map(({ name, axioms, level = "gate" }) => ({ name, axioms, level, problems: [], notes: [], errors: ["not run: docaxioms.json is not a JSON object"] })),
    ];
  }
  const p = project(resolve(root), given);
  const { profile } = p;
  const results = [];
  for (const one of CHECKS) results.push(await runCheck(one, p));
  if (profile.projectChecks) {
    const file = profile.projectChecks;
    // Project checks are code that runs: load them only from a file inside the repository, never through a link out.
    let own = [];
    let failure = fileFault(p, file, "projectChecks");
    if (!failure) {
      try {
        own = (await import(pathToFileURL(p.at(file)).href)).default;
        const shaped = Array.isArray(own) && Array.from(own).every((one) => one && typeof one.name === "string" && typeof one.run === "function");
        if (!shaped) failure = `${file}: its default export is not a list of checks, each with a string name and a run function`;
      } catch (error) {
        failure = `${file}: ${why(error)}`;
      }
    }
    if (failure) {
      own = [];
      results.push({ name: "project checks load", axioms: "A6", level: "gate", problems: [], notes: [], errors: [failure] });
    }
    for (const one of own) results.push(await runCheck(one, p));
  }
  return results;
}
