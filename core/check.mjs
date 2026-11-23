#!/usr/bin/env node
// The documentation check of agentic-docs. It knows no project: paths, id prefixes, words and limits come
// from the project's profile (agentic-docs.json), and what only that project can check from its own module
// (`projectChecks`). Node only, no dependencies. A check is a hard gate only because what it evaluates is the property
// itself and it is precise (axioms A6, A7); whether a description is right stays review's (A0).
//
//   node agentic-docs/check.mjs [--root <dir>] [--report]     exit 1 on a problem, 0 with --report
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** GitHub's heading anchor. */
const slug = (title) => title.replace(/`/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
/** Without fenced blocks, their lines kept. */
export const withoutFences = (text) => text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, ""));
const withoutCode = (text) => withoutFences(text).replace(/`[^`\n]*`/g, (code) => " ".repeat(code.length));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function project(root, profile) {
  const at = (file) => join(root, file);
  const cache = new Map();
  const read = (file) => { if (!cache.has(file)) cache.set(file, readFileSync(at(file), "utf8")); return cache.get(file); };
  const has = (file) => existsSync(at(file));
  const ignored = new Set([".git", "node_modules", ...(profile.ignore ?? [])]);
  const ignoredPath = (file) => file.split("/").some((part, index, parts) => ignored.has(part) || ignored.has(parts.slice(0, index + 1).join("/")));
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
  let all;
  try { all = execFileSync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter((file) => file && has(file) && !lstatSync(at(file)).isSymbolicLink() && !ignoredPath(file)); } catch { all = walk(); }
  const inHistory = (file) => Boolean(profile.history) && file.startsWith(`${profile.history.dir}/`);
  // The core's content is its own repository's to check; here it only has to be the pinned version.
  const inCore = (file) => Boolean(profile.core?.dir) && file.startsWith(`${profile.core.dir}/`);
  const currentDocs = all.filter((file) => file.endsWith(".md") && !inHistory(file) && !inCore(file));
  const code = all.filter((file) => !inCore(file) && (profile.codeExtensions ?? []).some((extension) => file.endsWith(extension)));
  // The one reading of what a heading or an anchor holds: links, landings and tables all use it. Lines are those of the
  // file; a heading in a code block is none. A section ends at the next heading of its level or a higher one.
  const sectionCache = new Map();
  const sections = (file) => {
    if (sectionCache.has(file)) return sectionCache.get(file);
    const lines = read(file).split("\n"); const seen = new Map(); const found = [];
    withoutFences(read(file)).split("\n").forEach((line, start) => {
      const head = /^(#{1,6}) (.+?)\s*#*$/.exec(line); if (!head) return;
      const base = slug(head[2]); const count = seen.get(base) ?? 0; seen.set(base, count + 1);
      found.push({ level: head[1].length, line, anchor: count ? `${base}-${count}` : base, start });
    });
    found.forEach((one, index) => { one.text = lines.slice(one.start, found.slice(index + 1).find((next) => next.level <= one.level)?.start).join("\n"); });
    sectionCache.set(file, found);
    return found;
  };
  /** What an anchor of a document holds: a section, or the paragraph, list item or table row an explicit one stands in. */
  const passage = (file, anchor) => {
    const wanted = decodeURIComponent(anchor);
    const section = sections(file).find((one) => one.anchor === wanted) ?? sections(file).find((one) => one.anchor === wanted.toLowerCase());
    return section?.text ?? withoutFences(read(file)).split(/\n\s*\n|\n(?=[-*|] )/).find((block) => block.includes(`<a id="${wanted}"`));
  };
  // Inline, and by reference: a definition alone on its line that the text refers to (a footnote is none).
  const references = (text) => [...text.matchAll(/^ {0,3}\[(?!\^)([^\]\n]+)\]:[ \t]+<?([^\s>]+)>?(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*\r?$/gm)]
    .filter(([, label]) => new RegExp(`\\[${escape(label)}\\](?!:)`, "i").test(text)).map((match) => match[2]);
  const links = (file) => [...[...withoutCode(read(file)).matchAll(/\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)].map((match) => match[1]), ...references(withoutCode(read(file)))]
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => { const [path, anchor] = target.split("#"); return { target, anchor, path: path ? normalize(join(dirname(file), decodeURIComponent(path))).replace(/\/$/, "") : file }; });
  return { root, profile, read, has, all, inHistory, inCore, currentDocs, code, sections, passage, links, at };
}

/** Decision rows: the status is the fourth cell and the landing the fifth, in the section of rows that have them. */
export function decisionRows({ read, profile }) {
  const { file, id, landedSection } = profile.decisions;
  const rows = []; let landed = !landedSection;
  for (const line of read(file).split("\n")) {
    if (landedSection && line.startsWith(landedSection)) landed = true;
    const match = new RegExp(`^\\| ${escape(id)}(\\d+) \\|`).exec(line);
    if (!match) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());
    rows.push({ number: Number(match[1]), name: `${id}${match[1]}`, status: landed ? cells[3] : undefined, landing: landed ? cells[4] : undefined });
  }
  return rows;
}

