import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { init, source, project, descriptionDocs, gardenManifest, hashSourceSlice, check, parseMarkdown } from './repo/src/index.mjs';

const LAB = dirname(fileURLToPath(import.meta.url));
const REPO = join(LAB, 'repo');
const CLI = join(REPO, 'bin/docaxioms.mjs');
const CASES = join(LAB, 'cases');
mkdirSync(CASES, { recursive: true });
const env = { ...process.env, TMPDIR: join(LAB, 'tmp'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const results = [];
const cases = {};
const sha = x => createHash('sha256').update(x).digest('hex');
const put = (r, f, t) => { mkdirSync(dirname(join(r, f)), { recursive: true }); writeFileSync(join(r, f), t); };
const read = (r, f) => readFileSync(join(r, f), 'utf8');
const get = r => JSON.parse(read(r, 'docaxioms.json'));
const profile = (r, fn) => put(r, 'docaxioms.json', JSON.stringify(fn(get(r)), null, 2) + '\n');
const git = (r, ...a) => execFileSync('git', ['-C', r, '-c', 'user.name=Lab', '-c', 'user.email=lab@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
const commit = r => { git(r, 'add', '-A'); git(r, 'commit', '-qm', 'fixture'); };
const fresh = (name, initialized = true) => {
  const r = mkdtempSync(join(CASES, name + '-'));
  if (initialized) init(r, source(REPO));
  return r;
};
let current;
function run(r, args = [], command = process.execPath) {
  const actual = command === process.execPath ? [CLI, ...args] : args;
  const p = spawnSync(command, actual, { cwd: r, env, encoding: 'utf8' });
  console.log('$', command, ...actual);
  console.log('exit=' + p.status);
  console.log((p.stdout + p.stderr).trimEnd());
  results.push({ case: current, root: r, command, args: actual, exit: p.status, stdout: p.stdout, stderr: p.stderr });
  return p;
}
const cliCheck = (r, args = []) => run(r, ['check', '--root', r, ...args]);
const histText = link => '# Old\n\n> Out of date\n\nOriginal prose. ' + link + '\n';
const hist = (name, before) => {
  const r = fresh(name);
  profile(r, p => ({ ...p, history: { ...p.history, base: 'HEAD' } }));
  put(r, 'docs/history/old.md', before);
  put(r, 'docs/old.md', '# Old target\n');
  appendFileSync(join(r, 'docs/README.md'), '\n[Old target](old.md)\n');
  git(r, 'init', '-q', '-b', 'main'); commit(r);
  return r;
};

cases['B1-plan'] = () => { const r = fresh(current); put(r, 'docs/plan.md', '# Plan\n\nAdd `docs/api.md`.\n'); cliCheck(r); console.log('descriptionDocs contains plan:', descriptionDocs(project(r, get(r))).includes('docs/plan.md')); };
cases['B1-log'] = () => { const r = fresh(current); put(r, 'docs/log.md', '# Log\n\nRemoved `docs/old.md`.\n'); cliCheck(r); };
cases['B1-decisions'] = () => { const r = fresh(current); appendFileSync(join(r, 'docs/decisions.md'), '| D1 | Before | Used `docs/old.md` | superseded by D2 | - |\n| D2 | Later | Replaced | withdrawn | - |\n'); cliCheck(r); };
cases['B1-research'] = () => { const r = fresh(current); put(r, 'docs/research/a.md', '# A\n\nStatus: open (a)\n\nConsider `docs/external.md`.\n'); appendFileSync(join(r, 'docs/plan.md'), '\n[A](research/a.md)\n'); cliCheck(r); };

cases['B2-title'] = () => { const r = hist(current, histText('[plan](../plan.md)')); put(r, 'docs/history/old.md', histText('[plan](../plan.md "静默改写内容\n可跨多行")')); cliCheck(r); console.log('AST links:', JSON.stringify(parseMarkdown(read(r, 'docs/history/old.md')).links())); };
cases['B2-outside-link'] = () => { const r = hist(current, histText('[plan](../plan.md)')); put(r, 'docs/history/old.md', read(r, 'docs/history/old.md').replace('Original prose.', 'Tampered prose.')); cliCheck(r); };
cases['B2-reference'] = () => { const r = hist(current, histText('[plan][p]\n\n[p]: ../old.md')); put(r, 'docs/history/old.md', read(r, 'docs/history/old.md').replace('../old.md', '../plan.md')); cliCheck(r); };
cases['B2-balanced'] = () => { const r = hist(current, histText('[plan](../Foo_(bar).md)')); put(r, 'docs/Foo_(bar).md', '# Target\n'); appendFileSync(join(r, 'docs/README.md'), '\n[Target](Foo_(bar).md)\n'); commit(r); put(r, 'docs/history/old.md', read(r, 'docs/history/old.md').replace('../Foo_(bar).md', '../plan.md')); cliCheck(r); };
cases['B2-link-valid'] = () => { const r = hist(current, histText('[plan](../old.md)')); put(r, 'docs/history/old.md', read(r, 'docs/history/old.md').replace('../old.md', '../plan.md')); cliCheck(r); };

cases['B3-doc'] = () => { const r = fresh(current); put(r, 'README.md', '# Demo\n\nCloudflare D1, D2 diagrams, D3.js and `D3`.\n'); cliCheck(r); };
cases['B3-code'] = () => { const r = fresh(current); profile(r, p => ({ ...p, codeExtensions: ['.mjs'] })); put(r, 'src/a.mjs', 'const D0 = 0; const D9999 = 1; const D3_scale = 2; const AD3 = 3; const D10000 = 4;\n'); cliCheck(r); };
cases['B3-boundary'] = () => { const r = fresh(current); put(r, 'README.md', '# Demo\n\nD3_scale AD3 D10000\n\n```txt\nD3\n```\n'); cliCheck(r); };

cases['B4-crlf'] = () => {
  const r = fresh(current); put(r, 'README.md', '# Demo\n'); put(r, 'docs/history/old.md', histText('[plan](../plan.md)'));
  git(r, 'init', '-q', '-b', 'main'); commit(r);
  const clone = join(CASES, current + '-clone-' + Date.now());
  run(CASES, ['clone', '-c', 'core.autocrlf=true', '--no-local', r, clone], 'git');
  console.log('autocrlf:', git(clone, 'config', '--get', 'core.autocrlf').trim());
  console.log('CRLF in axioms:', read(clone, 'docaxioms/AXIOMS.lock.md').includes('\r\n'));
  console.log('CRLF in git blob:', git(clone, 'show', 'HEAD:docaxioms/AXIOMS.lock.md').includes('\r\n'));
  cliCheck(clone); run(clone, ['update', clone]);
  // Isolate the history predicate from unrelated failed core hashes.
  put(clone, 'docaxioms.json', JSON.stringify({ entries: ['README.md'], reachable: '^$', history: { dir: 'docs/history', banner: 'Out of date', erratum: '## Erratum ', base: 'HEAD' } }));
  appendFileSync(join(clone, 'docs/history/old.md'), '\r\n## Erratum 2026-11-25\r\n\r\nA dated correction.\r\n');
  cliCheck(clone);
};
cases['B4-lf-control'] = () => { const r = hist(current, histText('[plan](../plan.md)')); appendFileSync(join(r, 'docs/history/old.md'), '\n## Erratum 2026-11-25\n\nA dated correction.\n'); cliCheck(r); };

cases['B5-overlap'] = () => { const r = fresh(current); put(r, 'docs/research/a.md', '# A\n\nStatus: open (a)\n'); put(r, 'docs/research/alpha.md', '# Alpha\n\nStatus: open (alpha)\n'); put(r, 'docs/research/README.md', '# Research\n\n[A](a.md)\n'); appendFileSync(join(r, 'docs/README.md'), '\n[Research](research/README.md)\n'); put(r, 'docs/plan.md', '# Plan\n\n- [alpha](research/alpha.md)\n'); cliCheck(r); console.log('alpha.md contains a.md:', 'alpha.md'.includes('a.md')); };
cases['B5-plain'] = () => { const r = fresh(current); put(r, 'docs/research/a.md', '# A\n\nStatus: open (a)\n'); appendFileSync(join(r, 'docs/README.md'), '\n[A](research/a.md)\n'); put(r, 'docs/plan.md', '# Plan\n\nDiscuss a.md later.\n'); cliCheck(r); };
cases['B5-inline-control'] = () => { const r = fresh(current); put(r, 'docs/research/a.md', '# A\n\nStatus: open (a)\n'); appendFileSync(join(r, 'docs/README.md'), '\n[A](research/a.md)\n'); put(r, 'docs/plan.md', '# Plan\n\nDiscuss `a.md` later.\n'); cliCheck(r); };

const landingCase = (target, file, text) => { const r = fresh(current); if (file) put(r, file, text); appendFileSync(join(r, 'docs/decisions.md'), `| D1 | Test | Test | active | [landing](${target}) |\n`); cliCheck(r); };
cases['B6-code'] = () => landingCase('../src/index.mjs', 'src/index.mjs', 'export const x = 1;\n');
cases['B6-dir'] = () => landingCase('.', null, null);
cases['B6-md-control'] = () => landingCase('../README.md', 'README.md', '# Demo\n\nNo citation.\n');
cases['B6-root'] = () => { const r = fresh(current); put(r, 'docs/design.md', '# Design\n'); put(r, 'docs/index.md', '# Index\n\n[Design](/docs/design.md)\n'); appendFileSync(join(r, 'docs/README.md'), '\n[Index](index.md)\n[Design](design.md)\n'); cliCheck(r); console.log('resolved:', JSON.stringify(project(r, get(r)).links('docs/index.md'))); };
cases['B6-query'] = () => { const r = fresh(current); put(r, 'docs/design.md', '# Design\n'); put(r, 'README.md', '# Demo\n\n[Design](docs/design.md?plain=1)\n'); appendFileSync(join(r, 'docs/README.md'), '\n[Design](design.md)\n'); cliCheck(r); };

cases['B7-slash'] = () => { const r = fresh(current, false); console.log('init return:', JSON.stringify(init(r + '/', 'c1'))); console.log('AGENTS.md exists:', existsSync(join(r, 'AGENTS.md'))); console.log('GENTS.md exists:', existsSync(join(r, 'GENTS.md'))); };
cases['B7-empty'] = () => { const r = fresh(current); put(r, 'CURRENT.md', ''); put(r, 'README.md', ''); run(r, ['garden', '--root', r, '--json']); profile(r, p => ({ ...p, card: { ...p.card, maxLines: 0.5 }, budgets: [{ files: 'README.md', maxLines: 0.5 }] })); cliCheck(r); };

cases['A-notes'] = () => { const r = fresh(current); cliCheck(r); cliCheck(r, ['--strict-aids']); git(r, 'init', '-q', '-b', 'main'); commit(r); cliCheck(r, ['--strict-aids']); };
cases['A-shallow'] = () => { const r = hist(current, histText('[plan](../plan.md)')); profile(r, p => ({ ...p, history: { ...p.history, base: 'origin/main' }, codeToDocs: [{ code: 'src/**', docs: ['README.md'] }] })); put(r, 'README.md', '# Demo\n'); put(r, 'src/a.mjs', 'export const x = 1;\n'); commit(r); git(r, 'update-ref', 'refs/remotes/origin/main', git(r, 'rev-parse', 'HEAD').trim()); git(r, 'checkout', '-qb', 'feature'); put(r, 'docs/history/old.md', read(r, 'docs/history/old.md').replace('Original prose.', 'Tampered.')); appendFileSync(join(r, 'src/a.mjs'), '// Changed\n'); commit(r); cliCheck(r, ['--strict-aids']); const c = join(CASES, current + '-clone-' + Date.now()); run(CASES, ['clone', '--depth', '1', '--branch', 'feature', 'file://' + r, c], 'git'); console.log('shallow:', git(c, 'rev-parse', '--is-shallow-repository').trim()); cliCheck(c, ['--strict-aids']); appendFileSync(join(c, 'docs/history/old.md'), '\nIllegal working-tree edit.\n'); cliCheck(c, ['--strict-aids']); };
cases['A-codeExtensions'] = () => { const r = fresh(current); put(r, 'src/a.mjs', '// docs/missing.md\n'); console.log('default code:', JSON.stringify(project(r, get(r)).code)); cliCheck(r); profile(r, p => ({ ...p, codeExtensions: ['.mjs'] })); cliCheck(r); };
cases['A-pin-preview'] = () => { const r = fresh(current); put(r, 'src/a.txt', Array.from({ length: 15 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n'); put(r, 'README.md', '# Demo\n\n<!-- pin: src/a.txt#L1-L15 -->\n<!-- pin: src/a.txt -->\n'); run(r, ['pin', '--root', r, '--write']); run(r, ['pin', '--root', r, '--write', '--all']); };
cases['A-guards'] = () => { const r = fresh(current, false); put(r, 'AGENTS.md', 'MINE\n'); run(r, ['init', r]); console.log('preserved:', JSON.stringify(read(r, 'AGENTS.md'))); console.log('mode:', (statSync(join(r, 'docaxioms/AXIOMS.lock.md')).mode & 0o777).toString(8)); run(r, ['init', r]); const s = fresh(current + '-folder', false); put(s, 'docaxioms/mine.txt', 'mine'); run(s, ['init', s]); };
cases['A-tamper'] = () => { const r = fresh(current); const f = 'docaxioms/AXIOMS.lock.md'; chmodSync(join(r, f), 0o644); appendFileSync(join(r, f), '\nTampered.\n'); cliCheck(r); profile(r, p => { p.core.files['AXIOMS.lock.md'] = sha(read(r, f)); return p; }); cliCheck(r); };
cases['A-withdrawn'] = () => { const r = fresh(current); appendFileSync(join(r, 'docs/decisions.md'), '| D1 | Test | Test | active | - |\n'); cliCheck(r); put(r, 'docs/decisions.md', read(r, 'docs/decisions.md').replace('| active |', '| withdrawn |')); cliCheck(r); };
cases['A-pin-motion'] = () => { const r = fresh(current); put(r, 'src/a.txt', 'alpha\nbeta\n'); const h = hashSourceSlice('alpha\nbeta\n', 1, 2).short; put(r, 'README.md', `# Demo\n\n<!-- pin: src/a.txt#L1-L2@${h} -->\n`); put(r, 'src/a.txt', 'header\nalpha\nbeta\n'); cliCheck(r); run(r, ['pin', '--root', r, '--relocate']); console.log('new pin:', read(r, 'README.md').trim()); cliCheck(r); put(r, 'src/a.txt', 'header\n alpha\nbeta\n'); cliCheck(r); };

cases['M-json-schema'] = () => { const r = fresh(current); put(r, 'README.md', '# Demo\n\nRun `make missing`.\n'); profile(r, p => ({ ...p, commmands: [{ prefix: 'make ', list: ['test'] }], inventedKey: true })); cliCheck(r, ['--json']); profile(r, p => { p.commands = p.commmands; delete p.commmands; return p; }); cliCheck(r, ['--json']); run(r, ['garden', '--root', r, '--json']); };
cases['M-commands-fence'] = () => { const r = fresh(current); profile(r, p => ({ ...p, commands: [{ prefix: 'make ', list: ['test'] }] })); put(r, 'README.md', '# Demo\n\n```bash\nmake missing\n```\n'); cliCheck(r); appendFileSync(join(r, 'README.md'), '\n`make missing`\n'); cliCheck(r); };
cases['M-missing-cli'] = () => { const r = fresh(current); for (const args of [['demo'], ['check', '--root', r, '--changed-only'], ['check', '--root', r, '--format', 'sarif'], ['check', '--root', r, '--require-base'], ['mcp']]) run(r, args); };
cases['M-init-detect'] = () => { const r = fresh(current, false); put(r, 'package.json', '{"scripts":{"verify":"true"}}\n'); put(r, 'Makefile', 'test:\n\ttrue\n'); run(r, ['init', r]); console.log('profile:', JSON.stringify(get(r))); };
cases['M-init-link'] = () => { const r = fresh(current, false); put(r, 'README.md', '# Existing\n\n[Missing](docs/missing.md)\n'); run(r, ['init', r]); cliCheck(r); };
cases['M-aid-report'] = () => { const r = fresh(current); profile(r, p => ({ ...p, evolutionary: { phrases: ['used to'] } })); put(r, 'README.md', '# Demo\n\nThis used to be manual.\n'); cliCheck(r); cliCheck(r, ['--strict-aids']); cliCheck(r, ['--strict-aids', '--report']); put(r, 'docaxioms.json', '{bad json'); cliCheck(r, ['--report']); };
cases['M-concurrency'] = () => {
  const r = fresh(current); git(r, 'init', '-q', '-b', 'main'); commit(r);
  git(r, 'checkout', '-qb', 'worker-a'); appendFileSync(join(r, 'docs/decisions.md'), '| D1 | A | A | withdrawn | - |\n'); commit(r);
  git(r, 'checkout', '-qb', 'worker-b', 'main'); appendFileSync(join(r, 'docs/decisions.md'), '| D1 | B | B | withdrawn | - |\n'); commit(r);
  run(r, ['-C', r, '-c', 'user.name=Lab', '-c', 'user.email=lab@example.invalid', '-c', 'commit.gpgsign=false', 'merge', '--no-edit', 'worker-a'], 'git');
};
cases['M-semantic'] = () => landingCase('../README.md', 'README.md', '# Demo\n\nThis is unrelated to the decision. D1.\n');
cases['M-suggestions'] = () => {
  const r = fresh(current, false);
  const original = 's = """a  \nb"""\nprint(repr(s))\n';
  const normalized = original.split('\n').map(x => x.replace(/[ \t]+$/, '')).join('\n');
  put(r, 'original.py', original); put(r, 'normalized.py', normalized);
  run(r, ['original.py'], 'python3'); run(r, ['normalized.py'], 'python3');
  console.log('old/new hashes:', hashSourceSlice(original).short, hashSourceSlice(normalized).short);
  const guide = read(REPO, 'core/GUIDE.md'); const profilePart = guide.slice(guide.indexOf('## The profile'));
  console.log('GUIDE profile section bytes:', Buffer.byteLength(profilePart));
  console.log('template total bytes:', 552+3460+7091+224+265, 'GUIDE percent:', 7091/(552+3460+7091+224+265)*100);
  console.log('bootstrap total bytes:', 832+3460+7091+2346+6971);
  console.log('template budget-chain chars:', 6000+3460+7091+4000+265);
};
cases['M-metadata'] = async () => {
  console.log('runtime:', process.version, process.platform, process.arch);
  console.log('HEAD:', git(REPO, 'rev-parse', 'HEAD').trim());
  const files = ['templates/AGENTS.md', 'core/AXIOMS.lock.md', 'core/GUIDE.md', 'templates/CURRENT.md', 'templates/docs/README.md', 'core/GARDEN.md', 'README.md', 'AGENTS.md', 'core/LICENSE', 'templates/CLAUDE.md'];
  for (const f of files) console.log('bytes/chars', f, readFileSync(join(REPO, f)).length, read(REPO, f).length);
  const tracked = git(REPO, 'ls-files').trim().split('\n');
  const engine = tracked.filter(f => f.startsWith('src/') || f.startsWith('bin/'));
  console.log('tracked:', tracked.length, 'engine-files:', engine.length, 'engine-bytes:', engine.reduce((n, f) => n + readFileSync(join(REPO, f)).length, 0));
  const c = read(REPO, 'src/check.mjs');
  for (const level of ['gate', 'aid']) console.log(level, c.split('\n').flatMap((l, i) => l.includes('level: "' + level + '"') ? [i + 1] : []));
  const r = fresh(current); const checks = await check(r, get(r));
  console.log('runtime check count:', checks.length, 'gates:', checks.filter(x => x.level === 'gate').length, 'aids:', checks.filter(x => x.level === 'aid').length);
  console.log('built-in check names:', JSON.stringify(checks.map((c, i) => [i + 1, c.level, c.name])));
  console.log('exports:', Object.keys(await import('./repo/src/index.mjs')).join(', '));
  for (const f of ['action.yml', 'action.yaml', '.github/workflows/check.yml', 'Dockerfile', '.gitattributes', '.agents/skills']) console.log('exists', f, existsSync(join(REPO, f)));
  console.log('templates:', tracked.filter(x => x.startsWith('templates/')).join(', '));
};

const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(cases)) {
  if (!cases[name]) throw new Error('Unknown case: ' + name);
  current = name;
  console.log('\n### CASE', name);
  await cases[name]();
}
writeFileSync(join(LAB, wanted.length ? 'results-selected.json' : 'results.json'), JSON.stringify(results, null, 2));
