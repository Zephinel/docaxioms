// The keys docaxioms.json may have, and the type of value each one takes.
// Without this, a misspelt key or a value of the wrong type would switch its check off without a word (A6).
// A project's own keys, read by its project checks, start with `x-`.

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string";
// `every()` skips the holes of a sparse array; `Array.from` turns each hole into `undefined`, which then fails the test.
const isStrings = (value) => Array.isArray(value) && Array.from(value).every(isString);
const isRegex = (value) => {
  if (!isString(value)) return false;
  try { new RegExp(value); return true; } catch { return false; }
};

const isText = (value) => isString(value) && value.trim() !== "";
// A path relative to the repository root, written the way the checks compare paths: `docs/old` is valid;
// `docs/old/`, `./docs`, `docs//old`, `../x`, `/x` and `C:/x` are not.
const isPath = (value) => isText(value) && value.trim() === value && !value.includes("\\") && !/^[A-Za-z]:/.test(value)
  && value.split("/").every((part) => part.trim() !== "" && part !== "." && part !== "..");

const KINDS = {
  string: [isString, "a string"],
  text: [isText, "a non-empty string"],
  texts: [(value) => Array.isArray(value) && Array.from(value).every(isText), "a list of strings, none of them empty"],
  dir: [isPath, "a folder path relative to the repository root, without a leading or trailing \"/\", \".\" or \"..\" (for example \"docs/old\")"],
  file: [isPath, "a file path relative to the repository root, without a leading \"/\", \".\" or \"..\" (for example \"docs/decisions.md\")"],
  files: [(value) => Array.isArray(value) && Array.from(value).every(isPath), "a list of paths relative to the repository root, without a leading or trailing \"/\", \".\" or \"..\" (for example [\"README.md\"])"],
  // Gone paths may end in `/` to name a folder.
  folders: [(value) => Array.isArray(value) && Array.from(value).every((one) => isString(one) && isPath(one.replace(/\/$/, ""))), "a list of paths relative to the repository root, without a leading \"/\", \".\" or \"..\"; a folder may end in \"/\" (for example [\"src/legacy/\"])"],
  strings: [isStrings, "a list of strings"],
  globs: [(value) => isText(value) || (Array.isArray(value) && Array.from(value).every(isText)), "a glob pattern or a list of glob patterns, none of them empty"],
  patterns: [(value) => isText(value) || (Array.isArray(value) && value.length > 0 && Array.from(value).every(isText)), "a glob pattern or a non-empty list of glob patterns, none of them empty"],
  regex: [isRegex, "a valid regular expression"],
  count: [(value) => Number.isInteger(value) && value > 0, "a whole number of 1 or more"],
  hashes: [(value) => isObject(value) && Object.entries(value).every(([file, hash]) => isPath(file) && isString(hash) && /^[0-9a-f]{64}$/.test(hash)), "an object that maps each file path to its SHA-256 hash (64 lowercase hex characters)"],
  headings: [(value) => isObject(value) && Object.values(value).every(isText), "an object that maps section numbers to non-empty headings (for example { \"1.2\": \"### 1.2\" })"],
};

// Field suffixes: `!` marks a required field. `^` marks an optional field that limits what the rest of its object covers
// (such as core.dir or an exempt list): if it is invalid, the whole object is dropped, because dropping only the field
// would make the object cover more than intended. An array holding one shape is a list of objects of that shape.
const SCHEMA = {
  core: { dir: "dir^", source: "string", version: "string", commit: "string", files: "hashes" },
  entries: "files",
  reachable: "regex",
  codeExtensions: "texts",
  ignore: "files",
  decisions: { file: "file!", id: "text!", landedSection: "text^", citeExempt: "regex^" },
  log: "globs",
  sections: [{ cite: "regex!", files: "regex!", document: "file!", rowTables: "headings" }],
  pathPrefixes: "texts",
  pathExempt: "regex",
  gonePaths: "folders",
  codeDocExempt: "regex",
  commands: [{ prefix: "text!", jsonFile: "file", key: "string", makefile: "file", list: "texts", exempt: "globs" }],
  research: { dir: "dir!", items: "file!", openUntil: "text^" },
  history: { dir: "dir!", banner: "text!", erratum: "text!", base: "text" },
  card: { file: "file!", maxLines: "count", maxChars: "count" },
  budgets: [{ files: "patterns!", maxLines: "count", maxChars: "count", exempt: "globs" }],
  codeToDocs: [{ code: "patterns!", docs: "patterns!", base: "text" }],
  evolutionary: { phrases: "texts", exempt: "globs^" },
  garden: { exempt: "globs" },
  projectChecks: "file",
};

