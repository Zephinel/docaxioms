# 报告 C：docaxioms 源码与行为事实核验

核验日期：2026-11-25。唯一实验基线：`8336bed3bbcfc7ff99a01fb9549142c7260a5aa9`；macOS arm64，Node `v22.23.5`。

**主要结果：D-1 的越界解析和仓外 Markdown 读取成立；D-4 的缺文件中断、`openUntil` 正则问题成立，但“CLI 未捕获崩溃”不准确；D-5 的原复现 hash 错误，修正后可复现本地/干净检出的差异；D-6 不要求锚点与正文同一行；D-8 的删除事实成立，但不能据此认定为 GUIDE 所说的推翻旧决策后违规删除，也不能归因于 AD-7。D-9 的四个子现象均有见证，其中“错误作用域总是静默”不成立。**

本文只核验 C 关于本仓源码、模板、配置、约定和行为的断言；其他产品、论文、Stars、注册表发布时间及公开用户统计不在范围内。`0.1.0-alpha.0` 确认为源码版本，不据此追认注册表发布状态。上一轮 [codex-findings.md](codex-findings.md) 已核验内容不重新展开；按本次要求仍实跑 D-1 至 D-9，重合项只列本轮证据与 C 的新增细节或矛盾。

判定口径：**CONFIRMED**＝核心现象有当前源码和运行证据；**REFUTED**＝证据与断言相反；**PARTIAL**＝部分成立，或描述扩大了适用条件/保证。运行现象成立不自动证明 C 的严重度、出现频率、违反公理的定性或修复成本。

## 1. 基线、隔离与证据入口

| 项目 | 实测结果 | 证据 |
|---|---|---|
| C 基线与 main | `8336bed` 与 `main=5674b46a87ea714e623f2edadc0702f5a0fe29eb` 的树均为 `d0d496def89344827ebcad62d927d3b34da3b9a6`，文件内容完全相同 | `git -C "$SRC" rev-parse 8336bed^{tree} main^{tree}`；`git -C "$SRC" diff --exit-code 8336bed main`，退出 **0** |
| 当前实际工作目录 | `HEAD=7ebab95f189f74515e5a7354018cb433fdf258a7`，分支 `research-fact-check`，开始时干净；它已有调研材料及 profile 调整，因此没有拿它直接替代基线 | `git -C "$SRC" status --short --branch -uall`；实验前后指纹 |
| 实验副本 | 本地只读克隆，再在 **副本** detached checkout `8336bed`；32 个 tracked 文件逐字节等于该提交。依赖与 Node 复用旧 lab，仅在新 lab 建链接；依赖链接加入副本 `.git/info/exclude` | [final-integrity.json](codex3-lab/logs/final-integrity.json)：`baselineChangedFiles: []`、`isolatedStatus: ""` |
| 完整基线验证 | `npm run check` 退出 **0**；`tests 102 / pass 102 / fail 0 / skipped 0`；随后 16 项自检全部 `ok` | [npm-check.txt](codex3-lab/logs/npm-check.txt) |
| 本轮复现 | 66 次带完整参数/退出码的复现子进程，全部符合逐项断言；另有 10 个 self gate 正反对照结果（辅助脚本改为可重复运行后重跑一轮）。准备 fixture 的 Git 命令不计入这两个数 | [reproductions.txt](codex3-lab/logs/reproductions.txt)、[results-all.json](codex3-lab/logs/results-all.json)、[self-gates.json](codex3-lab/logs/self-gates.json) |
| 原仓库未修改 | 开始/结束 HEAD、status、文件集合及 93 个 tracked/untracked 文件的 SHA-256 相同；只向指定 scratchpad 写实验和本报告 | [original-before.json](codex3-lab/original-before.json)、[original-after.json](codex3-lab/original-after.json)、[final-integrity.json](codex3-lab/logs/final-integrity.json) |

以下命令中的变量：

```sh
SRC=<repo>
LAB=<lab>
NODE="${LAB%/codex3-lab}/codex-lab/runtime/node_modules/.bin/node"
CLI="$LAB/repo/bin/docaxioms.mjs"
```

完整复现程序：[reproduce.mjs](codex3-lab/reproduce.mjs)。运行某组使用 `"$NODE" "$LAB/reproduce.mjs" D1`，也可将末尾换成 `D2`…`D9`、`META` 或 `all`。**各组驱动本身退出 0，表示目标子进程退出码与预期一致；下文表内的 0/1 是实际 CLI 子进程退出码。** 每个 label 对应 `codex3-lab/logs/<label>.json`，内含真实 fixture 路径、完整命令、stdout/stderr；fixture 保留在新 lab 的 `cases/`。

## 2. §5.1：D-1 至 D-9 逐项裁决

