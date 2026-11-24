// This repository's own check: while docaxioms is in development, only these checks block a merge (AD-7).
// `npm run check` prints the rest as a report.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { check } from "../src/check.mjs";

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
  const results = await check(ROOT, profile);
  for (const name of BLOCKING) {
    const result = results.find((r) => r.name === name);
    assert.ok(result, `no check is named "${name}"`);
    assert.deepEqual(result.problems, [], name);
  }
});
