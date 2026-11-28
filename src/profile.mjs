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

const isText = (value) => isString(value) && value.trim() !== "";
// A path from the repository root, named the way the checks compare it: `docs/old`, not `docs/old/`, `./docs`,
// `docs//old`, `../x`, `/x` or `C:/x`.
const isPath = (value) => isText(value) && value.trim() === value && !value.includes("\\") && !/^[A-Za-z]:/.test(value)
  && value.split("/").every((part) => part.trim() !== "" && part !== "." && part !== "..");
const PATH = "from the repository root, such as docs/old: no empty, . or .. part, no leading or trailing /";

const KINDS = {
  string: [isString, "a string"],
  text: [isText, "a string that is not empty"],
  texts: [(value) => Array.isArray(value) && value.every(isText), "a list of strings that are not empty"],
  dir: [isPath, `a folder ${PATH}`],
  file: [isPath, `a file ${PATH}`],
  files: [(value) => Array.isArray(value) && value.every(isPath), `a list of files ${PATH}`],
  strings: [isStrings, "a list of strings"],
  globs: [(value) => isString(value) || isStrings(value), "a string or a list of strings"],
  regex: [isRegex, "a valid regular expression"],
  count: [(value) => Number.isInteger(value) && value > 0, "a whole number above 0"],
  hashes: [(value) => isObject(value) && Object.entries(value).every(([file, hash]) => isPath(file) && isString(hash) && /^[0-9a-f]{64}$/.test(hash)), `an object of files ${PATH}, to SHA-256 hashes`],
  headings: [(value) => isObject(value) && Object.values(value).every(isText), "an object of section numbers to headings"],
};

// A field ending in `!` is required where its object is given. An array of one shape is a list of such objects.
const SCHEMA = {
  core: { dir: "dir", source: "string", version: "string", commit: "string", files: "hashes" },
  entries: "files",
  reachable: "regex",
  codeExtensions: "texts",
  ignore: "strings",
  decisions: { file: "file!", id: "text!", landedSection: "text", citeExempt: "regex" },
  log: "globs",
  sections: [{ cite: "regex!", files: "regex!", document: "file!", rowTables: "headings" }],
  pathPrefixes: "texts",
  pathExempt: "regex",
  gonePaths: "texts",
  codeDocExempt: "regex",
  commands: [{ prefix: "text!", jsonFile: "file", key: "string", makefile: "file", list: "strings", exempt: "globs" }],
  research: { dir: "dir!", items: "file!", openUntil: "text" },
  history: { dir: "dir!", banner: "text!", erratum: "text!", base: "text" },
  card: { file: "file!", maxLines: "count", maxChars: "count" },
  budgets: [{ files: "globs!", maxLines: "count", maxChars: "count", exempt: "globs" }],
  codeToDocs: [{ code: "globs!", docs: "globs!", base: "text" }],
  evolutionary: { phrases: "texts", exempt: "globs" },
  garden: { exempt: "globs" },
  projectChecks: "file",
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
  return problemsOf(profile).map((problem) => `docaxioms.json: ${problem}`);
}

/**
 * What of `profile` the checks can read: without its nulls, and without each top-level key that has a problem, so
 * that a fault in one key leaves that key's checks unset and the others running (A6, A7). Undefined when the
 * profile is not an object at all.
 */
export function usableProfile(profile) {
  if (!isObject(profile)) return undefined;
  const faulty = new Set(problemsOf(profile).map((problem) => /^[^.[\s]+/.exec(problem)[0]));
  return withoutNulls(Object.fromEntries(Object.entries(profile).filter(([key]) => !faulty.has(key))));
}

function problemsOf(profile) {
  const problems = [];
  validate(profile, SCHEMA, "", problems);
  for (const [index, rule] of (Array.isArray(profile?.commands) ? profile.commands : []).entries()) {
    const sources = ["jsonFile", "makefile", "list"].filter((key) => rule?.[key] !== undefined && rule?.[key] !== null);
    if (sources.length !== 1) problems.push(`commands[${index}] needs exactly one of jsonFile, makefile and list`);
  }
  for (const [index, rule] of (Array.isArray(profile?.budgets) ? profile.budgets : []).entries()) {
    if (rule?.maxLines == null && rule?.maxChars == null) problems.push(`budgets[${index}] needs maxLines or maxChars`);
  }
  return problems;
}
