// This repository's own check: while docaxioms is in development, only these checks block a merge (AD-7).
// `npm run check` prints the rest as a report.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { check, project } from "../src/check.mjs";
import { inspectPins } from "../src/pins.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BLOCKING = [
  "core files are the pinned version",
  "links and anchors resolve",
  "documents named in code exist",
  "paths named in current documents exist",
  "commands named in current documents exist",
];

test("this repository passes the checks that block a merge", async () => {
  const profile = JSON.parse(readFileSync(new URL("../docaxioms.json", import.meta.url), "utf8"));
  // Without its entry the axiom pin checks nothing.
  assert.match(profile.core?.files?.["core/AXIOMS.lock.md"] ?? "", /^[0-9a-f]{64}$/, "docaxioms.json pins core/AXIOMS.lock.md");
  const results = await check(ROOT, profile);
  const failing = BLOCKING.map((name) => {
    const matches = results.filter((r) => r.name === name);
    return [name, matches.length === 1 ? matches[0].problems : [`${matches.length} checks have this name`]];
  });
  // A code pin whose file is gone, or outside the repository, is a path that leads nowhere; a pin whose code changed or moved is only reported.
  const missingPins = inspectPins(project(ROOT, profile))
    .filter((r) => r.status === "missing" || r.status === "outside-root")
    .map((r) => `${r.file}:${r.pin.line}: ${r.detail}`);
  failing.push(["code pins name files that are there", missingPins]);
  assert.deepEqual(failing.filter(([, problems]) => problems.length), []);
});
