// The documentation check engine of docaxioms.
// Paths, id prefixes, budgets, commands, mappings and limits come from the project's profile (docaxioms.json),
// and project-only rules from its own module (`projectChecks`).
// Per M2 (A6, A7), every check has a level:
//   - "gate": predicate is precise; fails exit code 1 on any problem.
//   - "aid":  review aid; prints findings and counts without failing exit code (unless --strict-aids).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toString } from "mdast-util-to-string";
import picomatch from "picomatch";
import { extractLinkTargets, parseMarkdown, withoutFences } from "./markdown.mjs";
import { verifyPins } from "./pins.mjs";

export { withoutFences };

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;
const FULL_SHA = /^[0-9a-f]{40}$/i;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const safeDecode = (text) => {
  try { return decodeURIComponent(text); } catch { return text; }
};

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
function resolveBase(root, wantedBase = "origin/main") {
  const base = runGit(root, ["merge-base", wantedBase, "HEAD"])?.trim();
  if (base) return { base, degraded: null };
  const head = runGit(root, ["rev-parse", "HEAD"])?.trim();
  if (!head) return { base: null, degraded: "repository has no commits; nothing could be compared" };
  return { base: head, degraded: `base "${wantedBase}" not found; fell back to HEAD (committed changes are not compared)` };
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

export function project(root, profile) {
  const at = (file) => join(root, file);
  const cache = new Map();
  const mdCache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(at(file), "utf8"));
    return cache.get(file);
  };
  const has = (file) => existsSync(at(file));
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

  const sections = (file) => markdown(file).sections;
  const passage = (file, anchor) => markdown(file).passage(anchor);
  const links = (file) => markdown(file)
    .links()
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => {
      const [path, anchor] = target.split("#");
      return {
        target,
        anchor,
        path: path ? normalize(join(dirname(file), safeDecode(path))).replace(/\\/g, "/").replace(/\/$/, "") : file,
      };
    });

  return {
    root,
    profile,
    read,
    has,
    all,
    inHistory,
    inCore,
    currentDocs,
    code,
    markdown,
    sections,
    passage,
    links,
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
    if (!p.has(rule.jsonFile)) return { valid: null };
    try {
      const parsed = JSON.parse(p.read(rule.jsonFile));
      const bucket = rule.key ? parsed?.[rule.key] : parsed;
      return { valid: bucket && typeof bucket === "object" ? new Set(Object.keys(bucket)) : new Set() };
    } catch (error) {
      return { error: `${rule.jsonFile}: invalid JSON (${error.message})` };
    }
  }
  if (rule.makefile) {
    if (!p.has(rule.makefile)) return { valid: null };
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
    name: "core files are the pinned version",
    axioms: "A4, A6",
    level: "gate",
    run: ({ read, has, all, inCore, profile }) => {
      const { dir = "", files = {}, version, commit } = profile.core ?? {};
      const at = (file) => (dir ? `${dir}/${file}` : file);
      const versionProblem = version && version !== PACKAGE_VERSION
        ? [`docaxioms.json pins core version ${version}, but running CLI is ${PACKAGE_VERSION} (run update or match installed CLI version)`]
        : [];
      const runningCommit = commit && FULL_SHA.test(commit) && existsSync(join(PACKAGE_ROOT, ".git"))
        ? runGit(PACKAGE_ROOT, ["rev-parse", "HEAD"])?.trim()
        : undefined;
      const commitProblem = runningCommit && runningCommit.toLowerCase() !== commit.toLowerCase()
        ? [`docaxioms.json pins commit ${commit.slice(0, 8)}, but running checkout is ${runningCommit.slice(0, 8)} (run update or match checkout)`]
        : [];
      return [
        ...versionProblem,
        ...commitProblem,
        ...Object.entries(files).flatMap(([file, hash]) => (!has(at(file))
          ? [`${at(file)}: missing`]
          : createHash("sha256").update(read(at(file))).digest("hex") === hash
            ? []
            : [`${at(file)}: not the pinned version (it comes from docaxioms; change it there, then update)`])),
        ...all
          .filter((file) => inCore(file) && !(file.slice(dir.length + 1) in files))
          .map((file) => `${file}: not part of the core`),
      ];
    },
  },

  {
    name: "links and anchors resolve",
    axioms: "A2, A4",
    level: "gate",
    run: (p) => p.currentDocs.flatMap((file) => p.links(file).flatMap(({ target, path, anchor }) => {
      if (!p.has(path)) return [`${file}: ${target} leads nowhere`];
      if (!anchor || !path.endsWith(".md")) return [];
      return p.passage(path, anchor) !== undefined ? [] : [`${file}: ${target} names a heading that is not there`];
    })),
  },

  {
    name: "decision numbers are unique and every one cited exists",
    axioms: "A4",
    level: "gate",
    run: (p) => {
      if (!p.profile.decisions) return [];
      const rows = decisionRows(p);
      const names = rows.map((row) => row.name);
      const known = new Set(names);
      const problems = names.filter((name, index) => names.indexOf(name) !== index).map((name) => `${name} has two rows`);
      const cite = new RegExp(`\\b${escape(p.profile.decisions.id)}(\\d{1,4})\\b`, "g");
      const exempt = new RegExp(p.profile.decisions.citeExempt ?? "^$");
      const missing = new Set();
      for (const file of [...p.code, ...p.currentDocs].filter((name) => !exempt.test(name))) {
        const text = file.endsWith(".md") ? p.markdown(file).withoutFences : withoutFences(p.read(file));
        for (const [name] of text.matchAll(cite)) if (!known.has(name)) missing.add(`${file}: ${name}`);
      }
      return [...problems, ...missing];
    },
  },

  {
    name: "cited sections exist",
    axioms: "A4",
    level: "gate",
    run: (p) => (p.profile.sections ?? []).flatMap(({ cite, files, document, rowTables = {} }) => {
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
          ? (rows[head].has(row) ? [] : [`${file}: ${whole}`])
          : heads.has(head) ? [] : [`${file}: ${whole}`];
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
          .map(([, path]) => `${file}: ${path}`));
    },
  },

  // Descriptions of the present only: a plan or research note may name another project's paths, a record names the past.
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
        .map((path) => `${path} is declared gone in docaxioms.json and is there`);
      return [
        ...back,
        ...p.currentDocs
          .filter((file) => !elsewhere.test(file))
          .flatMap((file) => p.markdown(file).inlineCodes.flatMap(({ value: path }) => {
            if (!named.test(path)) return [];
            const literal = path.replace(/(:\d+)+(-\d+)?$/, "").replace(/\/$/, "");
            return /[*<>{}…()|$#]|\.\.\./.test(literal)
              || p.has(literal)
              || gone.some((one) => `${literal}/`.startsWith(one.replace(/\/?$/, "/")))
              ? []
              : [`${file}: \`${path}\``];
          })),
      ];
    },
  },

  {
    name: "code pins match the current source",
    axioms: "A2, A6",
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
          if (!value.startsWith(rule.prefix)) continue;
          const rest = value.slice(rule.prefix.length).trim();
          const command = rest.split(/\s+/)[0];
          if (!command || /[*<>{}…()|$#]|\.\.\./.test(command)) continue;
          if (!valid.has(command)) {
            problems.push(`${file}:${line}: \`${rule.prefix}${command}\` is not defined`);
          }
        }
      }
      return problems;
    }),
  },

  {
    name: "open research is linked from an open item; history carries its banner",
    axioms: "A3, A5",
    level: "gate",
    run: (p) => {
      const problems = [];
      const { research, history } = p.profile;
      if (research) {
        const open = p.markdown(research.items).withoutCode.split(new RegExp(`^${research.openUntil ?? "\\u0000"}`, "m"))[0];
        for (const file of p.currentDocs.filter((name) => name.startsWith(`${research.dir}/`) && !name.endsWith("/README.md"))) {
          if (!/^Status: open \(.+\)$/m.test(p.read(file).split("\n").slice(0, 12).join("\n"))) {
            problems.push(`${file}: its first lines need \`Status: open (<item>)\`; done or dropped research belongs in history`);
          } else if (!open.includes(file.split("/").pop())) {
            problems.push(`${file}: no open item links to it`);
          }
        }
      }
      if (history) {
        for (const file of p.all.filter((name) => p.inHistory(name) && name.endsWith(".md") && !name.endsWith("/README.md"))) {
          if (!p.read(file).split("\n").slice(0, 10).join("\n").includes(history.banner)) {
            problems.push(`${file}: needs the out-of-date banner under its title`);
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
      const seen = new Set((p.profile.entries ?? []).filter(p.has));
      const queue = [...seen];
      while (queue.length) {
        for (const { path } of p.links(queue.pop())) {
          const next = p.has(path) && lstatSync(p.at(path)).isDirectory() ? `${path}/README.md` : path;
          if (next.endsWith(".md") && p.has(next) && !p.inHistory(next) && !seen.has(next)) {
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
    name: "a decision names where it landed, and that passage names it",
    axioms: "A0, A4",
    level: "gate",
    run: (p) => {
      if (!p.profile.decisions) return [];
      return decisionRows(p)
        .filter((row) => row.landing !== undefined)
        .flatMap(({ name, status, landingTargets }) => {
          const id = escape(p.profile.decisions.id);
          const problems = new RegExp(`^(active|superseded by ${id}\\d+|partly superseded \\(.+ by ${id}\\d+\\)|withdrawn)$`).test(status)
            ? []
            : [`${name}: status "${status}" is not one of the four`];
          if (!/^(active|partly superseded)/.test(status)) return problems;
          const targets = landingTargets ?? [];
          if (!targets.length) problems.push(`${name}: no landing passage`);
          for (const target of targets) {
            const [path, anchor] = target.split("#");
            const file = path
              ? normalize(join(dirname(p.profile.decisions.file), safeDecode(path))).replace(/\\/g, "/")
              : p.profile.decisions.file;
            if (!p.has(file)) { problems.push(`${name}: ${target} is not there`); continue; }
            if (!file.endsWith(".md")) continue;
            const text = anchor ? p.passage(file, anchor) : p.read(file);
            if (text === undefined) problems.push(`${name}: ${target} names a heading that is not there`);
            else if (!new RegExp(`\\b${escape(name)}\\b`).test(text)) problems.push(`${name}: ${target} does not name ${name}`);
          }
          return problems;
        });
    },
  },

  {
    name: "the stage card stays a card",
    axioms: "A3",
    level: "gate",
    run: (p) => {
      const { card } = p.profile;
      if (!card || !p.has(card.file)) return [];
      const text = p.read(card.file);
      const lines = text.trimEnd().split("\n").length;
      return [
        ...(card.maxLines && lines > card.maxLines ? [`${card.file}: ${lines} lines, at most ${card.maxLines}`] : []),
        ...(card.maxChars && text.length > card.maxChars ? [`${card.file}: ${text.length} characters, at most ${card.maxChars}`] : []),
      ];
    },
  },

  {
    name: "bounded documents stay within budget",
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
            ...(rule.maxLines && lines > rule.maxLines ? [`${file}: ${lines} lines, at most ${rule.maxLines}`] : []),
            ...(rule.maxChars && text.length > rule.maxChars ? [`${file}: ${text.length} characters, at most ${rule.maxChars}`] : []),
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
      const bare = (text) => text.replace(/\n+$/, "").replace(/\]\([^)]*\)/g, "]()");
      const diff = runGit(p.root, ["diff", "--name-status", "--no-renames", "--diff-filter=MD", "-z", base, "--", history.dir]);
      if (!diff) return { problems: [], notes };
      const problems = diff
        .split("\0")
        .filter(Boolean)
        .reduce((pairs, part, index, parts) => (index % 2 ? pairs : [...pairs, [part, parts[index + 1]]]), [])
        .flatMap(([kind, file]) => {
          if (file.endsWith("/README.md")) return [];
          if (kind === "D") return [`${file}: deleted`];
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
          return [`${file}: changed other than in a link target, or grew other than by a dated erratum at its end`];
        });
      return { problems, notes };
    },
  },

  // --- Review Aids (M2: advisory signals measured before they may become gates) ---

  {
    name: "code changes with mapped documents untouched",
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
            problems.push(`${doc}: mapped in codeToDocs but file does not exist`);
          } else if (!changed.has(doc)) {
            problems.push(`${doc}: review after code change in ${sample}`);
          }
        }
      }
      return { problems, notes };
    },
  },

  {
    name: "current descriptions use evolutionary phrasing",
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

export async function check(root, profile) {
  const p = project(resolve(root), profile);
  const results = CHECKS.map(({ name, axioms, level, run }) => {
    const { problems, notes } = normalizeOutcome(run(p));
    return { name, axioms, level, problems, notes };
  });
  if (profile.projectChecks) {
    const own = await import(pathToFileURL(p.at(profile.projectChecks)).href);
    for (const { name, axioms, level = "gate", run } of own.default) {
      const { problems, notes } = normalizeOutcome(await run(p));
      results.push({ name, axioms, level, problems, notes });
    }
  }
  return results;
}