| 项 | 判定 | 本轮结论与必须修正的描述 | 基线源码位置 |
|---|---|---|---|
| D-1：链接/Landing 越界、前导 `/` | **CONFIRMED（解析行为）** | 普通链接和 Landing 均能用 `../` 指向仓外文件，带 Markdown fragment 时实际读到仓外正文；同一目标作为 pin 则报越界。`docs/README.md` 中 `/README.md` 被拼成 `docs/README.md`，可造成假通过或假失败。**C 给出的根链接例子本身展示的是假通过**，不是必然报错。上一轮已说明：普通 Markdown 链接的 `/` 是否承诺仓库根语义没有明文定义；GUIDE:29 的根路径规则针对 pin，不能移用于所有链接。这里确认越界/错文件事实，不追认 MAJOR 或任意宿主权限突破 | `src/check.mjs:70–79,112–121,294–297,495–504`；pin 对照 `src/pins.mjs:46–54` |
| D-2：history 正则绕过/误报 | **CONFIRMED** | 围栏内 `fn[0](123)` 改成 `fn[0](999_TAMPERED)` 后正常 check 退出 0；只改引用定义 URL 退出 1。与上一轮 B2 根因一致，不重复其修复建议；围栏代码例是新增的具体见证 | `src/check.mjs:557–577` |
| D-3：默认 `D` 前缀误认技术词 | **PARTIAL** | 散文、行内代码、URL 中的 D1/D3/D100 都可触发；围栏对照不触发。**默认 init 的 `codeExtensions=[]`，源码中的 D1 不会仅因初始化就被扫描**；配上 `.mjs` 后才触发。C 的“只要文档或代码里提到就立即报错”遗漏了这个前提。“高频/极易/MAJOR”仍无真实项目频率证据 | `templates/docaxioms.json:4,6`；`src/check.mjs:108,311–316` |
| D-4：缺文件中断、`openUntil` 未转义 | **PARTIAL** | 三个缺失目标均使 API reject，CLI 普通/`--json`/`--report` 都退出 1，JSON stdout 为空；openUntil 的 `[` 触发正则错误，含括号的普通标题切分错误。**CLI 顶层 catch 捕获了这些异常，只打印 message；不是未捕获异常栈崩溃。** 准确问题是无法形成逐项诊断结果、整次检查提前中止。GUIDE 的“键可省略”不等于“显式配置缺文件也必须通过” | `src/check.mjs:149,328,438,666–668`；`bin/docaxioms.mjs:31,183–185`；`core/GUIDE.md:49,62` |
| D-5：忽略文件本地存在则通过 | **PARTIAL** | 修正 pin hash 后，links/paths/pins 本地全通过；真实干净 clone 不含生成物时三项都失败；clone 中先生成文件后三项又通过。**C 原命令的 `c304825107f8` 不匹配所写源行，原样 pin 就失败，正确值为 `2bf28849cade`。** 环境差异不自动违反 A1/A6：当前谓词检查磁盘存在，并未承诺目标必须 tracked。CI 若先构建该文件也会通过；“必然 CI 红灯”“确定是假阴性”过强 | `src/check.mjs:77,96–102,295,389`；`src/pins.mjs:131–136` |
| D-6：独立 `<a id>`、非 a 标签 | **PARTIAL** | 空锚点独占一行且后隔空行：links 通过，Landing 失败，因为 passage 仅为锚标签。**锚点独占一行但正文紧接下一行、不隔空行也可通过**；“只有同一行才通过”错误。span/h3 的 id 确实不识别；这部分是当前支持范围缺失，源码/指南没有承诺任意 HTML 标签都支持 | `src/markdown.mjs:63–80,148–153`；`src/check.mjs:502–504` |
| D-7：research 文件名子串 | **CONFIRMED** | 普通文本提文件名时误通过；开放区引用、定义位于关闭标题后的 reference link，以及 `%20` 链接均出现“links 通过、research 失败”。与上一轮 B5 同根因，仅补 C 的两种新反例，不重复讨论 | `src/check.mjs:438–444`；真实链接解析在 `src/markdown.mjs:21–25,49–60` |
| D-8：删除 AD-5 就违反 GUIDE | **PARTIAL：删除与缺比较 CONFIRMED；C 的违约归因 REFUTED** | `86dffc1` 确实删行，当前检查没有 decisions/log 的旧内容比较；但提交已明确解释未发布的旧名无需迁移，不能称“静默”。GUIDE:14 的触发条件是 **决策被推翻**，而不是 C 添加的“或不再落地”；这里没有推翻更名，也没有改回旧名。按明确规则与提交意图，应作为有说明的未发布更名记录清理处理，**不把它列为已证实源码缺陷，也不要求为编号连续性恢复 AD-5**。这不推出普遍允许删除旧决策；更强的记录保留政策须另行明确 | `core/GUIDE.md:14`；`core/AXIOMS.lock.md:28–29` 的不删/不重编号明文针对 axiom/method；`docs/decisions.md:7–12`；提交 `86dffc1` |
| D-9：作用域与三处词法边界 | **PARTIAL（四个子现象成立）** | 空集合/全已匹配 pin 下，错误 `--file`/`--pin` 返回 0 且说全部最新；但有陈旧 pin 时同样返回 0，**仍打印 stale 和复核提示，并非静默**。带 `#L10` 的路径漏检、`npm run --silent test` 误报、`cd … && npm run missing` 跳过均成立。“三处词法”分别为路径 fragment、选项、复合命令，另加 pin 作用域，共四个子问题。`manage.mjs:45` 实际生成的是 `cd … && npx --no-install docaxioms check`，不是报告所举 npm-run 字面命令 | `src/pins.mjs:243–259,294–305`；`bin/docaxioms.mjs:89–125`；`src/check.mjs:387–389,417–423`；`src/manage.mjs:39–45` |

### D-1 至 D-9 的命令、退出码与关键输出

每组下方先给可重跑的驱动命令；表中列真实 CLI 子命令及关键输出。完整未删减输出、绝对路径及参数都在对应链接中，未将 API 的返回对象当作进程退出码。

#### D-1：仓外目标与根路径正反见证

```sh
"$NODE" "$LAB/reproduce.mjs" D1
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D1-link-outside](codex3-lab/logs/D1-link-outside.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>pins: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D1-landing-outside](codex3-lab/logs/D1-landing-outside.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>pins: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D1-pin-boundary-control](codex3-lab/logs/D1-pin-boundary-control.json)；`check --json` | **1** | links: {"problems": [], "notes": []}<br>pins: {"problems": ["README.md:2: pin path \"../D1-escape-MUOVVq-outside.md\" escapes the repository root"], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D1-root-false-pass](codex3-lab/logs/D1-root-false-pass.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>pins: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D1-root-false-fail](codex3-lab/logs/D1-root-false-fail.json)；`check --json` | **1** | links: {"problems": ["docs/README.md: /README.md#documents names a heading that is not there"], "notes": []}<br>pins: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |

[D1-API.json](codex3-lab/logs/D1-API.json) 另保存真实 `p.links()` 结果 `path: "../D1-escape-…-outside.md"`，以及 `p.passage()` 读回的 `# Outside / Chosen outside this repository (AD-1).`。仓外见证文件也只创建在本 lab；未依赖或读取 `/etc/hosts`。

#### D-2：重合根因的两条实跑

```sh
"$NODE" "$LAB/reproduce.mjs" D2
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D2-code-tamper](codex3-lab/logs/D2-code-tamper.json)；`check --json` | **0** | history: {"problems": [], "notes": []} |
| [D2-reference-update](codex3-lab/logs/D2-reference-update.json)；`check --json` | **1** | history: {"problems": ["docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end"], "notes": []} |

#### D-3：四种文本与源码扩展前提

```sh
"$NODE" "$LAB/reproduce.mjs" D3
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D3-prose](codex3-lab/logs/D3-prose.json)；`check --json` | **1** | decision IDs: {"problems": ["README.md: D1", "README.md: D3"], "notes": []} |
| [D3-inline](codex3-lab/logs/D3-inline.json)；`check --json` | **1** | decision IDs: {"problems": ["README.md: D1", "README.md: D3"], "notes": []} |
| [D3-URL](codex3-lab/logs/D3-URL.json)；`check --json` | **1** | decision IDs: {"problems": ["README.md: D100"], "notes": []} |
| [D3-fence-control](codex3-lab/logs/D3-fence-control.json)；`check --json` | **0** | decision IDs: {"problems": [], "notes": []} |
| [D3-default-code-not-scanned](codex3-lab/logs/D3-default-code-not-scanned.json)；`check --json` | **0** | decision IDs: {"problems": [], "notes": []} |
| [D3-configured-code](codex3-lab/logs/D3-configured-code.json)；`check --json` | **1** | decision IDs: {"problems": ["src/app.mjs: D1"], "notes": []} |

