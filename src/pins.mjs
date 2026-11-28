// Deterministic code content hash pins embedded in Markdown HTML comments.
// Syntax:
//   <!-- pin: path/to/file.ext#L10-L30@a1b2c3d4e5f6 -->   (line range, 1-based inclusive)
//   <!-- pin: path/to/file.ext#L10@a1b2c3d4e5f6 -->       (single line)
//   <!-- pin: path/to/file.ext@a1b2c3d4e5f6 -->           (whole file)
//   <!-- pin: path/to/file.ext#L10-L30 -->                (unpinned; fails gate until reviewed & pinned)
//
// Paths without `./` or `../` resolve from the repository root; `./` and `../` resolve relative to the document
// and may not escape the repository root.
// Every mismatch (including shifted line ranges) fails the hard gate (A6) so short windows cannot silently match
// unrelated identical lines elsewhere. When a unique identical-hash window exists elsewhere in the file, the gate
// reports the shift and `pin --relocate` updates only the line numbers without altering the hash.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

// Match `pin:` (any attempt with a colon) or `pin <path-like>` (missing colon before a path/file token),
// while leaving ordinary prose comments like `<!-- pin the version here -->` untouched.
const PIN_ATTEMPT = /^\s*pin(?:\s*:|\s+\S*[/.#@])/i;
const PIN_PATTERN = /^\s*pin:\s*(\S+?)(?:#L(\d+)(?:-L?(\d+))?)?(?:@([0-9a-fA-F]{8,64}))?\s*$/;
const SHORT_HASH_LENGTH = 12;
const MAX_PREVIEW_LINES = 12;

export function parsePinComment(comment) {
  if (!PIN_ATTEMPT.test(comment.body)) return null;
  const match = PIN_PATTERN.exec(comment.body);
  if (!match) {
    return { ...comment, malformed: true };
  }
  const [, rawPath, startStr, endStr, hash] = match;
  if (rawPath.includes("#")) {
    return { ...comment, malformed: true };
  }
  const startLine = startStr ? Number(startStr) : undefined;
  const endLine = endStr ? Number(endStr) : startLine;
  return {
    ...comment,
    malformed: false,
    rawPath,
    startLine,
    endLine,
    hash: hash?.toLowerCase(),
  };
}

export function resolvePinPath(docFile, rawPath) {
  if (isAbsolute(rawPath)) return { error: `pin path "${rawPath}" must be relative to the repository, not an absolute path` };
  const resolved = rawPath.startsWith("./") || rawPath.startsWith("../")
    ? normalize(join(dirname(docFile), rawPath)).replace(/\\/g, "/")
    : normalize(rawPath).replace(/\\/g, "/");
  if (resolved === ".." || resolved.startsWith("../") || isAbsolute(resolved)) {
    return { error: `pin path "${rawPath}" leads outside the repository` };
  }
  return { path: resolved };
}

function splitSourceLines(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized === "") return { normalized, lines: [], lineCount: 0 };
  const lines = normalized.split("\n");
  const lineCount = normalized.endsWith("\n") ? lines.length - 1 : lines.length;
  return { normalized, lines: lines.slice(0, lineCount), lineCount };
}

function previewSlice(content, startLine, endLine) {
  if (startLine === undefined) return null;
  const { lines, lineCount } = splitSourceLines(content);
  if (startLine < 1 || endLine < startLine || endLine > lineCount) return null;
  const slice = lines.slice(startLine - 1, endLine);
  const shown = slice.slice(0, MAX_PREVIEW_LINES).map((text, index) => ({
    line: startLine + index,
    text,
  }));
  return { lines: shown, truncated: Math.max(0, slice.length - shown.length) };
}

export function hashSourceSlice(content, startLine, endLine) {
  const { normalized, lines, lineCount } = splitSourceLines(content);
  if (startLine === undefined) {
    const full = createHash("sha256").update(normalized).digest("hex");
    return { full, short: full.slice(0, SHORT_HASH_LENGTH) };
  }
  if (startLine < 1 || endLine < startLine || endLine > lineCount) {
    return { error: `line range L${startLine}-L${endLine} is out of bounds (file has ${lineCount} lines)` };
  }
  const slice = lines.slice(startLine - 1, endLine).join("\n");
  const full = createHash("sha256").update(slice).digest("hex");
  return { full, short: full.slice(0, SHORT_HASH_LENGTH) };
}

/** Find all contiguous windows of length `windowLen` whose SHA-256 matches `expectedHash`. */
export function findRelocatedWindows(content, windowLen, expectedHash) {
  const { lines, lineCount } = splitSourceLines(content);
  if (windowLen < 1 || windowLen > lineCount) return [];
  const matches = [];
  for (let start = 1; start <= lineCount - windowLen + 1; start += 1) {
    const end = start + windowLen - 1;
    const slice = lines.slice(start - 1, end).join("\n");
    const full = createHash("sha256").update(slice).digest("hex");
    if (full.startsWith(expectedHash)) matches.push([start, end]);
  }
  return matches;
}

export function formatPinComment(rawPath, startLine, endLine, shortHash) {
  const range = startLine === undefined
    ? ""
    : endLine === startLine
      ? `#L${startLine}`
      : `#L${startLine}-L${endLine}`;
  return `<!-- pin: ${rawPath}${range}@${shortHash} -->`;
}

/** Inspect every pin comment across current documents and classify its exact state. */
export function inspectPins(p, wanted = () => true, wantedDoc = () => true) {
  const records = [];
  for (const file of p.currentDocs.filter(wantedDoc)) {
    const md = p.markdown(file);
    for (const comment of md.htmlComments) {
      const pin = parsePinComment(comment);
      if (!pin || !wanted(file, pin.line)) continue;
      if (pin.malformed) {
        records.push({ file, pin, status: "malformed", detail: `malformed pin comment \`${comment.raw.trim()}\`` });
        continue;
      }
      const resolved = resolvePinPath(file, pin.rawPath);
      if (!resolved.error && !p.inside(resolved.path)) resolved.error = `pin path "${pin.rawPath}" leads outside the repository (through a symbolic link)`;
      if (resolved.error) {
        records.push({ file, pin, status: "outside-root", detail: resolved.error });
        continue;
      }
      if (!p.has(resolved.path)) {
        records.push({ file, pin, status: "missing", detail: `pin target ${pin.rawPath} does not exist` });
        continue;
      }
      if (!p.isFile(resolved.path)) {
        records.push({ file, pin, status: "missing", detail: `pin target "${pin.rawPath}" is a folder, not a file` });
        continue;
      }
      const content = p.read(resolved.path);
      const result = hashSourceSlice(content, pin.startLine, pin.endLine);

      // Even if a line range drifted past EOF due to deletions above, check whether the exact content moved up.
      if (result.error) {
        if (pin.hash && pin.startLine !== undefined && pin.endLine >= pin.startLine) {
          const moved = findRelocatedWindows(content, pin.endLine - pin.startLine + 1, pin.hash);
          if (moved.length === 1) {
            records.push({
              file,
              pin,
              status: "moved",
              movedTo: moved[0],
              hash: pin.hash,
              preview: previewSlice(content, moved[0][0], moved[0][1]),
            });
            continue;
          }
        }
        records.push({ file, pin, status: "invalid-range", detail: `${pin.rawPath} ${result.error}` });
        continue;
      }

      if (!pin.hash) {
        records.push({
          file,
          pin,
          status: "unpinned",
          actual: result.short,
          preview: previewSlice(content, pin.startLine, pin.endLine),
        });
        continue;
      }

      if (result.full.startsWith(pin.hash)) {
        records.push({ file, pin, status: "ok", actual: result.short });
        continue;
      }

      if (pin.startLine !== undefined) {
        const moved = findRelocatedWindows(content, pin.endLine - pin.startLine + 1, pin.hash);
        if (moved.length === 1) {
          records.push({
            file,
            pin,
            status: "moved",
            movedTo: moved[0],
            hash: pin.hash,
            preview: previewSlice(content, moved[0][0], moved[0][1]),
          });
          continue;
        }
        if (moved.length > 1) {
          records.push({
            file,
            pin,
            status: "ambiguous-move",
            actual: result.short,
            matches: moved,
          });
          continue;
        }
      }

      records.push({
        file,
        pin,
        status: "changed",
        actual: result.short,
        preview: previewSlice(content, pin.startLine, pin.endLine),
      });
    }
  }
  return records;
}

/** Hard gate (A2, A6): fail on any pin that does not match at its pinned location (including shifted lines). */
export function verifyPins(p) {
  const problems = [];
  for (const record of inspectPins(p)) {
    const { file, pin, status } = record;
    const loc = `${file}:${pin.line}`;
    if (status === "ok") continue;
    if (status === "malformed" || status === "outside-root" || status === "missing" || status === "invalid-range") {
      problems.push(`${loc}: ${record.detail}`);
    } else if (status === "unpinned") {
      problems.push(`${loc}: ${pin.rawPath} has no hash (expected @${record.actual}; review and run pin --write --file ${file})`);
    } else if (status === "moved") {
      const [newStart, newEnd] = record.movedTo;
      const oldRange = pin.startLine === pin.endLine ? `L${pin.startLine}` : `L${pin.startLine}-L${pin.endLine}`;
      const newRange = newStart === newEnd ? `L${newStart}` : `L${newStart}-L${newEnd}`;
      problems.push(`${loc}: ${pin.rawPath}#${oldRange} moved to #${newRange} (identical hash @${pin.hash}; verify and run pin --relocate)`);
    } else if (status === "ambiguous-move") {
      const locs = record.matches.map(([s, e]) => (s === e ? `L${s}` : `L${s}-L${e}`)).join(", ");
      problems.push(`${loc}: ${pin.rawPath} hash @${pin.hash} moved ambiguously to ${locs}; update line range manually`);
    } else if (status === "changed") {
      problems.push(`${loc}: ${pin.rawPath} changed (pinned @${pin.hash}, now @${record.actual})`);
    }
  }
  return problems;
}

/**
 * Inspect or update pin comments in current documents.
 * - `relocate: true`: safely updates ONLY `moved` pins (line range changes, hash preserved).
 * - `write: true`: updates `unpinned`/`changed` hashes ONLY for pins scoped by `files` / `pins` (or `all: true`),
 *   and also relocates `moved` pins in scope without altering their hashes.
 */
export function syncPins(p, { write = false, relocate = false, files = [], pins = [], all = false } = {}) {
  // --file and --pin take a path relative to the repository root, with or without a leading `/`, or a full path
  // on this machine to a file inside the repository.
  const fromRoot = (path) => {
    const rel = relative(p.root, resolve(path));
    const onMachine = isAbsolute(path) && rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
    return normalize(onMachine ? rel : path).replace(/\\/g, "/").replace(/^\/+/, "");
  };
  const fileSet = new Set(files.map(fromRoot));
  const pinSet = new Set(pins.map((spec) => {
    const idx = spec.lastIndexOf(":");
    if (idx === -1) return spec;
    return `${fromRoot(spec.slice(0, idx))}:${spec.slice(idx + 1)}`;
  }));
  const hasScope = fileSet.size > 0 || pinSet.size > 0;
  const inScope = (file, line) => all || (!hasScope && !write) || fileSet.has(file) || pinSet.has(`${file}:${line}`);

  // With a scope, open and report only the documents in it, so that a problem in another document cannot fail
  // this command.
  const pinDocs = new Set([...pinSet].map((spec) => spec.slice(0, spec.lastIndexOf(":"))));
  const records = inspectPins(p, (file, line) => !hasScope || inScope(file, line), (file) => !hasScope || all || fileSet.has(file) || pinDocs.has(file));
  const changes = [];
  const editsByFile = new Map();

  // A scope that matches no pin would refresh nothing: report that, instead of "all code pins are up to date".
  for (const file of fileSet) {
    if (!records.some((record) => record.file === file)) {
      changes.push({ file, status: "no-match", detail: `no code pin found in "${file}" (named by --file)` });
    }
  }
  for (const spec of pinSet) {
    if (!records.some((record) => `${record.file}:${record.pin.line}` === spec)) {
      changes.push({ file: spec, status: "no-match", detail: `no code pin found at "${spec}" (named by --pin; expected <document>:<line> of a pin comment)` });
    }
  }
  if (all && write && !records.length) changes.push({ file: "", status: "no-match", detail: "no code pin found in any current document (named by --all)" });
  // If any part of the scope matches no pin, the command is wrong: write nothing until it is fixed.
  if (changes.length) return changes;

  for (const record of records) {
    const { file, pin, status } = record;
    if (status === "ok") continue;

    if (status === "malformed" || status === "outside-root" || status === "missing" || status === "invalid-range" || status === "ambiguous-move") {
      changes.push({
        file,
        line: pin.line,
        target: pin.rawPath ?? pin.raw.trim(),
        status,
        detail: record.detail ?? (status === "ambiguous-move" ? "multiple matching windows found" : status),
      });
      continue;
    }

    if (status === "moved") {
      const [newStart, newEnd] = record.movedTo;
      const shouldWrite = (relocate && (!hasScope || inScope(file, pin.line))) || (write && inScope(file, pin.line));
      changes.push({
        file,
        line: pin.line,
        target: pin.rawPath,
        status: "moved",
        fromRange: [pin.startLine, pin.endLine],
        toRange: [newStart, newEnd],
        hash: pin.hash,
        preview: record.preview,
        written: shouldWrite,
      });
      if (shouldWrite) {
        const replacement = formatPinComment(pin.rawPath, newStart, newEnd, pin.hash);
        if (!editsByFile.has(file)) editsByFile.set(file, []);
        editsByFile.get(file).push({ start: pin.start, end: pin.end, replacement });
      }
      continue;
    }

    // status === "unpinned" || status === "changed"
    const shouldWrite = write && inScope(file, pin.line);
    changes.push({
      file,
      line: pin.line,
      target: pin.rawPath,
      range: pin.startLine === undefined ? null : [pin.startLine, pin.endLine],
      status: status === "unpinned" ? "added" : "updated",
      before: pin.hash ?? null,
      after: record.actual,
      preview: record.preview,
      written: shouldWrite,
    });
    if (shouldWrite) {
      const replacement = formatPinComment(pin.rawPath, pin.startLine, pin.endLine, record.actual);
      if (!editsByFile.has(file)) editsByFile.set(file, []);
      editsByFile.get(file).push({ start: pin.start, end: pin.end, replacement });
    }
  }

  for (const [file, edits] of editsByFile.entries()) {
    let updated = p.read(file);
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
    }
    writeFileSync(p.at(file), updated);
  }

  return changes;
}
