// What a profile (docaxioms.json) may say: every key the checks read, and the kind of value each takes.
// A misspelt key or a value of the wrong kind would otherwise turn its check off unseen (A6).
// A project's own keys, for its project checks, start with `x-`.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string";
const isStrings = (value) => Array.isArray(value) && value.every(isString);
const isRegex = (value) => {
  if (!isString(value)) return false;
  try { new RegExp(value); return true; } catch { return false; }
};

const KINDS = {
  string: [isString, "a string"],
  text: [(value) => isString(value) && value.trim() !== "", "a string that is not empty"],
  // A folder from the repository root, named the way the checks join it: `docs/old`, not `docs/old/`, `.` or `../x`.
  dir: [(value) => isString(value) && !value.includes("\\") && value.split("/").every((part) => part !== "" && part !== "." && part !== ".."), "a folder from the repository root, such as docs/old: no empty, . or .. part, no trailing /"],
  strings: [isStrings, "a list of strings"],
  globs: [(value) => isString(value) || isStrings(value), "a string or a list of strings"],
  regex: [isRegex, "a valid regular expression"],
  count: [(value) => Number.isInteger(value) && value > 0, "a whole number above 0"],
  hashes: [(value) => isObject(value) && Object.values(value).every((hash) => isString(hash) && /^[0-9a-f]{64}$/.test(hash)), "an object of file names to SHA-256 hashes"],
  headings: [(value) => isObject(value) && Object.values(value).every(isString), "an object of section numbers to headings"],
};

// A field ending in `!` is required where its object is given. An array of one shape is a list of such objects.
const SCHEMA = {
  core: { dir: "dir", source: "string", version: "string", commit: "string", files: "hashes" },
  entries: "strings",
  reachable: "regex",
  codeExtensions: "strings",
  ignore: "strings",
  decisions: { file: "text!", id: "text!", landedSection: "string", citeExempt: "regex" },
  log: "globs",
  sections: [{ cite: "regex!", files: "regex!", document: "text!", rowTables: "headings" }],
  pathPrefixes: "strings",
  pathExempt: "regex",
  gonePaths: "strings",
  codeDocExempt: "regex",
  commands: [{ prefix: "text!", jsonFile: "text", key: "string", makefile: "text", list: "strings", exempt: "globs" }],
  research: { dir: "dir!", items: "text!", openUntil: "text" },
  history: { dir: "dir!", banner: "text!", erratum: "text!", base: "text" },
  card: { file: "text!", maxLines: "count", maxChars: "count" },
  budgets: [{ files: "globs!", maxLines: "count", maxChars: "count", exempt: "globs" }],
  codeToDocs: [{ code: "globs!", docs: "globs!", base: "string" }],
  evolutionary: { phrases: "strings", exempt: "globs" },
  garden: { exempt: "globs" },
  projectChecks: "string",
};

function validate(value, shape, where, problems) {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) { problems.push(`${where} must be a list`); return; }
    value.forEach((item, index) => validate(item, shape[0], `${where}[${index}]`, problems));
    return;
  }
  if (isObject(shape)) {
    if (!isObject(value)) { problems.push(`${where || "the profile"} must be an object`); return; }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(shape, key) && !key.startsWith("x-")) problems.push(`${where ? `${where}.` : ""}${key} is not a key docaxioms knows (a project's own keys start with "x-")`);
    }
    for (const [key, field] of Object.entries(shape)) {
      const at = where ? `${where}.${key}` : key;
      const kind = isString(field) ? field.replace(/!$/, "") : field;
      // JSON null leaves an optional key unset.
      if (value[key] === undefined || value[key] === null) {
        if (isString(field) && field.endsWith("!")) problems.push(`${at} is required`);
        continue;
      }
      if (isString(kind)) {
        const [test, what] = KINDS[kind];
        if (!test(value[key])) problems.push(`${at} must be ${what}`);
      } else {
        validate(value[key], kind, at, problems);
      }
    }
  }
}

/**
 * `profile` without the keys it sets to JSON null, which leaves them unset, so that every check reads one meaning.
 * A project's own `x-` data is its own and kept as it is.
 */
export function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, one]) => one !== null || key.startsWith("x-"))
    .map(([key, one]) => [key, key.startsWith("x-") ? one : withoutNulls(one)]));
}

/** Every way `profile` departs from what docaxioms reads, as one message each. */
export function profileProblems(profile) {
  const problems = [];
  validate(profile, SCHEMA, "", problems);
  for (const [index, rule] of (Array.isArray(profile?.commands) ? profile.commands : []).entries()) {
    const sources = ["jsonFile", "makefile", "list"].filter((key) => rule?.[key] !== undefined && rule?.[key] !== null);
    if (sources.length !== 1) problems.push(`commands[${index}] needs exactly one of jsonFile, makefile and list`);
  }
  for (const [index, rule] of (Array.isArray(profile?.budgets) ? profile.budgets : []).entries()) {
    if (rule?.maxLines == null && rule?.maxChars == null) problems.push(`budgets[${index}] needs maxLines or maxChars`);
  }
  return problems.map((problem) => `docaxioms.json: ${problem}`);
}
