import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { check, project } from './repo/src/check.mjs';
import { init, update, checkCommand } from './repo/src/manage.mjs';
import { hashSourceSlice, syncPins } from './repo/src/pins.mjs';
import { parseMarkdown } from './repo/src/markdown.mjs';

const LAB = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(LAB, 'repo');
const NODE = process.execPath;
const CLI = path.join(REPO, 'bin/docaxioms.mjs');
const env = { ...process.env, TMPDIR: path.join(LAB, 'tmp'), PATH: path.dirname(NODE) + ':' + process.env.PATH, GIT_CONFIG_NOSYSTEM: '1' };
const requested = process.argv[2] ?? 'all';
const records = [];
function put(dir, file, value) {
  const dest = path.join(dir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}
function fixture(name, profile = {}) {
  const dir = fs.mkdtempSync(path.join(LAB, 'cases', name + '-'));
  put(dir, 'docaxioms.json', { reachable: '(?!)', ...profile });
  return dir;
}
function log(label, data) {
  fs.writeFileSync(path.join(LAB, 'logs', label + '.json'), JSON.stringify(data, null, 2) + '\n');
}
function run(label, executable, args, cwd = LAB, expected = 0, selected = []) {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
  const data = { label, command: [executable, ...args], cwd, exit: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
  records.push(data);
  log(label, data);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch {}
  const display = Array.isArray(parsed) ? parsed.filter(r => selected.some(s => r.name?.includes(s)) || r.problems?.length || r.notes?.length) : undefined;
  console.log(JSON.stringify({ label, exit: data.exit, ...(display ? { results: display } : { stdout: data.stdout, stderr: data.stderr }) }));
  assert.equal(data.exit, expected, label + ': unexpected exit; see logs');
  return { ...data, parsed };
}
function cli(label, dir, args = [], expected = 0, selected = []) {
  return run(label, NODE, [CLI, ...args, '--root', dir], LAB, expected, selected);
}
function ck(label, dir, expected = 0, selected = []) { return cli(label, dir, ['check', '--json'], expected, selected); }
function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function base(dir) {
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'fixture@example.invalid');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'fixture baseline');
  git(dir, 'checkout', '-b', 'experiment');
}
function decision(target, id = 'AD-1') {
  return `# Decisions\n\n| Id | Q | A | Status | Landing |\n|---|---|---|---|---|\n| ${id} | q | a | active | [passage](${target}) |\n`;
}
const groups = {
  async D1() {
    const d = fixture('D1-escape');
    const outside = path.basename(d) + '-outside.md';
    put(path.dirname(d), outside, '# Outside\nChosen outside this repository (AD-1).\n');
    put(d, 'README.md', `# App\n[escape](../${outside}#outside)\n`);
    ck('D1-link-outside', d, 0, ['links']);
    put(d, 'docaxioms.json', { reachable: '(?!)', decisions: { file: 'docs/decisions.md', id: 'AD-' } });
    put(d, 'docs/decisions.md', decision(`../../${outside}#outside`));
    ck('D1-landing-outside', d, 0, ['links', 'landed']);
    const p = project(d, {});
    const facts = { all: p.all, resolved: p.links('README.md'), outsidePassage: p.passage('../' + outside, 'outside') };
    log('D1-API', facts); console.log(JSON.stringify({ label: 'D1-API', ...facts }));
    put(d, 'README.md', `# App\n<!-- pin: ../${outside}#L1@000000000000 -->\n`);
    ck('D1-pin-boundary-control', d, 1, ['pins']);
    const root = fixture('D1-root');
    put(root, 'README.md', '# App\n');
    put(root, 'docs/README.md', '# Documents\n[root](/README.md#documents)\n');
    ck('D1-root-false-pass', root, 0, ['links']);
    put(root, 'README.md', '# Documents\n');
    put(root, 'docs/README.md', '# Other\n[root](/README.md#documents)\n');
    ck('D1-root-false-fail', root, 1, ['links']);
  },
  async D2() {
    const d = fixture('D2', { history: { dir: 'docs/history', banner: 'Out of date', erratum: '## Erratum ', base: 'main' } });
    const original = '# Old\nOut of date\n```js\nfn[0](123);\n```\n[x][ref]\n\n[ref]: ../a.md\n';
    put(d, 'docs/history/old.md', original); base(d);
    put(d, 'docs/history/old.md', original.replace('123', '999_TAMPERED'));
    ck('D2-code-tamper', d, 0, ['a history file']);
    put(d, 'docs/history/old.md', original.replace('../a.md', '../b.md'));
    ck('D2-reference-update', d, 1, ['a history file']);
  },
  async D3() {
    const d = fixture('D3'); fs.unlinkSync(path.join(d, 'docaxioms.json')); init(d);
    for (const [label, text] of [
      ['prose', 'Uses Cloudflare D1 and D3 charts.'],
      ['inline', 'Uses `D1` and `D3.js`.'],
      ['URL', '[external](https://example.invalid/D100/)'],
      ['fence-control', '```txt\nD1 D3\n```'],
    ]) {
      put(d, 'README.md', '# App\n' + text + '\n[docs](docs/README.md)\n');
      ck('D3-' + label, d, label === 'fence-control' ? 0 : 1, ['decision numbers']);
    }
    put(d, 'README.md', '# App\n[docs](docs/README.md)\n');
    put(d, 'src/app.mjs', '// Cloudflare D1\n');
    ck('D3-default-code-not-scanned', d, 0, ['decision numbers']);
    const prof = JSON.parse(fs.readFileSync(path.join(d, 'docaxioms.json'))); prof.codeExtensions = ['.mjs']; put(d, 'docaxioms.json', prof);
    ck('D3-configured-code', d, 1, ['decision numbers']);
  },
  async D4() {
    const variants = {
      decisions: { decisions: { file: 'docs/decisions.md', id: 'AD-' } },
      sections: { sections: [{ files: 'nonexistent', cite: 'section (\\d+)', document: 'docs/spec.md' }] },
      research: { research: { dir: 'docs/research', items: 'docs/plan.md' } },
    };
    for (const [kind, profile] of Object.entries(variants)) {
      const d = fixture('D4-' + kind, profile);
      for (const flags of [[], ['--json'], ['--report']]) cli('D4-' + kind + '-' + (flags[0]?.slice(2) ?? 'text'), d, ['check', ...flags], 1);
      try { await check(d, profile); assert.fail('must reject'); }
      catch (error) { const value = { name: error.name, code: error.code, message: error.message }; log('D4-API-' + kind, value); console.log(JSON.stringify({ label: 'D4-API-' + kind, ...value })); }
    }
    const empty = fixture('D4-optional'); ck('D4-no-config-control', empty, 0);
    const d = fixture('D4-openUntil', { research: { dir: 'docs/research', items: 'docs/plan.md', openUntil: '[' } });
    put(d, 'docs/plan.md', '# Plan\n');
    cli('D4-invalid-regex', d, ['check', '--json'], 1);
    put(d, 'docs/research/note.md', '# Note\nStatus: open (item)\n');
    put(d, 'docs/plan.md', '# Plan\n## Done (archive)\nOnly done: note.md\n');
    for (const [name, openUntil, exit] of [['literal', '## Done (archive)', 0], ['escaped-control', '## Done \\(archive\\)', 1]]) {
      put(d, 'docaxioms.json', { reachable: '(?!)', research: { dir: 'docs/research', items: 'docs/plan.md', openUntil } });
      ck('D4-heading-' + name, d, exit, ['open research']);
    }
  },
  async D5() {
    const d = fixture('D5', { pathPrefixes: ['build/'] });
    git(d, 'init', '-b', 'main');
    put(d, '.gitignore', 'build/\n');
    const content = 'export const x = 1;\n'; put(d, 'build/gen.js', content);
    const hash = hashSourceSlice(content, 1, 1).short;
    put(d, 'README.md', '# App\nSee `build/gen.js` and [gen](build/gen.js).\n<!-- pin: build/gen.js#L1@c304825107f8 -->\n');
    ck('D5-report-hardcoded-hash', d, hash === 'c304825107f8' ? 0 : 1, ['links', 'paths', 'pins']);
    put(d, 'README.md', `# App\nSee \`build/gen.js\` and [gen](build/gen.js).\n<!-- pin: build/gen.js#L1@${hash} -->\n`);
    ck('D5-local', d, 0, ['links', 'paths', 'pins']);
    const p = project(d, {}); const facts = { hash, listed: p.all, hasIgnored: p.has('build/gen.js'), checkIgnore: git(d, 'check-ignore', 'build/gen.js').trim() };
    log('D5-API', facts); console.log(JSON.stringify({ label: 'D5-API', ...facts }));
    git(d, 'config', 'user.email', 'fixture@example.invalid'); git(d, 'config', 'user.name', 'Fixture'); git(d, 'add', '.'); git(d, 'commit', '-m', 'fixture baseline');
    const clean = path.join(LAB, 'cases', path.basename(d) + '-clean');
    run('D5-clone', 'git', ['clone', '--no-hardlinks', d, clean]);
    ck('D5-clean', clean, 1, ['links', 'paths', 'pins']);
    put(clean, 'build/gen.js', content);
    ck('D5-build-before-check-control', clean, 0, ['links', 'paths', 'pins']);
  },
  async D6() {
    const d = fixture('D6', { decisions: { file: 'decisions.md', id: 'AD-' } });
    put(d, 'decisions.md', decision('README.md#arch'));
    const variants = [
      ['blank-separated', '<a id="arch"></a>\n\nChosen layout (AD-1).', 1],
      ['own-line-no-blank', '<a id="arch"></a>\nChosen layout (AD-1).', 0],
      ['same-line', '<a id="arch"></a>Chosen layout (AD-1).', 0],
      ['span', '<span id="arch"></span>Chosen layout (AD-1).', 1],
      ['h3', '<h3 id="arch">Chosen layout (AD-1).</h3>', 1],
    ];
    for (const [label, text, exit] of variants) {
      put(d, 'README.md', '# App\n\n' + text + '\n');
      ck('D6-' + label, d, exit, ['links', 'landed']);
      const md = parseMarkdown('# App\n\n' + text + '\n');
      log('D6-AST-' + label, { types: md.tree.children.map(n => n.type), passage: md.passage('arch') ?? null });
    }
  },
  async D7() {
    for (const [label, file, plan, exit] of [
      ['plain', 'note.md', '# Plan\n- [ ] plain text mentioning note.md without any link\n## Done\n', 0],
      ['reference', 'note.md', '# Plan\n- [ ] [see note][n]\n## Done\n[n]: research/note.md\n', 1],
      ['encoded', 'my note.md', '# Plan\n- [ ] [see note](research/my%20note.md)\n## Done\n', 1],
      ['inline-control', 'note.md', '# Plan\n- [ ] [note](research/note.md)\n## Done\n', 0],
    ]) {
      const d = fixture('D7-' + label, { research: { dir: 'docs/research', items: 'docs/plan.md', openUntil: '## Done' } });
      put(d, 'docs/research/' + file, '# Note\nStatus: open (item)\n'); put(d, 'docs/plan.md', plan);
      ck('D7-' + label, d, exit, ['links', 'open research']);
    }
  },
  async D8() {
    run('D8-commit', 'git', ['-C', REPO, 'show', '--format=fuller', '86dffc1', '--', 'docs/decisions.md', 'core/GUIDE.md']);
    const d = fixture('D8-records', { decisions: { file: 'docs/decisions.md', id: 'AD-' }, log: 'docs/log.md', history: { dir: 'docs/history', banner: 'Out of date', erratum: '## Erratum ', base: 'main' } });
    put(d, 'docs/decisions.md', decision('../README.md'));
    put(d, 'README.md', '# App\nAD-1\n'); put(d, 'docs/log.md', '# Log\n## 2026-11-23\nOriginal run.\n');
    base(d);
    put(d, 'docs/decisions.md', '# Decisions\n'); put(d, 'README.md', '# App\n'); put(d, 'docs/log.md', '# Log\n## 2026-11-23\nTAMPERED.\n');
    ck('D8-delete-row-and-change-log', d, 0, ['decision numbers', 'landed', 'a history file']);
    cli('D8-strict-control', d, ['check', '--strict-aids'], 0);
  },
  async D9() {
    const d = fixture('D9-pin'); put(d, 'README.md', '# App\n');
    cli('D9-empty-file-typo', d, ['pin', '--write', '--file', 'docs/typo.md']);
    cli('D9-empty-pin-typo', d, ['pin', '--write', '--pin', 'README.md:99']);
    const source = 'export const x = 1;\n'; put(d, 'src/a.mjs', source);
    put(d, 'README.md', '# App\n<!-- pin: src/a.mjs#L1@' + hashSourceSlice(source, 1, 1).short + ' -->\n');
    cli('D9-matching-up-to-date', d, ['pin', '--write', '--file', 'README.md']);
    put(d, 'src/a.mjs', 'export const x = 2;\n');
    cli('D9-stale-file-typo', d, ['pin', '--write', '--file', 'docs/typo.md']);
    cli('D9-stale-pin-typo', d, ['pin', '--write', '--pin', 'README.md:99']);
    const c = fixture('D9-lexical', { pathPrefixes: ['src/'], commands: [{ prefix: 'npm run ', jsonFile: 'package.json', key: 'scripts' }] });
    put(c, 'package.json', { scripts: { test: 'node -e "process.exit(0)"' } });
    for (const [label, text, exit] of [
      ['path-hash', '`src/deleted.mjs#L10`', 0], ['path-control', '`src/deleted.mjs`', 1],
      ['option', '`npm run --silent test`', 1], ['simple-control', '`npm run test`', 0],
      ['compound', '`cd ./sub && npm run missing`', 0], ['missing-control', '`npm run missing`', 1],
    ]) { put(c, 'README.md', '# App\n' + text + '\n'); ck('D9-' + label, c, exit, ['paths', 'commands']); }
    run('D9-real-npm-option', '/opt/homebrew/opt/node@24/bin/npm', ['run', '--silent', 'test'], c);
    const command = checkCommand(path.join(LAB, 'cases', 'sub'), LAB);
    log('D9-generated-command', { command }); console.log(JSON.stringify({ label: 'D9-generated-command', command }));
  },
  async META() {
    const sourceFiles = fs.readdirSync(path.join(REPO, 'src')).map(f => 'src/' + f);
    const lineCount = f => fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').length - 1;
    const results = await check(REPO, JSON.parse(fs.readFileSync(path.join(REPO, 'docaxioms.json'))));
    const facts = {
      node: process.version, platform: process.platform, arch: process.arch,
      sourceLines: Object.fromEntries(sourceFiles.map(f => [f, lineCount(f)])),
      srcTotal: sourceFiles.reduce((n, f) => n + lineCount(f), 0), bin: lineCount('bin/docaxioms.mjs'),
      coreMarkdown: ['core/AXIOMS.lock.md', 'core/GUIDE.md', 'core/GARDEN.md'].reduce((n, f) => n + lineCount(f), 0),
      dependencies: JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'))).dependencies,
      count: results.length, gates: results.filter(r => r.level === 'gate').length, aids: results.filter(r => r.level === 'aid').length,
      resultKeys: Object.keys(results[0]),
      templateDecision: fs.readFileSync(path.join(REPO, 'templates/docs/decisions.md'), 'utf8'),
    };
    log('META', facts); console.log(JSON.stringify({ label: 'META', ...facts }));
    ck('META-baseline-check', REPO);
    cli('META-garden-json', REPO, ['garden', '--json']);
    for (const [label, args] of [ ['pin-json', ['pin', '--json']], ['sarif', ['check', '--format', 'sarif']], ['junit', ['check', '--format', 'junit']], ['baseline', ['check', '--baseline', 'baseline.json']], ['write-baseline', ['check', '--write-baseline']], ['mcp', ['mcp']] ]) cli('META-' + label, REPO, args, 1);
    const d = fixture('META-zero', { codeExtensions: ['.mjs'] });
    put(d, 'README.md', '# App\n\nSeveral\nlines.\n'); put(d, 'spec.md', '# Spec\n## 1. Existing\n'); put(d, 'src/app.mjs', '// section 1\n'); base(d);
    put(d, 'src/app.mjs', '// section 99\n');
    const profile = { reachable: '(?!)', codeExtensions: ['.mjs'], budgets: [{ files: 'nonexistent/*.md', maxLines: 1 }], sections: [{ files: '^missing/', cite: 'section (\\d+)', document: 'spec.md' }], codeToDocs: [{ code: 'missing/**', docs: ['README.md'], base: 'main' }] };
    put(d, 'docaxioms.json', profile);
    ck('META-zero-json', d, 0, ['budget', 'cited sections', 'mapped documents']);
    cli('META-zero-text', d, ['check']);
    profile.budgets[0].files = 'README.md'; profile.sections[0].files = '^src/'; profile.codeToDocs[0].code = 'src/**'; put(d, 'docaxioms.json', profile);
    ck('META-nonzero-control', d, 1, ['budget', 'cited sections', 'mapped documents']);
    const ast = parseMarkdown('😀 [label](dest.md "title")\n').tree.children[0].children.find(n => n.type === 'link');
    const astFacts = { node: ast, positionOffsetsAre: 'JavaScript UTF-16 string offsets, not UTF-8 byte offsets', startByteOffset: Buffer.byteLength('😀 ') };
    log('META-url-positions', astFacts); console.log(JSON.stringify({ label: 'META-url-positions', ...astFacts }));
    const initialized = fixture('META-update'); fs.unlinkSync(path.join(initialized, 'docaxioms.json')); init(initialized);
    const prof = JSON.parse(fs.readFileSync(path.join(initialized, 'docaxioms.json'))); prof.decisions.id = 'CUSTOM-'; prof.extra = 'kept'; put(initialized, 'docaxioms.json', prof); update(initialized);
    const now = JSON.parse(fs.readFileSync(path.join(initialized, 'docaxioms.json'))); assert.equal(now.decisions.id, 'CUSTOM-'); assert.equal(now.extra, 'kept');
    log('META-update-keeps-settings', { id: now.decisions.id, extra: now.extra });
    const p = project(initialized, now); const md = 'README.md'; put(initialized, md, '# App\n<!-- pin: src/a.mjs#L1 -->\n'); put(initialized, 'src/a.mjs', 'one\n');
    const changes = syncPins(project(initialized, now), {}); log('META-pin-changes', changes); console.log(JSON.stringify({ label: 'META-pin-changes', changes }));
    const full = hashSourceSlice('a\r\nb\r\n').short === hashSourceSlice('a\nb\n').short;
    log('META-pin-CRLF', { equal: full }); assert.equal(full, true);
  },
};
for (const [name, fn] of Object.entries(groups)) if (requested === 'all' || requested === name) await fn();
log('results-' + requested, records);
console.log(JSON.stringify({ group: requested, subprocesses: records.length, allExpectedExitsMatched: true }));