#### D-4：三个缺文件入口的全部模式

```sh
"$NODE" "$LAB/reproduce.mjs" D4
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D4-decisions-text](codex3-lab/logs/D4-decisions-text.json)；`check` | **1** | ENOENT: no such file or directory, open '<cases>/D4-decisions-VbWEZa/docs/decisions.md' |
| [D4-decisions-json](codex3-lab/logs/D4-decisions-json.json)；`check --json` | **1** | ENOENT: no such file or directory, open '<cases>/D4-decisions-VbWEZa/docs/decisions.md' |
| [D4-decisions-report](codex3-lab/logs/D4-decisions-report.json)；`check --report` | **1** | ENOENT: no such file or directory, open '<cases>/D4-decisions-VbWEZa/docs/decisions.md' |
| [D4-sections-text](codex3-lab/logs/D4-sections-text.json)；`check` | **1** | ENOENT: no such file or directory, open '<cases>/D4-sections-rHQms2/docs/spec.md' |
| [D4-sections-json](codex3-lab/logs/D4-sections-json.json)；`check --json` | **1** | ENOENT: no such file or directory, open '<cases>/D4-sections-rHQms2/docs/spec.md' |
| [D4-sections-report](codex3-lab/logs/D4-sections-report.json)；`check --report` | **1** | ENOENT: no such file or directory, open '<cases>/D4-sections-rHQms2/docs/spec.md' |
| [D4-research-text](codex3-lab/logs/D4-research-text.json)；`check` | **1** | ENOENT: no such file or directory, open '<cases>/D4-research-2RHQBE/docs/plan.md' |
| [D4-research-json](codex3-lab/logs/D4-research-json.json)；`check --json` | **1** | ENOENT: no such file or directory, open '<cases>/D4-research-2RHQBE/docs/plan.md' |
| [D4-research-report](codex3-lab/logs/D4-research-report.json)；`check --report` | **1** | ENOENT: no such file or directory, open '<cases>/D4-research-2RHQBE/docs/plan.md' |

#### D-4：标题正则与省略配置对照

```sh
"$NODE" "$LAB/reproduce.mjs" D4
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D4-no-config-control](codex3-lab/logs/D4-no-config-control.json)；`check --json` | **0** | research: {"problems": [], "notes": []} |
| [D4-invalid-regex](codex3-lab/logs/D4-invalid-regex.json)；`check --json` | **1** | Invalid regular expression: /^[/m: Unterminated character class |
| [D4-heading-literal](codex3-lab/logs/D4-heading-literal.json)；`check --json` | **0** | research: {"problems": [], "notes": []} |
| [D4-heading-escaped-control](codex3-lab/logs/D4-heading-escaped-control.json)；`check --json` | **1** | research: {"problems": ["docs/research/note.md: no open item links to it"], "notes": []} |

`D4-heading-literal` 的计划只有关闭区提到 note.md：标题为 `## Done (archive)`，同值 openUntil 未匹配到字面括号而错误通过；把 profile 值改为 `## Done \(archive\)` 后才正确切分并报 `no open item links to it`。API 三个入口的 rejection 信息见 [decisions](codex3-lab/logs/D4-API-decisions.json)、[sections](codex3-lab/logs/D4-API-sections.json)、[research](codex3-lab/logs/D4-API-research.json)，三者 `code=ENOENT`。

#### D-5：原 hash、修正 hash、真实 clone 与构建对照

```sh
"$NODE" "$LAB/reproduce.mjs" D5
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D5-report-hardcoded-hash](codex3-lab/logs/D5-report-hardcoded-hash.json)；`check --json` | **1** | links: {"problems": [], "notes": []}<br>paths: {"problems": [], "notes": []}<br>pins: {"problems": ["README.md:3: build/gen.js changed (pinned @c304825107f8, now @2bf28849cade)"], "notes": []} |
| [D5-local](codex3-lab/logs/D5-local.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>paths: {"problems": [], "notes": []}<br>pins: {"problems": [], "notes": []} |
| [D5-clean](codex3-lab/logs/D5-clean.json)；`check --json` | **1** | links: {"problems": ["README.md: build/gen.js leads nowhere"], "notes": []}<br>paths: {"problems": ["README.md: `build/gen.js`"], "notes": []}<br>pins: {"problems": ["README.md:3: pin target build/gen.js does not exist"], "notes": []} |
| [D5-build-before-check-control](codex3-lab/logs/D5-build-before-check-control.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>paths: {"problems": [], "notes": []}<br>pins: {"problems": [], "notes": []} |

[D5-API.json](codex3-lab/logs/D5-API.json)：`git check-ignore build/gen.js` 确认被忽略；`p.all` 只有 `.gitignore / README.md / docaxioms.json`，但 `p.has("build/gen.js")=true`。真实 clone 命令与退出 0 见 [D5-clone.json](codex3-lab/logs/D5-clone.json)。这证明了扫描集合与引用目标存在性是两个边界，不直接证明必须将二者统一。

#### D-6：独立锚行的空行差别及其他标签

```sh
"$NODE" "$LAB/reproduce.mjs" D6
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D6-blank-separated](codex3-lab/logs/D6-blank-separated.json)；`check --json` | **1** | links: {"problems": [], "notes": []}<br>landing: {"problems": ["AD-1: README.md#arch does not name AD-1"], "notes": []} |
| [D6-own-line-no-blank](codex3-lab/logs/D6-own-line-no-blank.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D6-same-line](codex3-lab/logs/D6-same-line.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []} |
| [D6-span](codex3-lab/logs/D6-span.json)；`check --json` | **1** | links: {"problems": ["decisions.md: README.md#arch names a heading that is not there"], "notes": []}<br>landing: {"problems": ["AD-1: README.md#arch names a heading that is not there"], "notes": []} |
| [D6-h3](codex3-lab/logs/D6-h3.json)；`check --json` | **1** | links: {"problems": ["decisions.md: README.md#arch names a heading that is not there"], "notes": []}<br>landing: {"problems": ["AD-1: README.md#arch names a heading that is not there"], "notes": []} |