// Each problem records `path`, where it is (a list of keys and indexes), and `drop`, the part that usableProfile
// removes: the invalid value itself, or the object it belongs to when that object cannot work without it.
const named = (path) => path.reduce((text, key) => (typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${key}` : key), "") || "the profile";

function validate(value, shape, path, problems) {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) { problems.push({ path, drop: path, text: `${named(path)} must be a list` }); return; }
    for (let index = 0; index < value.length; index += 1) validate(value[index], shape[0], [...path, index], problems);
    return;
  }
  if (isObject(shape)) {
    if (!isObject(value)) { problems.push({ path, drop: path, text: `${named(path)} must be a JSON object` }); return; }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(shape, key) && !key.startsWith("x-")) {
        problems.push({ path: [...path, key], drop: [...path, key], text: `${named([...path, key || "\"\""])} is not a key docaxioms knows (a project's own keys must start with "x-")` });
      }
    }
    for (const [key, field] of Object.entries(shape)) {
      const at = [...path, key];
      const kind = isString(field) ? field.replace(/[!^]$/, "") : field;
      // JSON null leaves an optional key unset.
      if (value[key] === undefined || value[key] === null) {
        if (isString(field) && field.endsWith("!")) problems.push({ path: at, drop: path, text: `${named(at)} is required` });
        continue;
      }
      if (isString(kind)) {
        const [test, what] = KINDS[kind];
        // A required value that is wrong leaves its object unusable, as a missing one does.
        if (!test(value[key])) problems.push({ path: at, drop: /[!^]$/.test(field) ? path : at, text: `${named(at)} must be ${what}` });
      } else {
        validate(value[key], kind, at, problems);
      }
    }
  }
}

/**
 * `value` with every key set to JSON null removed, so that the checks treat null the same as a missing key.
 * A project's own `x-` keys are kept unchanged.
 */
export function withoutNulls(value) {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, one]) => one !== null || key.startsWith("x-"))
    .map(([key, one]) => [key, key.startsWith("x-") ? one : withoutNulls(one)]));
}

/** One message, starting with "docaxioms.json:", for each problem in `profile`. */
export function profileProblems(profile) {
  return problemsOf(profile).map(({ text }) => `docaxioms.json: ${text}`);
}

/**
 * A copy of `profile` that the checks can safely read: null keys are removed, and so is each invalid setting (or
 * the list item or object it belongs to), so that one mistake turns off only its own setting and every other check
 * still runs (A6, A7). Returns undefined when `profile` is not an object.
 */
export function usableProfile(profile) {
  if (!isObject(profile)) return undefined;
  // A project's own `x-` values are passed on unchanged, without being copied.
  const own = Object.entries(profile).filter(([key]) => key.startsWith("x-"));
  const usable = structuredClone(withoutNulls(Object.fromEntries(Object.entries(profile).filter(([key]) => !key.startsWith("x-")))));
  const drops = problemsOf(profile).map(({ drop }) => {
    const item = drop.findIndex((key) => typeof key === "number");
    return item === -1 ? drop : drop.slice(0, item + 1);
  });
  const gone = Symbol("gone");
  for (const drop of drops) {
    if (!drop.length) return undefined;
    const parent = drop.slice(0, -1).reduce((node, key) => node?.[key], usable);
    const last = drop.at(-1);
    if (Array.isArray(parent)) parent[last] = gone;
    else if (isObject(parent)) delete parent[last];
  }
  // Mark invalid list items first and remove them all at the end, so that the indexes of later drops stay correct.
  const sweep = (node) => {
    if (Array.isArray(node)) return node.filter((one) => one !== gone).map(sweep);
    if (isObject(node)) return Object.fromEntries(Object.entries(node).map(([key, one]) => [key, sweep(one)]));
    return node;
  };
  return { ...sweep(usable), ...Object.fromEntries(own) };
}

function problemsOf(profile) {
  const problems = [];
  validate(profile, SCHEMA, [], problems);
  const rule = (key, index, text) => problems.push({ path: [key, index], drop: [key, index], text: `${key}[${index}] ${text}` });
  for (const [index, one] of (Array.isArray(profile?.commands) ? profile.commands : []).entries()) {
    const sources = ["jsonFile", "makefile", "list"].filter((key) => one?.[key] !== undefined && one?.[key] !== null);
    if (sources.length !== 1) rule("commands", index, "must set exactly one of jsonFile, makefile or list");
  }
  for (const [index, one] of (Array.isArray(profile?.budgets) ? profile.budgets : []).entries()) {
    if (one?.maxLines == null && one?.maxChars == null) rule("budgets", index, "must set maxLines, maxChars or both");
  }
  return problems;
}