const CHECKS = [
  ["core files are the pinned version", "A4, A6", ({ read, has, all, inCore, profile }) => {
    const { dir = "", files = {} } = profile.core ?? {};
    const at = (file) => (dir ? `${dir}/${file}` : file);
    return [
      ...Object.entries(files).flatMap(([file, hash]) => !has(at(file)) ? [`${at(file)}: missing`]
        : createHash("sha256").update(read(at(file))).digest("hex") === hash ? [] : [`${at(file)}: not the pinned version (it comes from agentic-docs; change it there, then update)`]),
      ...all.filter((file) => inCore(file) && !(file.slice(dir.length + 1) in files)).map((file) => `${file}: not part of the core`),
    ];
  }],

  ["links and anchors resolve", "A2, A4", (p) => p.currentDocs.flatMap((file) => p.links(file).flatMap(({ target, path, anchor }) => {
    if (!p.has(path)) return [`${file}: ${target} leads nowhere`];
    if (!anchor || !path.endsWith(".md")) return [];
    return p.passage(path, anchor) !== undefined ? [] : [`${file}: ${target} names a heading that is not there`];
  }))],

  ["decision numbers are unique and every one cited exists", "A4", (p) => {
    const rows = decisionRows(p); const names = rows.map((row) => row.name); const known = new Set(names);
    const problems = names.filter((name, index) => names.indexOf(name) !== index).map((name) => `${name} has two rows`);
    const cite = new RegExp(`\\b${escape(p.profile.decisions.id)}(\\d{1,4})\\b`, "g");
    const exempt = new RegExp(p.profile.decisions.citeExempt ?? "^$");
    const missing = new Set();
    for (const file of [...p.code, ...p.currentDocs].filter((name) => !exempt.test(name))) for (const [name] of withoutFences(p.read(file)).matchAll(cite)) if (!known.has(name)) missing.add(`${file}: ${name}`);
    return [...problems, ...missing];
  }],

  ["cited sections exist", "A4", (p) => (p.profile.sections ?? []).flatMap(({ cite, files, document, rowTables = {} }) => {
    const text = p.read(document);
    const heads = new Set([...text.matchAll(/^#{2,6} (\d+(?:\.\d+)*)[. ]/gm)].map((match) => match[1]));
    const rows = Object.fromEntries(Object.entries(rowTables).map(([head, heading]) => [head, new Set([...(p.sections(document).find((one) => one.line.startsWith(heading))?.text ?? "").matchAll(/^\| (\d+) \|/gm)].map((match) => match[1]))]));
    return p.code.filter((file) => new RegExp(files).test(file)).flatMap((file) => [...p.read(file).matchAll(new RegExp(cite, "g"))].flatMap(([whole, section]) => {
      const [head, row] = section.split("-");
      return row && rows[head] ? (rows[head].has(row) ? [] : [`${file}: ${whole}`]) : heads.has(head) ? [] : [`${file}: ${whole}`];
    }));
  })],

  // A document named in code: only in a folder of documents that is there, so that a made-up path in a fixture is none.
  ["documents named in code exist", "A2, A7", (p) => {
    const folders = new Set(p.all.filter((file) => file.endsWith(".md") && file.includes("/")).map((file) => dirname(file)));
    const exempt = new RegExp(p.profile.codeDocExempt ?? "^$");
    return p.code.filter((file) => !exempt.test(file)).flatMap((file) => [...p.read(file).matchAll(/(?<![\w./-])((?:[\w.-]+\/)+[\w.-]+\.md)\b/g)].filter(([, path]) => folders.has(dirname(path)) && !p.has(path)).map(([, path]) => `${file}: ${path}`));
  }],

  // Descriptions of the present only: a plan or research note may name another project's paths, a record names the past.
  ["paths named in current documents exist", "A2, A7", (p) => {
    const prefixes = (p.profile.pathPrefixes ?? []).map(escape).join("|");
    if (!prefixes) return [];
    const named = new RegExp(`\`((?:${prefixes})[^\`\\s]*)\``, "g");
    const gone = p.profile.gonePaths ?? [];
    const elsewhere = new RegExp(p.profile.pathExempt ?? "^$");
    const back = gone.filter((path) => p.has(path.replace(/\/$/, ""))).map((path) => `${path} is declared gone in agentic-docs.json and is there`);
    return [...back, ...p.currentDocs.filter((file) => !elsewhere.test(file)).flatMap((file) => [...withoutFences(p.read(file)).matchAll(named)].flatMap(([, path]) => {
      const literal = path.replace(/(:\d+)+(-\d+)?$/, "").replace(/\/$/, "");
      return /[*<>{}…()|$#]|\.\.\./.test(literal) || p.has(literal) || gone.some((one) => `${literal}/`.startsWith(one.replace(/\/?$/, "/"))) ? [] : [`${file}: \`${path}\``];
    }))];
  }],

  ["open research is linked from an open item; history carries its banner", "A3, A5", (p) => {
    const problems = []; const { research, history } = p.profile;
    if (research) {
      const open = withoutCode(p.read(research.items)).split(new RegExp(`^${research.openUntil ?? "\\u0000"}`, "m"))[0];
      for (const file of p.currentDocs.filter((name) => name.startsWith(`${research.dir}/`) && !name.endsWith("/README.md"))) {
        if (!/^Status: open \(.+\)$/m.test(p.read(file).split("\n").slice(0, 12).join("\n"))) problems.push(`${file}: its first lines need \`Status: open (<item>)\`; done or dropped research belongs in history`);
        else if (!open.includes(file.split("/").pop())) problems.push(`${file}: no open item links to it`);
      }
    }
    if (history) for (const file of p.all.filter((name) => p.inHistory(name) && name.endsWith(".md") && !name.endsWith("/README.md"))) if (!p.read(file).split("\n").slice(0, 10).join("\n").includes(history.banner)) problems.push(`${file}: needs the out-of-date banner under its title`);
    return problems;
  }],

  ["every current document is reachable from an entry point", "A3", (p) => {
    const seen = new Set((p.profile.entries ?? []).filter(p.has)); const queue = [...seen];
    while (queue.length) for (const { path } of p.links(queue.pop())) {
      const next = p.has(path) && lstatSync(p.at(path)).isDirectory() ? `${path}/README.md` : path;
      if (next.endsWith(".md") && p.has(next) && !p.inHistory(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
    const wanted = new RegExp(p.profile.reachable ?? "^docs/");
    return p.currentDocs.filter((file) => wanted.test(file) && !seen.has(file));
  }],

  ["a decision names where it landed, and that passage names it", "A0, A4", (p) => decisionRows(p).filter((row) => row.landing !== undefined).flatMap(({ name, status, landing }) => {
    const id = escape(p.profile.decisions.id);
    const problems = new RegExp(`^(active|superseded by ${id}\\d+|partly superseded \\(.+ by ${id}\\d+\\)|withdrawn)$`).test(status) ? [] : [`${name}: status "${status}" is not one of the four`];
    if (!/^(active|partly superseded)/.test(status)) return problems;
    const targets = [...landing.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
    if (!targets.length) problems.push(`${name}: no landing passage`);
    for (const target of targets) {
      const [path, anchor] = target.split("#");
      const file = path ? normalize(join(dirname(p.profile.decisions.file), decodeURIComponent(path))) : p.profile.decisions.file;
      if (!p.has(file)) { problems.push(`${name}: ${target} is not there`); continue; }
      if (!file.endsWith(".md")) continue;
      const text = anchor ? p.passage(file, anchor) : p.read(file);
      if (text === undefined) problems.push(`${name}: ${target} names a heading that is not there`);
      else if (!new RegExp(`\\b${escape(name)}\\b`).test(text)) problems.push(`${name}: ${target} does not name ${name}`);
    }
    return problems;
  })],

  ["the stage card stays a card", "A3", (p) => {
    const { card } = p.profile; if (!card) return [];
    const text = p.read(card.file); const lines = text.trimEnd().split("\n").length;
    return [...(lines > card.maxLines ? [`${card.file}: ${lines} lines, at most ${card.maxLines}`] : []), ...(text.length > card.maxChars ? [`${card.file}: ${text.length} characters, at most ${card.maxChars}`] : [])];
  }],

  ["a history file changes only in link targets, or grows by a dated erratum", "A5", (p) => {
    const { history } = p.profile; if (!history) return [];
    const git = (...args) => execFileSync("git", ["-C", p.root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    // Without the branch to compare with, what is not committed is still compared.
    let base; try { base = git("merge-base", history.base ?? "origin/main", "HEAD").trim(); } catch { try { base = git("rev-parse", "HEAD").trim(); } catch { return []; } }
    const bare = (text) => text.replace(/\n+$/, "").replace(/\]\([^)]*\)/g, "]()");
    return git("diff", "--name-status", "--no-renames", "--diff-filter=MD", "-z", base, "--", history.dir).split("\0").filter(Boolean).reduce((pairs, part, index, parts) => (index % 2 ? pairs : [...pairs, [part, parts[index + 1]]]), []).flatMap(([kind, file]) => {
      if (file.endsWith("/README.md")) return [];
      if (kind === "D") return [`${file}: deleted`];
      const before = bare(git("show", `${base}:${file}`)); const now = bare(p.read(file));
      // As it was, then nothing, or a dated erratum: the whole text, so that no line elsewhere can pass as part of it.
      const grown = now.startsWith(before) ? now.slice(before.length) : undefined;
      if (grown === "" || (grown?.trimStart().startsWith(history.erratum) && /^\n/.test(grown) && /^\d{4}-\d{2}-\d{2}/.test(grown.trimStart().slice(history.erratum.length)))) return [];
      return [`${file}: changed other than in a link target, or grew other than by a dated erratum at its end`];
    });
  }],
];

export async function check(root, profile) {
  const p = project(resolve(root), profile);
  const results = CHECKS.map(([name, axioms, run]) => ({ name, axioms, problems: run(p) }));
  if (profile.projectChecks) {
    const own = await import(pathToFileURL(p.at(profile.projectChecks)).href);
    for (const { name, axioms, run } of own.default) results.push({ name, axioms, problems: await run(p) });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = (flag) => { const index = process.argv.indexOf(flag); return index === -1 ? undefined : process.argv[index + 1]; };
  const root = value("--root") ?? ".";
  const results = await check(root, JSON.parse(readFileSync(join(root, "agentic-docs.json"), "utf8")));
  for (const { name, axioms, problems } of results) {
    console.log(`${problems.length ? "FAIL" : "ok  "} ${name} (${axioms})${problems.length ? `: ${problems.length}` : ""}`);
    for (const problem of problems) console.log(`       ${problem}`);
  }
  process.exit(results.some((result) => result.problems.length) && !process.argv.includes("--report") ? 1 : 0);
}