对应 AST 和 passage 见 `logs/D6-AST-*.json`。隔空行时 passage 只有 `<a id="arch"></a>`；不隔空行时 passage 同时含下一行的 `Chosen layout (AD-1).`。所以“锚点不识别”与“锚点识别但没有关联正文”必须分开。

#### D-7：C 补充的链接语法

```sh
"$NODE" "$LAB/reproduce.mjs" D7
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D7-plain](codex3-lab/logs/D7-plain.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>research: {"problems": [], "notes": []} |
| [D7-reference](codex3-lab/logs/D7-reference.json)；`check --json` | **1** | links: {"problems": [], "notes": []}<br>research: {"problems": ["docs/research/note.md: no open item links to it"], "notes": []} |
| [D7-encoded](codex3-lab/logs/D7-encoded.json)；`check --json` | **1** | links: {"problems": [], "notes": []}<br>research: {"problems": ["docs/research/my note.md: no open item links to it"], "notes": []} |
| [D7-inline-control](codex3-lab/logs/D7-inline-control.json)；`check --json` | **0** | links: {"problems": [], "notes": []}<br>research: {"problems": [], "notes": []} |

#### D-8：真实提交与缺失比较边界

```sh
"$NODE" "$LAB/reproduce.mjs" D8
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D8-commit](codex3-lab/logs/D8-commit.json)；`git show --format=fuller 86dffc1 -- docs/decisions.md core/GUIDE.md` | **0** | 删掉 AD-5 整行；提交说明：the earlier name was never published, so there is nobody to migrate. |
| [D8-delete-row-and-change-log](codex3-lab/logs/D8-delete-row-and-change-log.json)；`check --json` | **0** | decision IDs: {"problems": [], "notes": []}<br>landing: {"problems": [], "notes": []}<br>history: {"problems": [], "notes": []} |
| [D8-strict-control](codex3-lab/logs/D8-strict-control.json)；`check --strict-aids` | **0** | 16 项均 ok，无 note 或 aid finding |

`D8-delete-row-and-change-log` 只证明：有既存 Git 基线时，删掉不再被引用的 decision 行、改写 log 记录，当前内置检查也不会发现；这是一项真实的能力缺口。它不证明真实 `86dffc1` 是未经授权的删改。C §5.2 的因果叙述还有一处独立错误：**即使去掉 `--report`、启用全部 gate，缺失的旧行比较仍不会凭空出现**，所以不能说“AD-7 的观察窗口使删除绕过了本来存在的拦截”。

#### D-9：pin 作用域的空集与陈旧对照

```sh
"$NODE" "$LAB/reproduce.mjs" D9
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D9-empty-file-typo](codex3-lab/logs/D9-empty-file-typo.json)；`pin --write --file docs/typo.md` | **0** | all code pins are up to date |
| [D9-empty-pin-typo](codex3-lab/logs/D9-empty-pin-typo.json)；`pin --write --pin README.md:99` | **0** | all code pins are up to date |
| [D9-matching-up-to-date](codex3-lab/logs/D9-matching-up-to-date.json)；`pin --write --file README.md` | **0** | all code pins are up to date |
| [D9-stale-file-typo](codex3-lab/logs/D9-stale-file-typo.json)；`pin --write --file docs/typo.md` | **0** | stale README.md:2 src/a.mjs#L1 (@2bf28849cade -> @f7aaae68baf5)<br>review changed passages against code, then run `docaxioms pin --write --file <doc>` |
| [D9-stale-pin-typo](codex3-lab/logs/D9-stale-pin-typo.json)；`pin --write --pin README.md:99` | **0** | stale README.md:2 src/a.mjs#L1 (@2bf28849cade -> @f7aaae68baf5)<br>review changed passages against code, then run `docaxioms pin --write --file <doc>` |

#### D-9：三处词法边界及正反对照

```sh
"$NODE" "$LAB/reproduce.mjs" D9
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [D9-path-hash](codex3-lab/logs/D9-path-hash.json)；`check --json` | **0** | paths: {"problems": [], "notes": []}<br>commands: {"problems": [], "notes": []} |
| [D9-path-control](codex3-lab/logs/D9-path-control.json)；`check --json` | **1** | paths: {"problems": ["README.md: `src/deleted.mjs`"], "notes": []}<br>commands: {"problems": [], "notes": []} |
| [D9-option](codex3-lab/logs/D9-option.json)；`check --json` | **1** | paths: {"problems": [], "notes": []}<br>commands: {"problems": ["README.md:2: `npm run --silent` is not defined"], "notes": []} |
| [D9-simple-control](codex3-lab/logs/D9-simple-control.json)；`check --json` | **0** | paths: {"problems": [], "notes": []}<br>commands: {"problems": [], "notes": []} |
| [D9-compound](codex3-lab/logs/D9-compound.json)；`check --json` | **0** | paths: {"problems": [], "notes": []}<br>commands: {"problems": [], "notes": []} |
| [D9-missing-control](codex3-lab/logs/D9-missing-control.json)；`check --json` | **1** | paths: {"problems": [], "notes": []}<br>commands: {"problems": ["README.md:2: `npm run missing` is not defined"], "notes": []} |
| [D9-real-npm-option](codex3-lab/logs/D9-real-npm-option.json)；`npm run --silent test` | **0** |  |

上述错误 scope 均未改写 pin；正确且已最新的 scope 返回 0 是正常幂等操作，不应被单独算作缺陷。`npm run --silent test` 已在同一 fixture 的真实 npm 中执行成功（退出 0）。[D9-generated-command.json](codex3-lab/logs/D9-generated-command.json) 保存实际生成的 `cd ./cases/sub && npx --no-install docaxioms check`。

## 3. §5.2 / §5.3 及其他章节的源码事实

前轮已确认、C 无冲突的 dependency 名称、常量、正常 pin 流程、init/update 保留文件等，不另行展开。以下覆盖 C 的新数字、新措辞与需要纠正的边界。

