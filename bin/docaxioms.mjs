#!/usr/bin/env node
// Unified CLI for docaxioms:
//   docaxioms check  [--root <dir>] [--report] [--strict-aids] [--json]
//   docaxioms pin    [--root <dir>] [--relocate] [--write --file <doc>... | --pin <doc:line>... | --all]
//   docaxioms garden [--root <dir>] [--json]
//   docaxioms init   <project>
//   docaxioms update <project> [--accept-axioms]
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { check, project } from "../src/check.mjs";
import { gardenManifest } from "../src/garden.mjs";
import { checkCommand, init, packageVersion, source, update } from "../src/manage.mjs";
import { syncPins } from "../src/pins.mjs";

const USAGE = `usage:
  docaxioms check  [--root <dir>] [--report] [--strict-aids] [--json]
  docaxioms pin    [--root <dir>] [--relocate] [--write (--file <doc> | --pin <doc:line> | --all)]
  docaxioms garden [--root <dir>] [--json]
  docaxioms init   <project>
  docaxioms update <project> [--accept-axioms]`;

function loadProfile(root) {
  const file = join(root, "docaxioms.json");
  if (!existsSync(file)) throw new Error(`${file} is not there`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const [command, ...rest] = process.argv.slice(2);

try {
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === "check") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string", default: "." },
        report: { type: "boolean", default: false },
        "strict-aids": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    });
    const root = resolve(values.root);
    const results = await check(root, loadProfile(root));
    if (values.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const { name, axioms, level, problems, notes = [] } of results) {
        const tag = !problems.length ? "ok  " : level === "aid" ? "aid " : "FAIL";
        console.log(`${tag} ${name} (${axioms})${problems.length ? `: ${problems.length}` : ""}`);
        for (const problem of problems) console.log(`       ${problem}`);
        for (const note of notes) console.log(`       note: ${note}`);
      }
    }
    const failed = results.some((result) => result.problems.length && (result.level !== "aid" || values["strict-aids"]));
    process.exit(failed && !values.report ? 1 : 0);
  }

  if (command === "pin") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string", default: "." },
        relocate: { type: "boolean", default: false },
        write: { type: "boolean", default: false },
        file: { type: "string", multiple: true, default: [] },
        pin: { type: "string", multiple: true, default: [] },
        all: { type: "boolean", default: false },
      },
    });
    if (values.write && !values.file.length && !values.pin.length && !values.all) {
      throw new Error(
        "pin --write requires an explicit scope (--file <doc>, --pin <doc:line>, or --all) so changed pins are only refreshed after review (A7); use --relocate for unchanged line shifts",
      );
    }
    const root = resolve(values.root);
    const p = project(root, loadProfile(root));
    const changes = syncPins(p, {
      write: values.write,
      relocate: values.relocate,
      files: values.file,
      pins: values.pin,
      all: values.all,
    });
    if (!changes.length) {
      console.log("all code pins are up to date");
      process.exit(0);
    }
    const printPreview = (preview) => {
      if (!preview?.lines?.length) return;
      for (const { line, text } of preview.lines) console.log(`       ${line} | ${text}`);
      if (preview.truncated) console.log(`       ... (+${preview.truncated} more lines)`);
    };
    let errors = 0;
    for (const change of changes) {
      if (["malformed", "outside-root", "missing", "invalid-range", "ambiguous-move"].includes(change.status)) {
        errors += 1;
        console.log(`ERR   ${change.file}:${change.line} ${change.target}: ${change.detail ?? change.status}`);
      } else if (change.status === "moved") {
        const verb = change.written ? "moved" : "shift";
        const from = change.fromRange[0] === change.fromRange[1] ? `L${change.fromRange[0]}` : `L${change.fromRange[0]}-L${change.fromRange[1]}`;
        const to = change.toRange[0] === change.toRange[1] ? `L${change.toRange[0]}` : `L${change.toRange[0]}-L${change.toRange[1]}`;
        console.log(`${verb} ${change.file}:${change.line} ${change.target}#${from} -> #${to} (@${change.hash} unchanged)`);
        if (change.written) printPreview(change.preview);
      } else {
        const verb = change.written ? "wrote" : "stale";
        const rangeTag = change.range
          ? (change.range[0] === change.range[1] ? `#L${change.range[0]}` : `#L${change.range[0]}-L${change.range[1]}`)
          : "";
        const diff = change.before ? `@${change.before} -> @${change.after}` : `@${change.after}`;
        console.log(`${verb} ${change.file}:${change.line} ${change.target}${rangeTag} (${diff})`);
        if (change.written) printPreview(change.preview);
      }
    }
    if (!values.relocate && changes.some((c) => c.status === "moved" && !c.written)) {
      console.log("run `docaxioms pin --relocate` to update shifted line numbers without altering hashes");
    }
    if (changes.some((c) => (c.status === "added" || c.status === "updated") && !c.written)) {
      console.log("review changed passages against code, then run `docaxioms pin --write --file <doc>`");
    }
    process.exit(errors ? 1 : 0);
  }

  if (command === "garden") {
    const { values } = parseArgs({
      args: rest,
      options: {
        root: { type: "string", default: "." },
        json: { type: "boolean", default: false },
      },
    });
    const root = resolve(values.root);
    const manifest = gardenManifest(root, loadProfile(root));
    if (values.json) {
      console.log(JSON.stringify(manifest, null, 2));
      process.exit(0);
    }
    console.log(`Doc-gardening manifest (${manifest.descriptions.length} K3 description documents):`);
    if (manifest.guidePath) console.log(`Protocol: ${manifest.guidePath}`);
    if (manifest.stageCard) {
      console.log(`Stage card: ${manifest.stageCard.file} (${manifest.stageCard.lines} lines)`);
    }
    for (const item of manifest.descriptions) {
      const mapping = item.mappedCode.length ? ` | code: ${item.mappedCode.join(", ")}` : "";
      console.log(`  - ${item.file} (${item.lines} lines, ${item.pins} pins${mapping})`);
    }
    process.exit(0);
  }

  if (command === "init" || command === "update") {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        "accept-axioms": { type: "boolean", default: false },
      },
    });
    const target = positionals[0];
    if (!target) throw new Error(USAGE);
    if (!existsSync(target)) throw new Error(`${target} is not there`);
    const root = resolve(target);
    const commit = source();
    const version = packageVersion();
    const label = commit ? `v${version} (${commit.slice(0, 8)})` : `v${version}`;
    const run = checkCommand(root);
    if (command === "init") {
      for (const made of init(root, commit)) console.log(`made ${made}`);
      console.log(`docaxioms/ is pinned to ${label}; run: ${run}`);
      console.log("Nothing runs the check for you yet: call it from your project's verify command, require it in CI,");
      console.log("and optionally from a pre-push hook. \"Run the check\" in the docaxioms README says what each holds.");
    } else {
      update(root, commit, { acceptAxioms: values["accept-axioms"] });
      console.log(`docaxioms/ is pinned to ${label}; run: ${run}`);
    }
    process.exit(0);
  }

  throw new Error(USAGE);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