| C 位置 / 断言 | 判定 | 当前证据与修正 |
|---|---|---|
| §5.2.1：“不到 1,400 行” | **PARTIAL（需指定计数面）** | `wc -l src/*.mjs bin/*.mjs`：src 六文件 **1,376 行**，CLI 另 **186 行**，合计 **1,562 行**；若仅指 src 成立，若指整个可执行实现则不成立。详 [META.json](codex3-lab/logs/META.json) |
| §5.2.1 / §3.2 D9 / 候选7：Node >=22、七个直接依赖、无原生扩展依赖 | **CONFIRMED（本锁文件/实现）** | package engines 为 `>=22.0.0`；7 个直接依赖；lock 有 **71** 个安装依赖包条目，不是整个依赖图只有 7 包；无 hasInstallScript。清单见 [META.json](codex3-lab/logs/META.json)、[static-audit.json](codex3-lab/logs/static-audit.json)。这不证明未来版本永远无 native 依赖或能无成本打包 |
| 候选7：目标业务仓库必须新增 package.json / node_modules | **REFUTED（硬性要求）** | 与前轮 A15 已核验结论矛盾。本轮 D1/D4/D6/D7 等 fixture 也没有 package.json/node_modules，仍可用外部安装的 CLI 检查；运行引擎要有 Node/依赖，不要求每个受检仓库把自己改造成 npm 项目 |
| §5.2.2：“每次格式化”都会失配 | **PARTIAL** | 只涉及实际覆盖的规范化文本/范围；CRLF→LF 不变、范围外不影响行号的编辑可不失配，不能量化为所有格式化必失败。`META-pin-CRLF.json` 实测全文件 CRLF/LF hash 相同。其余边界与前轮一致，不重复 |
| §5.2.3：跳过所有带 scheme 的 URL、纯离线 | **CONFIRMED（内置链接检查）** | `src/check.mjs:114` 跳过 `http:`、`https:`、`file:`、`mailto:` 等 scheme；源码无内置 HTTP 外链巡检。普通相对目标仍有 D1 边界。不能把这变成包括用户 projectChecks 的全系统无网络保证，也没有测出任意仓库都“毫秒级”的性能保证 |
| §5.2.4：集中表/卡/日志，增加并发冲突风险 | **结构 CONFIRMED，频率 PARTIAL** | 模板是这些单文件，前轮已有真实 merge 冲突见证；源码不能给出相对冲突率。C §8 将频率列为待测比绝对断言更准确 |
| §5.2.5：“仅开启 6 项机械检查阻断合并” | **PARTIAL（六类的口径可成立）** | self.test:11–17 是 **5 项完整检查**，:28–32 加 **pin 的 missing/outside-root 子集**，并非完整第六项 pin gate。另所有单测与执行错误也会使 npm check 失败。下方实跑确认 changed pin 仅报告、missing/outside pin 阻断；不能据 workflow 文件证明托管平台已启用 required status/分支保护 |
| §5.2.5：AD-7 窗口使 AD-5 删除未被拦 | **REFUTED（因果归因）** | D8 严格检查也退出 0，原因是旧行比较根本没有实现，而非已有检查降为 report；真实更名清理也不是已证实违规 |
| §5.3.1–2：check/garden JSON，pin 无 JSON，无 SARIF/JUnit/短规则码 | **CONFIRMED** | `META-baseline-check`、`META-garden-json` 退出 0；pin --json、check --format sarif/junit 均退出 1。结果对象键是 **name, axioms, level, problems, notes**，非字符串数组。与前轮一致；C 已纠正前两报告中的 JSON 误述 |
| §5.3.3 / 候选4：零匹配规则静默 ok，无受检数量 | **CONFIRMED（所列有效配置）** | 同时配置空匹配 budgets、sections.files 和 codeToDocs.code，具有有效 Git base 且有实际代码变化：三项 problems/notes 均为空、文本全 ok、JSON 无 checked/id。改成真实匹配后出现预算错误、章节错误和 aid finding。注意：sections 的 document 仍须存在，否则先发生 D4；codeToDocs 缺 base 也会产生 note，不能泛称任意零匹配总无提示 |
| §5.3.4：无官方容器/Action 包装、单二进制构建 | **CONFIRMED（本基线树）** | 32 文件中仅 `.github/workflows/check.yml`，没有 action.yml/action.yaml、Dockerfile、编译/发布流水线。workflow 自检存在，不等于可供消费者 uses 的 Action。未查询外部 Release 资产 |
| §5.3.5 / 候选8：无 baseline/ratchet；只有 gate/report 两档 | **缺 baseline CONFIRMED，“只有两档” PARTIAL** | `--baseline`、`--write-baseline` 均 Unknown option；但已有可选规则、ignore/豁免、aid 与 strict-aids，可逐项收窄接入面。它们不等于 findings 指纹棘轮，亦不宜被说成全无渐进手段 |
| §5.3.6 / 候选5：decisions.file/log 无 Git 旧内容保护 | **CONFIRMED（能力缺口）** | D8 的删行及改 log 见证，在正常 gate 和 strict 下都退出 0；现有 Git 防改写只选 history.dir 的 M/D 文件，还排除了该目录 README。不能用“严密”抹掉 D2 与上一轮已列边界 |
| §5.3.7：没有 MCP / SKILL 分发模板 | **CONFIRMED（本基线树）** | mcp 子命令返回 usage、退出 1；32 文件/9 个模板无 MCP Server 或 SKILL.md。仅查本仓，不追认外部不存在非官方包装 |
| §2.1 / §3.2 / §4.5：可达性称 BFS | **REFUTED（算法名称）** | 与前轮 A22 结论矛盾：`src/check.mjs:463–471` 使用 `queue.pop()`，是后进先出的 DFS 式遍历；可达集合目标仍成立。无须为名称改写算法 |
| §3.2 D1：16 检查＝14 gate+2 aid、可追加 projectChecks | **CONFIRMED（正常模式）** | `META.json` 实际结果计数 16/14/2；`src/check.mjs:670–674` 加载自定义模块，默认 level=gate；--report 对正常 finding 退出 0。不是所有异常也被 report 吞掉 |
| §3.2 D2 / §4.1：写 pin 都打印 12 行预览、强制复核 | **PARTIAL** | 与前轮 A-pin-preview 的整文件例外矛盾：`src/pins.mjs:65–74` 对无 startLine 返回 null；仅范围 pin 最多 12 行。CLI 能要求显式 scope，不能证明人/代理真的复核；--all 也是合法 scope |
| §3.2 D5 / §4.5 / §8 H5：入口总计131行，由预算封顶 | **计数 CONFIRMED，整体保证 PARTIAL** | `30+69+11+15+6=131` 为列举五个模板/规范文件的行数；card 限45/4000、AGENTS 限100/6000为单文件限值。没有“总链131行” gate，按任务打开更多文件也不受此数约束；研究完成后的归档仍需维护者动作 |
| §3.2 D6：三步冷启动、init 后立即对存量文档做预算/可达性等检查 | **流程 PARTIAL，须分清命令与默认作用域** | 三步中的第3步 check 才检查；`init` 本身只复制/写配置，CLI还打印 Nothing runs the check for you yet（manage:85–103，bin:170–174）。默认 budgets 仅匹配 AGENTS.md，reachable 仅为 `^docs/`，不能读成所有存量README/docs都被预算和入口可达性覆盖；这是静态核对，前轮 M-init-link 已有相同命令边界见证 |
| §4.2：严格分离 K1/K2/K3/K4 | **PARTIAL（指定辅助面成立）** | descriptionDocs:238–255 确实服务 commands/evolutionary/garden；不能扩大到所有检查，paths:383 与 pins:117 仍用 currentDocs。前轮 B1 已有运行见证，本轮不重做 |
| §4.5：core 不含任何工具/语言专有名词 | **PARTIAL / 字面“任何工具名”不成立** | 三个 md 共127行，加 LICENSE 共4个纯文本文件属实；GUIDE 实际含 docaxioms 自身 CLI 与 docaxioms.json 名称。现有“便携/无下游污染”约定及有限词表测试，不等于对任意专名的语义识别。前轮 A26 已说明测试覆盖边界 |
| §4.6：缺比较 base 显式 note；拒绝静默失败开放 | **特定 fallback CONFIRMED，普遍断言 PARTIAL** | resolveBase:48–54/changedFiles:58–66 明确 note；不能盖过本次零匹配 ok、D9 空 scope，以及其他已确认的漏判；note 默认不会失败，本来就是 GUIDE:31 的设计 |
| §7.1：采用任意 AST 指纹都会违反 AD-4 | **PARTIAL（泛化过度）** | AD-4 写的是轻量纯 JS、无 native AST grammars；不能由它推出“任何可选纯 JS 语法分析都已被禁止”。若方案引入原生语法器或牺牲语言覆盖需另评，不把所有 AST 实现一概判违规 |
| §7.6：pin 倒序按 start/end “字节偏移”替换 | **操作 CONFIRMED，单位 REFUTED** | `pins.mjs:314–319` 确实倒序局部替换，使用 JS string.slice，即 UTF-16 code-unit offset。`😀 [label](dest.md "title")` 的 link start.offset=3，UTF-8 前缀字节长=5；不可把 offset 直接当 UTF-8 byte offset |
| §8 的维护摩擦率、召回率、上下文收益、并发频率、代理绕过频率 | **未验证假设，不是源码结论** | C 已将这些列为待测，做法合适；本轮 fixture 和102项测试不提供真实用户频率/成本或模型对照数据 |

### 3.1 零匹配与输出接口的运行证据

#### 有效配置匹配零对象与非零对照

```sh
"$NODE" "$LAB/reproduce.mjs" META
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [META-zero-json](codex3-lab/logs/META-zero-json.json)；`check --json` | **0** | cited sections exist: {"problems": [], "notes": []}<br>bounded documents stay within budget: {"problems": [], "notes": []}<br>code changes with mapped documents untouched: {"problems": [], "notes": []} |
| [META-zero-text](codex3-lab/logs/META-zero-text.json)；`check` | **0** | ok   core files are the pinned version (A4, A6)<br>ok   links and anchors resolve (A2, A4)<br>ok   decision numbers are unique and every one cited exists (A4)<br>ok   cited sections exist (A4)<br>ok   documents named in code exist (A2, A7)<br>ok   paths named in current documents exist (A2, A7)<br>ok   code pins match the current source (A2, A6, A7)<br>ok   commands named in current documents exist (A2, A7)<br>ok   open research is linked from an open item; history carries its banner (A3, A5)<br>ok   every current document is reachable from an entry point (A3)<br>ok   a decision names where it landed, and that passage names it (A0, A4)<br>ok   the stage card stays a card (A3)<br>ok   bounded documents stay within budget (A3, M4)<br>ok   a history file changes only in link targets, or grows by a dated erratum (A5)<br>ok   code changes with mapped documents untouched (A2, A6, M2)<br>ok   current descriptions use evolutionary phrasing (A3, M1, M2) |
| [META-nonzero-control](codex3-lab/logs/META-nonzero-control.json)；`check --json` | **1** | cited sections exist: {"problems": ["src/app.mjs: section 99"], "notes": []}<br>bounded documents stay within budget: {"problems": ["README.md: 4 lines, at most 1"], "notes": []}<br>code changes with mapped documents untouched: {"problems": ["README.md: review after code change in src/app.mjs"], "notes": []} |

零匹配组的关键配置是 `budgets.files="nonexistent/*.md"`、`sections.files="^missing/"`、`codeToDocs.code="missing/**"`。章节目标 spec.md 存在；Git 比较分支 main 存在；src/app.mjs 已从 `section 1` 改成 `section 99`。因此没有用“没发生变化/缺基线”来冒充空匹配实验。完整配置和写入顺序见驱动 `META()`。

#### CLI 输出能力/缺失参数

```sh
"$NODE" "$LAB/reproduce.mjs" META
```

驱动退出 **0**。

| 实验 / 子命令 | 退出码 | 关键输出 |
|---|---|---|
| [META-baseline-check](codex3-lab/logs/META-baseline-check.json)；`check --json` | **0** | 16 项均 problems=[]、notes=[] |
| [META-pin-json](codex3-lab/logs/META-pin-json.json)；`pin --json` | **1** | Unknown option '--json' |
| [META-sarif](codex3-lab/logs/META-sarif.json)；`check --format sarif` | **1** | Unknown option '--format' |
| [META-junit](codex3-lab/logs/META-junit.json)；`check --format junit` | **1** | Unknown option '--format' |
| [META-baseline](codex3-lab/logs/META-baseline.json)；`check --baseline baseline.json` | **1** | Unknown option '--baseline' |
| [META-write-baseline](codex3-lab/logs/META-write-baseline.json)；`check --write-baseline` | **1** | Unknown option '--write-baseline' |
| [META-mcp](codex3-lab/logs/META-mcp.json)；`mcp` | **1** | usage:<br>  docaxioms check  [--root <dir>] [--report] [--strict-aids] [--json]<br>  docaxioms pin    [--root <dir>] [--relocate] [--write (--file <doc> \| --pin <doc:line> \| --all)]<br>  docaxioms garden [--root <dir>] [--json]<br>  docaxioms init   <project><br>  docaxioms update <project> [--accept-axioms] |

`garden --json` 命令的退出 **0** 与完整对象见 [META-garden-json.json](codex3-lab/logs/META-garden-json.json)。受检集合计数的确没有；现有 CLI 打印的 `problems.length` 是 finding 数，不应混同为已检查对象数。

### 3.2 “6 项阻断”的真实边界

运行：`python3 "$LAB/self-gates.py"`，驱动退出 **0**。仅在新 lab 的五个基线副本注入输入，然后分别运行普通 `check --json` 与 `node --test test/self.test.mjs`。完整参数及输出见 [self-gates.json](codex3-lab/logs/self-gates.json)。

| 注入 | 普通 check 退出码 | 本仓 self test 退出码 | 观察 |
|---|---|---|---|
| pin 指向存在源码，但 hash 错 | 1 | **0** | changed 内容未列入该 self gate |
| pin 指向不存在源码 | 1 | **1** | missing 子集阻断 |
| pin 用 ../ 越界 | 1 | **1** | outside-root 子集阻断 |
| README 超预算 | 1 | **0** | budget 仅 report |
| decision 状态全改成 INVALID | 1 | **0** | status finding 仅 report |

这只验证当前命令/测试的阻断集合；没有触发远程 CI，也没有把 GitHub 分支保护状态当作已验证事实。整次执行出错仍会失败，AD-7 没有把 D4 这种计算异常变成通过。

## 4. §6 八个候选的事实基础与未获证实的承诺

以下不是批准实施方案；只分清现有事实与未来提案。所有“35/40/50/55/70/80/100/150–200 行”“8个用例够了”“100%精准/零误报/零新增风险”等均未经过补丁、跨平台产物或真实项目验收，本轮不将它们认定为事实。

| 候选 | 源码事实裁决 | 不同意或必须限定之处 |
|---|---|---|
| 1：统一路径、忽略集、ENOENT、research | D1/D4/D5/D7 的实现与运行现象见上 | **不同意把所有现象归成一个纯路径解析根因**：异常诊断、正则标题、research 链接语义各有独立边界。`p.all` 来自 cached **和 untracked**，不是“全部受版本控制追踪”；不在 p.all 还可能因 profile.ignore/符号链接排除，不等于 `.gitignore`。强制所有目标属于 allSet 会收紧当前磁盘存在性契约，合法构建产物可能被拒；不能承诺零假阳性。GUIDE 的前导 `/` 普通链接语义也应先明确 |
| 2：history AST、HTML passage、恢复 AD-5 | 前两项有实际缺陷/限制，D2 重合；D6 有新价值 | **不支持以缺陷修复名义恢复 AD-5 或强制连续编号**，D8 归因不成立。现有 mdast node 只有整个 link/definition 的 position 与解码后 url，未直接提供 URL 源码子区间；AST 还需保留原始 URL/title/转义边界，不能把整个节点位置当 URL。“40行、彻底100%保护”未经证明 |
| 3：默认前缀、pin 空 scope、词法 | 默认 D、未校验 scope、三个词法现象均成立 | `templates/docs/decisions.md` 只有6行标题/说明/表头，**没有 D 前缀实例可替换**；默认值在 JSON。update 保留非core设置实跑成立，但“仅影响未来 init”只适用于默认前缀，不适用于同时修改的现有用户解析/CLI 行为。全局跳过 inlineCode 又可能漏掉真实决策引用，应以命名边界而非大范围豁免解决 |
| 4：稳定规则码与零匹配 note/checked | 无 id/checked、零匹配 ok 均已确认；notes 机制已有 | 值得先做最小可观测性改进，不能说“有了 id/checked **才能**统计10次变更/3条发现”：长名称和人工记录也能统计，id是稳定集成便利。sections.files 是正则；budgets/codeToDocs 是 glob，不应混成一类语法。是否所有显式空集合都应提示，要区分没有对象与配置拼错 |
| 5：decision/log 旧记录保护 aid | 当前没有该比较已确认 | 能作为独立新能力调研；不以 AD5 删除作为已证实滥用例。GUIDE:14 没写“所有已合并行前三列绝不再改”的完整新谓词；合并基线、勘误、归档/撤回和授权迁移需要明确。先 aid 合乎现有精度要求；55行与无误报未验证 |
| 6：pin JSON / SARIF | CLI 缺少这些输出；syncPins 已返回结构化 changes | changes 是**异构、非完整清单**：正常 ok pin 被跳过；moved 有 fromRange/toRange/hash，added/updated 有 range/before/after，错误有 detail，整文件 preview 可为 null，并非每条都有列出的所有字段。支持 JSON 的改动边界小于为所有 findings 增加精确位置/SARIF。所谓“字节区间”实际为 UTF-16，见 META-url-positions |
| 7：独立二进制与 Action | 本树没这些产物；7直接/71传递依赖事实成立 | “天然适合”“80行”“执行完全相同16谓词”是未验证提案。既有资源读取依赖 import.meta.url/真实目录，projectChecks 动态导入属于现有 API；禁用它会改变能力。不能把引擎需要安装Node，写成受检仓库必须维护自己的 package.json |
| 8：baseline/分片/外围集成 | 当前无 findings baseline、单 decisions.file、无 MCP/SKILL 模板 | 是三个独立扩展，不能由缺功能推出已证明收益。仅检查 baseline **行数只减不增**不能保证成员只减不增：删掉一个旧 fingerprint 后加一个新 fingerprint，数量不变仍能豁免新问题。已有 ignore/aid/report 不等于专用 ratchet，但也不是完全没有渐进接入手段 |

补充证据：

- `"$NODE" "$LAB/reproduce.mjs" META` 退出 **0**；[META-update-keeps-settings.json](codex3-lab/logs/META-update-keeps-settings.json) 为 `id="CUSTOM-" / extra="kept"`，证明 update 保留非core配置；这与其仍会重写 `profile.core` 是两回事。
- [META-pin-changes.json](codex3-lab/logs/META-pin-changes.json) 保存实际 added 记录：`file,line,target,range,status,before,after,preview,written`；源码其他分支字段见 `src/pins.mjs:261–305`。
- [META-url-positions.json](codex3-lab/logs/META-url-positions.json) 保存整个 link 节点、位置和 URL；没有单独 urlStart/urlEnd，emoji 前缀下 offset 与 UTF-8 字节数不等。
- 现有 check 对自定义模块确实是 `import(pathToFileURL(p.at(profile.projectChecks)).href)`（`src/check.mjs:670–674`）；本轮没有安装 Bun、构建候选二进制或证明这些提案的兼容性。

## 5. §1 清单、基线与行号引用抽查

| C 的说法 / 引用 | 结果 | 命令、退出码与依据 |
|---|---|---|
| 基线完整32文件列表 | **CONFIRMED：逐项、顺序一致** | `git -C "$LAB/repo" ls-tree -r --name-only 8336bed`，退出0；与 C §1.2 文本块自动比较 `inventoryMatches=true` |
| 旧0d8e1bb为31文件，只差 self.test 的名字 | **文件集合 CONFIRMED；不要解读为只有一项内容变化** | `git diff --name-status 0d8e1bb 8336bed` 退出0：4个 M（AGENTS、README、decisions、package.json）+1个 A（self.test） |
| “当前main=0d8e1bb、落后3提交” | **历史陈述，当前已过时** | 当前main=5674b46，树与8336bed一致；`git log 0d8e1bb..8336bed` 仍准确列出86dffc1/7f4a4ff/8336bed三提交。不据本次状态否定其11月24日观察 |
| 本地 file:///…/agentic-docs 链接 | **按旧仓名映射后均可定位** | 依据用户说明映射到本仓或实验副本，不以旧路径不存在判报告源码引用失效 |
| D1 的check:77、120、295–297、498–504 | **定位正确** | `nl -ba "$LAB/repo/src/check.mjs"`：分别为 existsSync、join/normalize、存在/anchor检查、Landing解析 |
| D4 的check:149、328、438，GUIDE:49 | **定位正确；语义结论部分扩大** | 分别直接加载三个目标、构造未转义正则、键可省略原文；“未捕获”应再读 bin:183–185，C漏了这个边界 |
| D6 的markdown:66–80、D8的GUIDE:14 / check:489 | **定位正确，推论须修正** | 前者记录 enclosing block；GUIDE条件为overturned；check:489接受withdrawn，但“支持withdrawn”不能证明每次删除都是非法撤回 |
| D9 的pins:244–252、check:387–388、417–423、manage:45 | **定位正确** | 正好对应作用域、占位符跳过、首词命令、cd包装；manage字面输出为npx，非npm run |
| 全文本地带行号链接 | **行号均在基线文件范围内** | 自动检查所有这类引用，无out-of-range。仅代表引用可定位，不代表引文附近的论证全部正确；语义抽查如上 |

静态读数和每个引用的前几行摘录见 [static-audit.json](codex3-lab/logs/static-audit.json)。上述读取/比较的进程均退出0；`git diff --exit-code` 的基线等同与副本tracked无修改比较也退出0。

## 6. 完成清单与证据限度

1. **已完成**：按要求逐项实跑D1–D9，补齐D1仓外读取、D4三入口/三模式与正则、D5正确hash和干净clone、D6空行对照、D9全部子项；命令、退出码及原始输出均留档。
2. **已完成**：§5.2/5.3、八个候选的源码事实，以及其他章节中同类保证的边界；前轮无矛盾内容仅交叉引用，不重排为“新发现”。
3. **已完成**：完整102项现有测试、16项自检、10个self gate对照结果、32文件基线一致性与原仓93文件前后指纹。没有修改原仓、提交、推送或触发远程CI。
4. **范围外/未声称已做**：其他产品与论文真实性、注册表与Release资产、GitHub分支保护、Windows/Linux实机、真实用户误报/冲突/维护成本、候选补丁验收。已有测试全绿不否定本轮边界见证，fixture成功也不推广成所有环境的结论。

## 7. C 相对前两份报告的新增有价值点：收益/成本前5

这里按本轮可观察影响与当前实现边界做相对判断，不使用C未经实现验证的行数估算。D2/history、D3默认D前缀、D7文件名子串、稳定规则码/JSON/SARIF/MCP/二进制等已被前轮指出，不把它们重复算新增。

| 顺位 | C 的新增价值 | 收益 / 成本判断 | 不同意 C 的地方 |
|---|---|---|---|
| 1 | **D1：普通链接和Landing的 ../ 越界** | 已确认实际读取仓外Markdown，且与pin已有边界不一致；明确本地目标范围后可集中修解析边界，收益高、成本低至中 | 不把普通链接前导 `/` 的仓库根语义冒充已有明文契约；也不把可读仓外内容夸成任意系统权限突破。无需顺带把所有生成物都禁止 |
| 2 | **D4：三个配置入口中断整次检查 + openUntil字面标题误解析** | 有明确输入与错误结果；集中把显式缺失目标转为诊断，并按heading契约处理regex边界，收益高、成本低至中 | CLI有catch；不称未捕获栈崩溃。缺文件不宜静默空跳过；GUIDE“键可省略”不能用来正当化忽略显式配置错误 |
| 3 | **D9：错误pin作用域的反馈，以及行号路径/命令选项边界** | 错scope与合法无改动不可区分，能给调用者错误成功感；命中目标验证和`#L`识别改动相对小。复合shell检查需单独界定支持范围 | 非空陈旧集合会打印stale，不能称总静默；“所有pin已最新”本身不是缺陷。不建议为了复合命令而引入完整shell解释器 |
| 4 | **零匹配配置的可见性（候选4新增checked/dead-rule部分）** | 本轮在有效base、真实代码变化下确认3规则静默ok；增加适量匹配数量/note可降低误配置盲区，收益高、成本低至中 | 稳定规则码本身是前轮旧建议；不能把所有零对象都判错误，也不能声称有id后才可能度量。保留无配置/合法空集合的明晰语义 |
| 5 | **D6：空锚点块与下一正文块的关联** | 可准确区分“anchor存在”与“landing正文不含id”；常规写法见证清楚，局部修复成本低 | 反对“必须同一行”的描述；非a标签支持应作为单独范围决定，不用一句“任意HTML属性”承诺完整浏览器兼容 |

**D5 是新增且有用的可复现环境差异，但未进前5**：C示例先要修hash，且“引用ignored构建产物是否允许”需要明确定义工作树/交付物契约；直接强制allSet会带来兼容性成本。本轮对照已证明CI先生成文件也能通过，因此不赞同C的零误报封堵承诺。

**D8 不列入缺陷修复收益**：删除原因已有提交说明，GUIDE明文触发条件未获满足，编号也没有连续性约束。可以独立讨论更强的旧决策/log保留aid，不能先把这个有意清理定性为违规，再据此要求恢复AD-5。
