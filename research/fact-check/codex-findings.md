# docaxioms 两份调研报告的只读事实核验

核验日期：2026-11-25。基线：`8336bed3bbcfc7ff99a01fb9549142c7260a5aa9`，版本 `0.1.0-alpha.0`。

**结论：报告 B 七项推测均有运行时见证，但需要收窄若干条件与措辞；其中 1、2、3、5、6 判为 CONFIRMED，4、7 判为 PARTIAL。报告 A 的“当前包缺少 src/index.mjs”不成立。报告 B 的字节数与 gate/aid 计数准确，但反复声称 `check --json` 是字符串数组，明显错误。** 102 项现有测试全部通过，说明这批边界见证未被现有测试充分覆盖，不能据此否定见证。

## 1. 范围、方法与可复核材料

- 只核验两份报告关于 **docaxioms 源码、模板、配置、检查行为、文档约定**的事实。重复断言合并为一行，同时列出出现位置；关于其他产品、论文、市场数据的真假不在本次范围内。对未来方案中的兼容性、安全性、工作量等断言，也单独标明证据限度。
- 原仓库只读；其两个未跟踪的 `research/` 文件原样保留。全部安装、打包、Git fixture、修改和运行均在 `codex-lab/`。该副本的 32 个受跟踪文件与原仓库逐字节相同，原仓库含未跟踪文件共 34 个文件的 SHA-256 在实验前后相同。
- 实际运行：macOS / arm64，Node **22.23.5**；未运行 Windows 或 Linux 内核。本次 CRLF 结论来自真实 Git `core.autocrlf=true` 检出实验，不把它称为 Windows 实机验证。
- `npm ci` 成功；实验副本执行 `npm run check`，退出码 **0**，`tests 102 / pass 102 / fail 0 / skipped 0`。没有触发远程 CI、提交或推送。
- 报告 A 所用旧 ZIP 未提供，不能追认其当时的文件清单。以下“REFUTED（当前）”只反驳其被用于当前 HEAD 的结论。报告 B 所用 bundle/ZIP 也未提供，但相关文件、行号和字节数可以直接与当前 HEAD 对照。

判定：**CONFIRMED**＝所述核心现象已实跑；**REFUTED**＝当前证据与断言相反；**PARTIAL**＝只有部分结论成立、环境未覆盖，或把文档约定/可能性夸大为强制保证。静态核对与推断会明确标出，不冒充运行结论。

材料入口：

| 材料 | 路径 |
|---|---|
| 完整复现程序 | [codex-lab/reproduce.mjs](codex-lab/reproduce.mjs) |
| 42 个实验块的完整 stdout/stderr | [reproductions.txt](codex-lab/logs/reproductions.txt) |
| 70 次子进程调用的参数、退出码、原始输出 | [results.json](codex-lab/results.json) |
| 现有测试与自检 | [npm-check.txt](codex-lab/logs/npm-check.txt) |
| 本地 npm 包清单 | [npm-pack.json](codex-lab/logs/npm-pack.json) |
| 独立消费目录导入结果 | [consumer-import.txt](codex-lab/logs/consumer-import.txt) |
| 原仓库文件指纹 | [original-sha256.json](codex-lab/original-sha256.json) |

后文的“复现命令”均可直接执行。先定义：

```sh
LAB=<lab>
NODE="$LAB/runtime/node_modules/.bin/node"
CLI="$LAB/repo/bin/docaxioms.mjs"
```

例如 `"$NODE" "$LAB/reproduce.mjs" B1-plan` 会在 `codex-lab/cases/` 新建 fixture，再调用原始 CLI；脚本没有替换或等价重写待核验的检查算法。完整日志保存实际随机目录与完整调用参数。以下关键输出为原始输出摘录，省略不相关的 `ok` 行。

## 2. 报告 B：缺陷 1–7 逐项裁决

| 项 | 报告位置 | 判定 | 最小见证与实际结果 | 必须修正的细节 |
|---|---|---|---|---|
| 1：paths 扫入记录、计划、研究和旧决策 | B382–384；摘要 B3 | **CONFIRMED** | `B1-plan`、`B1-log`、`B1-decisions`、`B1-research` 均退出 **1**，各仅出现对应 paths finding | `src/check.mjs:367/383` 定位正确。需要匹配 `pathPrefixes` 的**行内代码路径**，并且不存在、不在 `gonePaths`、不被 `pathExempt` 排除；普通散文和围栏例子不是同一复现条件。`p.currentDocs` 是机械分类，含决策文件不代表每行都属于 K3。 |
| 2：history 正则既可绕过又误拦合法修链 | B385–387 | **CONFIRMED** | `B2-title` 退出 **0**；仅改引用定义 URL 的 `B2-reference`、仅改平衡括号 URL 的 `B2-balanced` 均退出 **1**；普通修链对照退出 **0**、改正文对照退出 **1** | B387 展示的正则文本不准确。真正的 `bare` 是 `text.replace(/\n+$/, "").replace(/\]\([^)]*\)/g, "]()")`。它没有解析 title，也不限制换行，但在第一个 `)` 终止，不能无条件抹掉“任意”内容。绕过见证确实是合法多行 link title；不是已经证明可无条件改写任意历史正文。 |
| 3：默认 D 前缀将 D1/D2/D3 识别成决策号 | B388–390 | **CONFIRMED** | `B3-doc` 退出 **1**，报告 README 的 D1、D2、D3；`B3-code` 对独立 D0、D9999 报错 | 模板第 6 行、`check.mjs:311–317` 和正则均准确。**“任何标识符”过宽**：`D3_scale`、`AD3`、`D10000` 不匹配；已有对应决策行也不会报缺失。行内反引号不豁免，围栏代码块豁免。高频程度、用户会关闭检查、MAJOR 影响面均未获真实项目测量。 |
| 4：LF/CRLF 导致 core 哈希和 history 误报 | B391–393 | **PARTIAL：算法与 Git 场景已确认，Windows 实机未覆盖** | `B4-crlf` 真正执行带 `core.autocrlf=true` 的 clone；Git blob 为 LF，工作区为 CRLF。check 退出 **1**，4 个 core 文件均不匹配；update 退出 **1**；隔离 history 后追加合法 CRLF 勘误也退出 **1**。LF 对照退出 **0** | `.gitattributes` 确实不存在；行号准确；`pins.mjs:58` 确实另做 CRLF 归一化。不能把所有 Windows 配置统称为必然 CRLF；实际取决于 Git 配置、属性和内容。history 还须发生被 diff 选中的修改；单纯换行检出并不自动等于被比对。`core/LICENSE` 也受影响，报告只说 `*.md` 不完整。 |
| 5：研究与开放计划的关联只做文件名子串匹配 | B394–396 | **CONFIRMED** | `B5-overlap`：只链接 alpha.md，未被开放计划链接的 a.md 仍通过，退出 **0**；`B5-plain`：只在普通散文提及 a.md 也退出 **0** | 行号准确；`"alpha.md".includes("a.md")` 确实为 true。需要先为两个文件安排真实可达路径，否则其他 gate 可失败。`withoutCode` 会去掉围栏与行内代码：只写反引号内的 a.md 的对照退出 **1**，不是任何纯文本出现都算。 |
| 6：非 Markdown landing 跳检；query 和前导 / 链接解析 | B397–399 | **CONFIRMED（所列三种实际行为）** | `B6-code` 和 `B6-dir` 均退出 **0**，目标没有 D1；Markdown 无反向引用对照退出 **1**。`B6-root`、`B6-query` 均退出 **1**，分别错误/字面查找 `docs/docs/design.md`、带 query 的文件名 | `:500–505`、`:115–121` 和 `join` 推演准确。landing 源文件见证需自行创建，init 不生成 src/index.mjs。query 未拆分属实；但 `/docs/design.md` 应表示“仓库根”未在本项目文档定义，**“常见 GitHub 根相对链接”不是本地仓库根契约的证据**。这部分只能确认解析行为与限制，不能单凭该例证明违背明示契约。 |
| 7：init 尾斜杠截字符；空文件算 1 行 | B400–402 | **PARTIAL** | `B7-slash` 的 API 调用成功，返回 `GENTS.md` 等错误名称；磁盘 `AGENTS.md=true`、`GENTS.md=false`。`B7-empty` 的 garden 输出 `lines:1, chars:0` | 核心遗漏：`manage.mjs:97` 损坏的是 **made 返回值/显示名称**，不损坏实际文件路径或内容；嵌套项 `docs/...` 变成 `ocs/...`。普通 CLI 会先 resolve，通常不会触发。根目录 `/` 的显示问题仅静态核对，未尝试写系统根。空文件计数涉及两个 check 和两个 garden 位置，定位均正确；项目未明示空文件必须是 0 行，故“缺陷”仍有契约口径问题。 |

以上现象都在原始引擎上运行；没有将报告的 MAJOR/MINOR/NIT 定级直接当作核验结论。具体最小输入、命令、退出码和关键输出见第 7 节各同名实验。

## 3. 报告 A：重点项目与其余源码断言

### 3.1 用户指定的重点项目

| A 的断言与位置 | 判定 | 本次证据与纠正 |
|---|---|---|
| src/index.mjs 缺失，程序化 import 必坏（A5、39、89、95） | **REFUTED（当前）**；旧 ZIP 不可核实 | 当前受跟踪文件存在，5 行再导出，`package.json.exports["."]` 指向它。本地 `npm pack` 的 23 个文件含它；独立 consumer 安装该 tarball 后 import 成功，**退出 0、19 个导出**。并非只有 CLI 可用。 |
| CI 浅克隆缺 base 时 note 且退出 0（A3、40、89、95） | **CONFIRMED（条件化）** | `A-shallow` 真正 depth=1 克隆 feature。完整基线可发现的已提交历史改写和 codeToDocs 信号，在无 origin/main 的浅副本变为两个 note，严格模式也退出 0。工作区再改历史立即退出 1，故“完全失效”不准确。当前仓库 workflow 已显式 `fetch-depth: 0`，不应说当前自己的 CI 使用默认浅克隆。 |
| `--strict-aids` 仍不因 note 失败（A40） | **CONFIRMED** | `A-notes` 和 `A-shallow`：只有 note 时退出 0。`M-aid-report`：真正 aid finding 时默认 0、strict 1、strict+report 0。note 不属于 finding。 |
| 默认 codeExtensions 为空（A43、89） | **CONFIRMED（初始化模板）** | `templates/docaxioms.json:4` 是 `[]`；`A-codeExtensions` 中默认 code=[]、退出 0，配置 `.mjs` 后同一源码的缺失文档路径被发现、退出 1。**本仓库自身配置不是空，而是 `[".mjs"]`**。pins 和 codeToDocs 也不以这个列表为唯一入口。 |
| 裸 `pin --write` 被拒，需 file/pin/all（A48） | **CONFIRMED** | `A-pin-preview`：裸调用退出 1，打印完整作用域错误；随后 `--write --all` 成功退出 0。它拒绝的是未声明范围，不是禁止批量刷 hash。 |
| `MAX_PREVIEW_LINES=12`、写后打印前 12 行（A48） | **PARTIAL** | 常量在 `src/pins.mjs:22`，行范围 15 行的写入打印 1–12 并提示 `(+3 more lines)`；同一次**整文件 pin 写入没有预览**，因 `previewSlice` 对无起始行返回 null（:65–74）。预览也不能“迫使”人或代理实际复核。 |
| 16 个内置检查＝14 gate+2 aid（A20、63） | **CONFIRMED** | 源码精确属性计数与 `await check()` 的实际结果均为 16/14/2。是“内置”计数；配置 projectChecks 可追加，严格模式可改变 aid 对退出码的影响。 |

### 3.2 其余事实断言：合并重复并保留出处

| ID | A 位置 | 断言 | 判定及证据 |
|---|---|---|---|
| A01 | 3、4、9、20、62、88 | 9 公理、4 方法，记录/规范/描述/计划分层 | **CONFIRMED（文本）**：`core/AXIOMS.lock.md:9–17,21–24`；概念分层是规范，不意味着每个检查都正确落实，B1 即反例。 |
| A02 | 16、77、88 | AGENTS 默认预算 100 行/6000 字符，CURRENT 是短卡 | **CONFIRMED**：模板配置 :10–12；CURRENT 默认 45 行/4000 字符；本仓库 AGENTS 自用预算更小，为 50/2000。`B7-empty`/现有预算故障测试覆盖实际度量。 |
| A03 | 16、49、88 | check 做机械度量，garden 导出清单供只读语义审计 | **CONFIRMED**：`garden.mjs:8–46`、`core/GARDEN.md`；`M-json-schema`/`B7-empty` 实跑 garden JSON。garden 本身不判断散文事实。 |
| A04 | 26、89、95 | 模板按序读 axioms、整个 GUIDE、CURRENT、任务页；每任务都强制全读 | **PARTIAL**：按序列出 GUIDE 属实，未给 GUIDE 按需豁免；“每次任务”“全量重新加载”不是模板原句，也无程序强制。实际 token/费用增幅没有本项目实测。详见第 4 节。 |
| A05 | 27、64、82、89、96 | pin 为文件/行 SHA-256，默认短 hash 12 位，无原生 AST；格式化敏感 | **CONFIRMED**：`pins.mjs:20–22,57–103`；`A-pin-motion` 的空白改动触发 exit 1。只对**覆盖内容**敏感；范围外未改行号的改动不会必然失败。CRLF 已归一化。 |
| A06 | 27、88 | findRelocatedWindows 找同文件唯一平移，碰撞 fail closed | **CONFIRMED（在当前位置失配后）**：`A-pin-motion` 先 exit 1、relocate 保留 hash 后通过；现有 `B2 + N1`、ambiguous 测试实跑通过。当前位置本来匹配时不会遍历全文件消歧，不能扩大为全局唯一性保证。 |
| A07 | 27、89 | pin --write --all 可一键刷新 | **CONFIRMED（功能）**：`A-pin-preview` 实跑成功；“规模化必然警报疲劳/绕过复核”是未测风险，不是当前已观察结果。 |
| A08 | 28、48、88 | init 将 axioms 设为 0444，哈希能发现修改，改文件和 profile 可一起绕过 | **CONFIRMED**：`A-guards` mode=444；`A-tamper` 只改文件 exit 1、同时改 profile hash 后 exit 0；包内行为不是对抗有写权主体的安全边界。Git 树记录普通文件为 100644，不能保存 0444。 |
| A09 | 28 | 改 decision 状态为 withdrawn 可免 landing 校验 | **CONFIRMED**：`A-withdrawn` active 无 landing exit 1，withdrawn 后 exit 0；它不验证 owner 是否批准撤回。 |
| A10 | 32 | 旧 ZIP 共 28 文件、存在数十组测试 | **PARTIAL**：当前是 32 个受跟踪文件、102 个测试，旧 ZIP 的 28 无从核实；测试数量不等于没有新见证。 |
| A11 | 32、88 | remark/GFM/slugger 做 Markdown AST，从而避免正则边界问题 | **PARTIAL**：解析器确实基于 AST，links、inlineCode 等使用它；history 仍是 regex，决策引用仍扫 raw/withoutFences，不会统一排除注释。不能由“使用 AST”推导整个工具免疫正则误判。 |
| A12 | 32 | POSIX shell 转义在 bin 中实现 | **PARTIAL（定位错）**：实现是 `src/manage.mjs:39–45 checkCommand`；bin :169 调用。现有测试实际用 `/bin/sh`、特殊字符和 CDPATH 验证，并通过。不是主程序用 shell 执行检查。 |
| A13 | 32 | 已覆盖无末尾换行追加勘误、@ 路径、列表/引用块 pin 回写 | **CONFIRMED**：现有 `allowed: an erratum after...`、`a pin whose path contains @`、`B1 regression...` 测试都在本次 102 项成功运行中。 |
| A14 | 41、72、89、97 | 默认 CURRENT、decision 表集中；多 worktree 容易冲突，未有内建目录分片/聚合 | **PARTIAL**：模板结构和单 file/card 接口属实，`M-concurrency` 两分支都加 D1 确实 merge exit 1。但“不支持并发/必然高频冲突”没有频率证据，Git worktree 本身没有被禁止；各目录可独立用 profile 和 --root，缺少的是统一跨 profile 聚合/冲突预警。 |
| A15 | 42、66、89 | Node >=22；非 JS 库必须新增自己的 package.json/node_modules | **PARTIAL**：engines 明确 Node >=22，现有 Python fixture 证明被检项目可非 JS。推荐本地 devDependency 会带 npm 文件，但运行 CLI 并不硬性要求**被检项目**含 package.json；本次多个无 package.json 的 fixture 已检查成功。引擎依赖需安装，不等于目标仓库必须采用 npm。 |
| A16 | 43 | commands/codeToDocs/sections/evolutionary 需配置；没有 demo/自动识别/渐进基线 | **PARTIAL**：模板未启用这些规则、没有探测/demo/专用 baseline；`M-init-detect`、`M-missing-cli` 证实。已有 `--report` 可先观测、`ignore`/豁免等可收窄，不能概括为完全无渐进接入手段。 |
| A17 | 43、89 | init 后空骨架必零发现，必须先配源码扩展/pin 才有价值 | **REFUTED（绝对表述）**：干净模板可无 findings，但 `M-init-link` 保留既有坏链接的 README，未配 codeExtensions/pin 就 exit 1。默认 links/paths/预算等已经有效；“首日价值弱”属体验判断。 |
| A18 | 44、66、89、96、97 | 无 SARIF/JUnit/PR 注释/MCP、标准 skill 模板、稳定诊断码 | **CONFIRMED（受跟踪源码/模板）**：文件清单和 CLI 参数无这些入口；process exit 0/1 已存在，不等于稳定发现码不存在时连退出码也没有。详第 5 节。 |
| A19 | 44 | README 徽章所指 workflow 不存在 | **REFUTED（当前）**：`.github/workflows/check.yml` 存在，PR 与 main push 执行 npm ci/check，Node 22，fetch-depth 0。旧 ZIP 是否漏带不能核实；本地 npm 包不包含 workflow 是另一回事。 |
| A20 | 48 | init 不覆盖已有文件，已有 docaxioms/ 会中止，CLAUDE 仅桥接 | **CONFIRMED**：`A-guards` 实跑保留 AGENTS=`MINE`，重复 init/已有 core 目录都 exit 1；`templates/CLAUDE.md` 11 B，为 `@AGENTS.md\n`。不评价第三方工具是否会读取该桥接。 |
| A21 | 49、65、88 | active decision 指向 landing 且 passage 必须含 ID；能保证意图与行为一致 | **PARTIAL**：机械反向 ID 校验在 Markdown 上成立，源文件/目录有 B6 例外；`M-semantic` 仅在无关正文写 D1 也通过。无法证明语义落地、实现正确或 owner 真意。没有通用结构化修复契约属实，但 pin findings 已提供具体修复命令，不能说完全无指引。 |
| A22 | 65 | 可达性用 BFS | **REFUTED（算法名称）**：`:463–471` 用 `queue.pop()`，是栈式深度优先遍历；仍能计算可达集合，不因此构成可达性功能缺陷。 |
| A23 | 65、88 | history 是不可变防篡改，仅准修链和追加 dated erratum | **PARTIAL**：这是规则目标，正常修链/勘误实跑成立，但有 B2 绕过和误报，B4 换行问题，以及 note 降级；README.md 历史索引被该比对显式跳过，新文件不在 M/D 比对中。不能当密码学防篡改或权限机制。 |
| A24 | 77、88 | budgets/reachable/commands/path/pins 提供确定性骨架 | **CONFIRMED（所评谓词）**：现有 seeded faults 成功，B1/B2 等同时界定其精度；不得写为整个散文与代码“事实一致”的保证。 |
| A25 | 82、88 | MIT、纯 Markdown/文本 core、本地离线检查、无商业服务依赖 | **CONFIRMED（内置路径）**：LICENSE/core/LICENSE 一致，CLI 内置只读本地和调用本地 Git，未发网络请求。安装依赖和用户自定义 projectChecks 不在“无需网络/无外部行为”的保证内。 |
| A26 | 88 | core 严禁任何工具/项目/路径，单测全面保证 | **PARTIAL**：AD-2 是约束，测试 :353–356 只拒绝列举的路径/地址/工具/模式；不是任意专名或语言名的完备识别器。不能把有限词表等同语义证明。 |
| A27 | 95–97 | 缺 exports 的修复、require-base、regions、skills、诊断、profiles、MCP、分片属于待建 | **PARTIAL**：exports 修复针对当前已不需要；其余专用入口/模板确实没有。方案价值、成本和团队效果是建议，未被源码验证。已有 --all、--relocate、--report 不应被忽略。 |

## 4. 报告 B 的精确计数、字节数与阅读指令

### 4.1 gate/aid 与体量

| B 位置/对象 | 实际值 | 裁决 |
|---|---|---|
| B20–22 `level: "gate"` | **14**，行 262,293,304,325,355,371,401,409,433,461,482,514,530,550 | **CONFIRMED**，所有行号均吻合 |
| B23–25 `level: "aid"` | **2**，行 588,627 | **CONFIRMED** |
| B26 外部 checks 默认 level | `src/check.mjs:672` 为解构默认 `level = "gate"` | **CONFIRMED**，不计入属性精确匹配正确 |
| B7、376 文件数 | 32 个 tracked；bin+src 共 7 个文件，**64,606 B** | **CONFIRMED**，不能把 7 个引擎文件当整个包文件数；本地 tarball 23 项 |
| B55、376 依赖 | package.json 列出 **7 个直接依赖**，npm ci 安装 71 包 | **CONFIRMED（直接依赖）**，不是整个传递依赖图只有 7 包；代码无原生语法器依赖 |

### 4.2 B341 每个字节值

以文件内容的 UTF-8 字节计数，使用 `wc -c` 和 Node Buffer 长度交叉测量；不能用 ZIP 压缩后占用或 JS string.length 替代。

| 文件 | B341 声称 | 当前实测 | 判定 |
|---|---:|---:|---|
| templates/AGENTS.md | 552 B | **552 B** | CONFIRMED |
| core/AXIOMS.lock.md | 3,460 B | **3,460 B** | CONFIRMED |
| core/GUIDE.md | 7,091 B | **7,091 B** | CONFIRMED |
| templates/CURRENT.md | 224 B | **224 B** | CONFIRMED |
| templates/docs/README.md | 265 B | **265 B** | CONFIRMED |
| 上述五文件合计 | 11,592 B | **11,592 B** | CONFIRMED |
| GUIDE 占上述合计 | 61.2% | **61.1715%** | CONFIRMED（四舍五入） |
| core/GARDEN.md | 2,346 B | **2,346 B** | CONFIRMED |
| 根 README.md | 6,971 B | **6,971 B**；JS 字符串长度 6,969 | CONFIRMED（字节数） |
| 根 AGENTS.md（合计隐含项） | 隐含 832 B | **832 B** | CONFIRMED |
| 根入口 + axioms + GUIDE + GARDEN + README | 20,700 B | **20,700 B** | CONFIRMED |
| core/LICENSE（补充） | 未列 | **1,065 B** | 不属于上述三份 core Markdown，但属于被 pin 的 core 文件 |

B408 的“满预算 20,816 字符”可由 `6000+3460+7091+4000+265` 算出，**算术正确但不是整个阅读链的硬上限**：6000/4000 只控制 AGENTS/CURRENT，docs/README 和任务页没有因此受总预算约束，core 也可随版本变化。B436 的配置字典“约 1,982 B”实测从 `## The profile` 到 EOF 为 **1,983 B**，相差 1 B；“约 2 KB”合理。

### 4.3 是否真的要求每次按序全量阅读 GUIDE

`templates/AGENTS.md:3–7` 的实际内容是：

```text
Read in this order:
1. [`docaxioms/AXIOMS.lock.md`](docaxioms/AXIOMS.lock.md) (locked: never edit it)
2. [`docaxioms/GUIDE.md`](docaxioms/GUIDE.md)
3. [`CURRENT.md`](CURRENT.md)
4. Only the task-relevant pages linked from [`docs/README.md`](docs/README.md)
```

**按序阅读 GUIDE 是明确的文字指令，没有“只在配置任务时读 GUIDE”的限定；只有第 4 项按任务筛选。** 因此“入口把完整 GUIDE 放在一般阅读链上”有根据。但模板没有 `every time`、`every task`、`read in full again` 字样，更无 CLI 追踪或强制阅读；重复加载频率由消费者决定。docs/README 被作为导航来源使用，也不等于逐字强制读取整页。

所以 B3/51/341/408/436、A26/89 将这份文件内容总量称为**规范阅读链的静态大小**是合理的；将其升格成“每次冷启动的实际最低 token/推理成本”“必然 19%–23% 费用税”“保证零漏读”均为 **PARTIAL/未测推断**。链接目标还会随现有项目文件而变：init 保留已有 AGENTS/CURRENT 等文件，上述数值只适用于这些原始模板内容。

## 5. 报告 B §5.3：八项缺失功能

| 项/位置 | 判定 | 动态/静态证据及应改写之处 |
|---|---|---|
| 1，B413：JSON Schema/未知键校验不存在 | **CONFIRMED** | loadProfile 仅 JSON.parse；`M-json-schema` 把 commands 拼为 commmands 并加入 inventedKey，check JSON **exit 0**；改回 commands 才 **exit 1**。没有 schema 文件。错误类型可能触发运行异常，不是友好 schema 诊断；不能把“全部非法配置都空过”当成事实。 |
| 2，B414：稳定发现码、结构化对象和 SARIF 不存在 | **PARTIAL，关键描述错误** | **check --json 已是对象数组**，每个对象含 name,axioms,level,problems,notes；只有 problems/notes 的元素是自由文本串。garden --json 也已有 root/descriptions/stageCard 等对象。缺少每条 finding 的稳定 code/file/line 独立字段及 SARIF 属实；`--format sarif` exit 1。B54、430 同样需要纠正。 |
| 3，B415：skill 脚手架/可选提醒 hook 不存在 | **CONFIRMED（目标能力）** | 无 SKILL.md、.agents/skills 或 PostToolUse 模板。**“templates 仅含 AGENTS/CLAUDE”字面错误**：实际有 9 个模板文件，包括 profile、CURRENT 和 5 个 docs 文件。不能把没有 skill 说成没有其他模板。 |
| 4，B416：官方 action.yml/独立二进制/Docker 不存在 | **CONFIRMED（当前受跟踪文件/包）** | 无 action.yml/action.yaml、Dockerfile、独立二进制/构建脚本；package 仅 npm/Node CLI。**有仓库自检 workflow**，不能把它与可复用 Action 混为一谈。本次不查询外部 Release 历史，故不据此断言从未分发过其他产物。 |
| 5，B417：init 自动探测/demo 不存在 | **CONFIRMED** | `M-init-detect` 在已有 package.json scripts 与 Makefile 的目录 init，仍生成 codeExtensions=[] 且无 commands；`demo` 打印 usage、exit 1。这里没有 zero-config demo，不意味着默认 checks 不能发现既有坏链接。 |
| 6，B418：changed-only/跨 PR 冲突预警不存在 | **CONFIRMED（专用能力）** | `--changed-only` Unknown option、exit 1；无访问远程 PR 的实现。codeToDocs **已经读 Git diff**，那是辅助映射判断，不是全引擎增量快检。 |
| 7，B419：未 pin 代码符号的历史差集 aid 不存在 | **CONFIRMED（内置检查）** | 16 个检查无此规则；源码未实现按文档历史取符号再比当前的流程。已有 codeToDocs、sections、evolutionary 和任意 projectChecks 扩展，故“除 pin/path/command 外完全无信号”说得过宽；这些均不等于所提符号差集功能。 |
| 8，B420：MCP Server 不存在 | **CONFIRMED（当前源码/包）** | 无 MCP 依赖、入口或 server，实现入口只列 check/pin/garden/init/update；`mcp` usage、exit 1。是否值得建设属于产品选择。 |

真实失败 JSON 对象摘录（`M-json-schema` 第二次 check，exit 1）：

```json
{
  "name": "commands named in current documents exist",
  "axioms": "A2, A7",
  "level": "gate",
  "problems": ["README.md:3: `make missing` is not defined"],
  "notes": []
}
```

## 6. 报告 B 其他断言与未来方案的事实基础

| ID | B 位置 | 断言 | 核验结果 |
|---|---|---|---|
| B01 | 2、31、46–50、373 | core 文本 pin、version/commit 双锁、决策落地、history 为本地 gate | **PARTIAL**：检查与初始配置确实存在；commit 只在 pin 为完整 40 位且运行包为 Git checkout 时比较，普通 npm 包无 .git 时不比较运行 commit。--accept-axioms 属于 **update** 的选项，不是 check 获 owner 授权的证明。语义和 history 保证受 B2/B6 与降级边界限制。 |
| B02 | 11–19 | 三段原文、函数签名、行号 | **CONFIRMED（逐字核对）**：axioms 第 9 行；resolveBase 第 48 行；模板第 3 行均吻合。 |
| B03 | 28、482 | AD-1,2,3,4,6,7，缺 AD-5，快照无法知道为何 | **CONFIRMED（当前编号）**；本地历史补足空白：`6a9afdd` 曾有 AD-5 旧包名更名行；`86dffc1` 删除它，其提交说明记载旧名称未发布、无需迁移。是明确删除，不是从未起草。这里只复述提交记录，未追认其是否得到 owner 授权。 |
| B04 | 28、381、483 | 报告未实跑，7 项仅静态推测；没有 BLOCKER | **PARTIAL**：报告自述不能从源码验证；本次已补运行证据。“未发现 BLOCKER”是作者评审范围内的结论，不是源码完整性证明。本次不替其全产品定级背书。 |
| B05 | 31、373、374、377 | 能暴露意图冲突、保障历史不可变、强制代码 pin 复审 | **PARTIAL**：能强制 hash 匹配与 ID 关系，不能证明语义、真实意图或人读了预览。`M-semantic` 无关正文只含 D1 仍成功；B2 可绕 history。 |
| B06 | 48、374、405 | 行/文件 pin；唯一同文件平移；改名/格式化不能自动追踪 | **CONFIRMED（受限表述）**：`A-pin-motion`、现有碰撞回归测试；hash 本身不跨文件寻找。改名后需手改目标，或其他配置/文档跟随；不能说一定所有格式化都失配，CRLF 是已归一化的反例。 |
| B07 | 49、374 | 无范围 write 被拒，因此从接口阻止一键洗白所有 pin | **PARTIAL / 后半 REFUTED**：裸 write 拒绝属实，显式 `--all` 完全支持，且不会判断人工是否复审。`A-pin-preview` 有成功见证。这是防误触边界，不是反盲刷权限边界。 |
| B08 | 52、448 | init 后必零有价值发现、要 5–6 步才有发现 | **REFUTED（绝对说法）**：`M-init-link` 未配源码规则也能发现现有坏链接；5–6 步不是引擎强制流程，未经体验计时。配置空列表是事实，与价值为零不可等同。 |
| B09 | 53、407、448、452 | 集中式决策/card/log，不支持并发，必撞号、必高频冲突 | **PARTIAL**：模板单文件、parser 单表文件属实；`M-concurrency` 证明可能冲突。不支持目录式 ADR、没有跨 PR 预警属实；并不能推出 Git worktree 无法工作或所有并行修改必冲突，也无频率数据。 |
| B10 | 54、55 | 纯文本串 JSON、Node+7 依赖、无错误码/MCP | JSON 部分 **REFUTED**，其他按第 4–5 节确认；需要区分发现码、process 退出码与 JS 库接口。 |
| B11 | 56、481 | AD-7 外部实证尚无数据、门槛 10 变更/3 findings | **PARTIAL**：decision 原文有“至少 10 次相关变更、3 条值得改文档的 findings，再由 owner 逐项升 gate”的门槛；仓库没有这类实测记录。不足以证明外部从未有过使用数据或误报率必然很高。 |
| B12 | 375 | 缺 base 打 note；strict-aids 不因 note 失败 | **CONFIRMED**：`A-notes`/`A-shallow`；但 note 并不证明应当不阻断所有 CI 场景，属于已有明确设计选择，A 称“静默”也不准确。 |
| B13 | 376 | AST、7 文件/64,606 B、纯 JS 依赖、AD-2 测试全守语言无关 | 体量 **CONFIRMED**；“统一 AST/硬性全保证” **PARTIAL**：history 正则和有限禁词表反例见 A11/A26。没有原生语法器与“全源码对所有语言语义安全”是两回事。 |
| B14 | 377 | 可达性、研究联动、card 和任意 glob 预算 | **CONFIRMED（功能存在）**：源码 :431–545 与现有 faults；research 的“真实链接”谓词有 B5 缺口，预算并非自动涵盖一切子文档。 |
| B15 | 405–406 | 行 pin/纯本地检查是有意识取舍；外链/排版/语义未内建 | **CONFIRMED（实现范围）**：远程 URL 在 `check.mjs:114` 过滤；无远程抓取与 LLM 语义引擎。不是程序强制必须和某指定第三方工具组合，人工也可审核。 |
| B16 | 408–409 | 全链固定阅读费；要求精确安装 Node 22 | 阅读成本见第 4 节 **PARTIAL**；Node **>=22.0.0** 是下限，24 等更高版本也被 manifest 允许，不是必须精确 22。 |
| B17 | 410 | commands 只查固定前缀的 inlineCode；bash fence 不报 | **CONFIRMED**：`M-commands-fence` 只有 fence 时 exit 0，追加相同行内代码后 exit 1；源码 :416–423 正确。未证实当初作此选择的全部动机，只确认代码和注释。 |
| B18 | 423–428 | 六类问题都可用 110–140 行/12–15 测试极低成本等价修好、零松弛/零回归 | **未验证的工程估计**：没有补丁或候选运行。B1/2/3/4/5/6 有真实输入，但全部 landing 必须允许哪种目标、/ 的语义等仍需定契约。AST URL 擦除须保持 title/原文偏移，不能由函数名推导零绕过。core hash 归一化也会改变 byte pin 的定义。 |
| B19 | 425 | 研究关联直接用 p.links(research.items) 即等价修复 | **PARTIAL（提案不完整）**：原代码只看 openUntil 前的开放区域；若直接取整篇 links，会把关闭区链接算进去。必须保留开放段作用域再核对真实目标。 |
| B20 | 429–434 | 尚无结构化 JSON；180 行、零误报、各 finding 均可给稳定行列 | JSON 缺失 **REFUTED**；schema/发现字段缺失属实。工时、0% 误报、所有全局关系发现都能自然落到单一行列是未验证承诺，需要设计与实验，不能称已验证。 |
| B21 | 435–440、484 | GUIDE profile 约 2 KB；拆分不改 axioms 可普通 update；必降固定 token 税且提高遵从 | 大小 **CONFIRMED（1,983 B）**；update 只有 axioms pin 变化才需要 accept，源码 :126 符合。token/遵从改善仍待 A/B，不能用文件字节直接预测实际成本。 |
| B22 | 442 | 现在仅支持绝对行号；范围内增删必 invalid-range | **REFUTED（绝对说法）**：早已有 whole-file pin；范围内插入但原行号仍在文件内通常是 changed/moved，只有超 EOF 等才 invalid-range，见 `pins.mjs:83–88,136–205`。文件增删不一定都失败，例如尾部范围外改动；哈希碰撞内容亦不能概括。 |
| B23 | 443–446 | 默认 strip 行尾空白“完全兼容/语义安全”，尤其 Python/YAML | **REFUTED（普适保证）**：`M-suggestions` 中 Python 多行字符串的实际输出由 `'a  \nb'` 变为 `'a\nb'`；行尾空白可属于数据。旧 hash 也由 d0d63d20d3b9 变为 ed86eecb1326，不能在不迁移/不区分模式时声称 100% 兼容。保留行首缩进不是语义安全的充分条件。命名区域功能尚未实现。 |
| B24 | 447–452 | 目录式 ADR 尚无；改目录可将所有并行冲突降为 0；探测只读所以对任何语言绝对安全 | 缺功能 **CONFIRMED**；降到 0/绝对安全是未测保证，独立文件仍可撞 ID、争索引/landing。只按文件名建议配置与改写源码不是同一个风险面，不能混写为已验证结果。 |
| B25 | 453–458 | 无 Action/二进制/changed-only；SEA 产物体积 <60MB、性能更好 | 当前缺项 **CONFIRMED**；打包可行性、体积与跨平台发布成本没有实现/运行证据。以 note 标明跳过是方案要求，不是当前支持的行为。 |
| B26 | 459–464 | 无符号历史差集；未来 aid 耗时<2s/能检旧符号 | 当前缺项 **CONFIRMED**；具体规则、成本、100 条样本效果未验证；已有其他 aid 和 projectChecks，详第 5 项缺失功能。 |
| B27 | 465–470 | 没有自动调用检查/PR 碰撞提醒；可能提供节流 hook | **CONFIRMED（默认初始化）**：init 打印 `Nothing runs the check for you yet`；仓库自身 CI 已自动调用 npm check，不能扩大为任何环境都不自动运行。hook 的收益/30 分钟参数与 opt-in 方案未实测。 |
| B28 | 473–479 | docaxioms 不自动按源码迎合改写语义；code pin 不会自动贴最新源码覆盖散文 | **CONFIRMED（当前内置命令）**：check/garden 只读；pin 只改注释 hash/范围，manage 只管理模板/core/profile。但这不能保证使用者或外接 agent 不会误改语义。MCP/skills/竞品组合价值属于建议。 |

覆盖映射：A 的源码事实集中于 3–49、60–66、72、77、82–89、95–97，均已分解进第 2–5 节及 A01–A27；B 的源码事实集中于 2–28、31、46–56、341、373–420、423–485，均已分解进第 2/4/5 节及 B01–B28。其余产品矩阵、外部研究和文献条目未伪装成本仓库核验结果。纯产品评价和未来效果没有可由当前源码证明的真假，以上按“主张/估计”保留，没有把它们算成已确认缺陷。

## 7. 每条实验的命令与实际证据

以下逐项列出 fixture 变更、复现入口、退出码和关键行；每项另链接原始完整输出。API 实验的退出码指运行该 API 的 Node 进程；CLI 实验保留每次调用自己的退出码。所有目录创建和写入都在实验区。

### B1-plan

默认 init 后仅将 docs/plan.md 改为 `# Plan\n\nAdd `docs/api.md`.\n`；docs/api.md 不存在。脚本还直接显示 descriptionDocs 不含 plan，印证两个扫描集不一致。

```sh
"$NODE" "$LAB/reproduce.mjs" B1-plan
```

[完整输出](codex-lab/logs/B1-plan.txt)。关键输出（摘录）：

```text
exit=1
FAIL paths named in current documents exist (A2, A7): 1
       docs/plan.md: `docs/api.md`
descriptionDocs contains plan: false
```

### B1-log

默认 init 后在 docs/log.md 写 `Removed `docs/old.md`.`；该路径不存在。

```sh
"$NODE" "$LAB/reproduce.mjs" B1-log
```

[完整输出](codex-lab/logs/B1-log.txt)。关键输出（摘录）：

```text
exit=1
FAIL paths named in current documents exist (A2, A7): 1
       docs/log.md: `docs/old.md`
```

### B1-decisions

给默认决策表加 D1（superseded by D2，正文保留 `docs/old.md`）和 D2（withdrawn）；只留下 paths finding。

```sh
"$NODE" "$LAB/reproduce.mjs" B1-decisions
```

[完整输出](codex-lab/logs/B1-decisions.txt)。关键输出（摘录）：

```text
exit=1
FAIL paths named in current documents exist (A2, A7): 1
       docs/decisions.md: `docs/old.md`
```

### B1-research

新建带 `Status: open (a)` 的研究页并从 plan 正确链接；页内提及不存在的 `docs/external.md`。

```sh
"$NODE" "$LAB/reproduce.mjs" B1-research
```

[完整输出](codex-lab/logs/B1-research.txt)。关键输出（摘录）：

```text
exit=1
FAIL paths named in current documents exist (A2, A7): 1
       docs/research/a.md: `docs/external.md`
```

### B2-title

将已提交历史的 `[plan](../plan.md)` 改为 `[plan](../plan.md "静默改写内容\n可跨多行")`；base=HEAD，所有普通目标存在。AST 也确实识别出 URL。

```sh
"$NODE" "$LAB/reproduce.mjs" B2-title
```

[完整输出](codex-lab/logs/B2-title.txt)。关键输出（摘录）：

```text
exit=0
ok   a history file changes only in link targets, or grows by a dated erratum (A5)
AST links: ["../plan.md"]
```

### B2-outside-link

对照：已提交历史中将 `Original prose.` 改为 `Tampered prose.`，不修改链接。

```sh
"$NODE" "$LAB/reproduce.mjs" B2-outside-link
```

[完整输出](codex-lab/logs/B2-outside-link.txt)。关键输出（摘录）：

```text
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
```

### B2-reference

已提交历史含 `[plan][p]` 与 `[p]: ../old.md`；只把定义 URL 改成 ../plan.md，两个目标都存在。

```sh
"$NODE" "$LAB/reproduce.mjs" B2-reference
```

[完整输出](codex-lab/logs/B2-reference.txt)。关键输出（摘录）：

```text
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
```

### B2-balanced

已提交历史 URL 为 ../Foo_(bar).md，只改为 ../plan.md；两个目标存在且有现行入口链接，排除可达性干扰。

```sh
"$NODE" "$LAB/reproduce.mjs" B2-balanced
```

[完整输出](codex-lab/logs/B2-balanced.txt)。关键输出（摘录）：

```text
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
```

### B2-link-valid

对照：普通行内 URL ../old.md 改为 ../plan.md。

```sh
"$NODE" "$LAB/reproduce.mjs" B2-link-valid
```

[完整输出](codex-lab/logs/B2-link-valid.txt)。关键输出（摘录）：

```text
exit=0
ok   a history file changes only in link targets, or grows by a dated erratum (A5)
```

### B3-doc

默认 profile；README 普通正文包含 Cloudflare D1、D2 diagrams、D3.js，以及行内代码 D3。

```sh
"$NODE" "$LAB/reproduce.mjs" B3-doc
```

[完整输出](codex-lab/logs/B3-doc.txt)。关键输出（摘录）：

```text
exit=1
FAIL decision numbers are unique and every one cited exists (A4): 3
       README.md: D1
       README.md: D2
       README.md: D3
```

### B3-code

只增加 codeExtensions=[".mjs"]；源码同时有独立 D0、D9999，以及 D3_scale、AD3、D10000。

```sh
"$NODE" "$LAB/reproduce.mjs" B3-code
```

[完整输出](codex-lab/logs/B3-code.txt)。关键输出（摘录）：

```text
exit=1
FAIL decision numbers are unique and every one cited exists (A4): 2
       src/a.mjs: D0
       src/a.mjs: D9999
```

### B3-boundary

对照：README 只有 D3_scale、AD3、D10000，另有围栏里的 D3。

```sh
"$NODE" "$LAB/reproduce.mjs" B3-boundary
```

[完整输出](codex-lab/logs/B3-boundary.txt)。关键输出（摘录）：

```text
exit=0
ok   decision numbers are unique and every one cited exists (A4)
```

### B4-crlf

先 init+提交 LF 项目，再执行真实 `git clone -c core.autocrlf=true --no-local`。先 check/update，再用仅含 history 的 profile 隔离验证追加 CRLF dated erratum。未改引擎。

```sh
"$NODE" "$LAB/reproduce.mjs" B4-crlf
```

[完整输出](codex-lab/logs/B4-crlf.txt)。关键输出（摘录）：

```text
exit=0
Cloning into '<lab>/cases/B4-crlf-clone-1795596675127'...
autocrlf: true
CRLF in axioms: true
CRLF in git blob: false
exit=1
FAIL core files are the pinned version (A4, A6): 4
       docaxioms/AXIOMS.lock.md: not the pinned version (it comes from docaxioms; change it there, then update)
       docaxioms/GARDEN.md: not the pinned version (it comes from docaxioms; change it there, then update)
       docaxioms/GUIDE.md: not the pinned version (it comes from docaxioms; change it there, then update)
       docaxioms/LICENSE: not the pinned version (it comes from docaxioms; change it there, then update)
exit=1
docaxioms/AXIOMS.lock.md was changed in the project: take that change to docaxioms first
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
```

### B4-lf-control

对照：LF 历史文件追加 `\n## Erratum 2026-11-25\n\nA dated correction.\n`。

```sh
"$NODE" "$LAB/reproduce.mjs" B4-lf-control
```

[完整输出](codex-lab/logs/B4-lf-control.txt)。关键输出（摘录）：

```text
exit=0
ok   a history file changes only in link targets, or grows by a dated erratum (A5)
```

### B5-overlap

plan 仅链接 alpha.md；a.md 仅经 research/README 可达，两个研究页都有 Status。未给 a.md 建开放计划链接。

```sh
"$NODE" "$LAB/reproduce.mjs" B5-overlap
```

[完整输出](codex-lab/logs/B5-overlap.txt)。关键输出（摘录）：

```text
exit=0
ok   open research is linked from an open item; history carries its banner (A3, A5)
alpha.md contains a.md: true
```

### B5-plain

a.md 经 docs/README 可达；plan 只有普通散文 `Discuss a.md later.`，无研究链接。

```sh
"$NODE" "$LAB/reproduce.mjs" B5-plain
```

[完整输出](codex-lab/logs/B5-plain.txt)。关键输出（摘录）：

```text
exit=0
ok   open research is linked from an open item; history carries its banner (A3, A5)
```

### B5-inline-control

与前例相同，但计划仅在行内代码里写文件名 a.md；它被 withoutCode 移除。

```sh
"$NODE" "$LAB/reproduce.mjs" B5-inline-control
```

[完整输出](codex-lab/logs/B5-inline-control.txt)。关键输出（摘录）：

```text
exit=1
FAIL open research is linked from an open item; history carries its banner (A3, A5): 1
       docs/research/a.md: no open item links to it
```

### B6-code

手动创建 src/index.mjs（只有 export const x=1，不含 D1）；active D1 的 landing 指向该文件。

```sh
"$NODE" "$LAB/reproduce.mjs" B6-code
```

[完整输出](codex-lab/logs/B6-code.txt)。关键输出（摘录）：

```text
exit=0
ok   a decision names where it landed, and that passage names it (A0, A4)
```

### B6-dir

active D1 的 landing 是 `[landing](.)`，指向 docs 目录。

```sh
"$NODE" "$LAB/reproduce.mjs" B6-dir
```

[完整输出](codex-lab/logs/B6-dir.txt)。关键输出（摘录）：

```text
exit=0
ok   a decision names where it landed, and that passage names it (A0, A4)
```

### B6-md-control

对照：active D1 指向 README.md，正文不含 D1。

```sh
"$NODE" "$LAB/reproduce.mjs" B6-md-control
```

[完整输出](codex-lab/logs/B6-md-control.txt)。关键输出（摘录）：

```text
exit=1
FAIL a decision names where it landed, and that passage names it (A0, A4): 1
       D1: ../README.md does not name D1
```

### B6-root

docs/index.md 链接 /docs/design.md；实际 docs/design.md 存在，并另从 docs/README 正确可达。脚本打印实际解析 path。

```sh
"$NODE" "$LAB/reproduce.mjs" B6-root
```

[完整输出](codex-lab/logs/B6-root.txt)。关键输出（摘录）：

```text
exit=1
FAIL links and anchors resolve (A2, A4): 1
       docs/index.md: /docs/design.md leads nowhere
resolved: [{"target":"/docs/design.md","path":"docs/docs/design.md"}]
```

### B6-query

根 README 链接 docs/design.md?plain=1；docs/design.md 实际存在且另有真实入口链接。

```sh
"$NODE" "$LAB/reproduce.mjs" B6-query
```

[完整输出](codex-lab/logs/B6-query.txt)。关键输出（摘录）：

```text
exit=1
FAIL links and anchors resolve (A2, A4): 1
       README.md: docs/design.md?plain=1 leads nowhere
```

### B7-slash

直接调用导出的 `init(root + "/", "c1")`；同时检查实际磁盘两个文件名。独立运行已记录 exit 0。

```sh
"$NODE" "$LAB/reproduce.mjs" B7-slash
```

[完整输出](codex-lab/logs/B7-slash.txt)。关键输出（摘录）：

```text
Node API 进程 exit=0（另见 B7-slash-standalone.txt）
init return: ["GENTS.md","LAUDE.md","URRENT.md","ocs/README.md","ocs/decisions.md","ocs/history/README.md","ocs/log.md","ocs/plan.md"]
AGENTS.md exists: true
GENTS.md exists: false
```

### B7-empty

将 CURRENT.md 与 README.md 置零字节，先 garden JSON；再设 maxLines=0.5 隔离展示两个检查使用的计数。0.5 仅为实验探针，不声称这是推荐合法预算；配置当前没有整数 schema 校验。

```sh
"$NODE" "$LAB/reproduce.mjs" B7-empty
```

[完整输出](codex-lab/logs/B7-empty.txt)。关键输出（摘录）：

```text
garden --json, exit=0
{
  "stageCard": {
    "file": "CURRENT.md",
    "lines": 1,
    "chars": 0
  },
  "README": {
    "file": "README.md",
    "lines": 1,
    "chars": 0,
    "pins": 0,
    "mappedCode": []
  }
}
check, exit=1
FAIL the stage card stays a card (A3): 1
       CURRENT.md: 1 lines, at most 0.5
FAIL bounded documents stay within budget (A3, M4): 1
       README.md: 1 lines, at most 0.5
```

### A-notes

默认 init 无 Git；普通和 strict 检查；随后 git init+提交，但仍无 origin/main，再 strict。

```sh
"$NODE" "$LAB/reproduce.mjs" A-notes
```

[完整输出](codex-lab/logs/A-notes.txt)。关键输出（摘录）：

```text
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: no commit to compare with (not a git repository, or no commits yet); nothing was compared
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: no commit to compare with (not a git repository, or no commits yet); nothing was compared
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: base "origin/main" not found, or it shares no history with HEAD; fell back to HEAD (committed changes are not compared)
```

### A-shallow

main 有已提交正常历史/源码，feature 提交历史改写和源码变化。完整 refs 下 strict 先失败；depth=1 只克隆 feature 后 strict 只有 note 并成功；再增加未提交历史修改重新 strict。

```sh
"$NODE" "$LAB/reproduce.mjs" A-shallow
```

[完整输出](codex-lab/logs/A-shallow.txt)。关键输出（摘录）：

```text
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
aid  code changes with mapped documents untouched (A2, A6, M2): 1
       README.md: review after code change in src/a.mjs
exit=0
Cloning into '<lab>/cases/A-shallow-clone-1795596679291'...
shallow: true
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: base "origin/main" not found, or it shares no history with HEAD; fell back to HEAD (committed changes are not compared)
note code changes with mapped documents untouched (A2, A6, M2)
       note: base "origin/main" not found, or it shares no history with HEAD; fell back to HEAD (committed changes are not compared)
exit=1
FAIL a history file changes only in link targets, or grows by a dated erratum (A5): 1
       docs/history/old.md: changed other than in a link target, or grew other than by a dated erratum at its end
       note: base "origin/main" not found, or it shares no history with HEAD; fell back to HEAD (committed changes are not compared)
note code changes with mapped documents untouched (A2, A6, M2)
       note: base "origin/main" not found, or it shares no history with HEAD; fell back to HEAD (committed changes are not compared)
```

### A-codeExtensions

源码写注释 docs/missing.md。先默认空 codeExtensions，再启用 .mjs；其余文件完全相同。

```sh
"$NODE" "$LAB/reproduce.mjs" A-codeExtensions
```

[完整输出](codex-lab/logs/A-codeExtensions.txt)。关键输出（摘录）：

```text
default code: []
exit=0
exit=1
FAIL documents named in code exist (A2, A7): 1
       src/a.mjs: docs/missing.md
```

### A-pin-preview

README 同时有 15 行范围的无 hash pin 和整文件无 hash pin；先裸 write，再 write --all。

```sh
"$NODE" "$LAB/reproduce.mjs" A-pin-preview
```

[完整输出](codex-lab/logs/A-pin-preview.txt)。关键输出（摘录）：

```text
exit=1
pin --write requires an explicit scope (--file <doc>, --pin <doc:line>, or --all) so changed pins are only refreshed after review (A7); use --relocate for unchanged line shifts
exit=0
wrote README.md:3 src/a.txt#L1-L15 (@a5190eb48d9a)
       1 | line 1
       2 | line 2
       3 | line 3
       4 | line 4
       5 | line 5
       6 | line 6
       7 | line 7
       8 | line 8
       9 | line 9
       10 | line 10
       11 | line 11
       12 | line 12
       ... (+3 more lines)
wrote README.md:4 src/a.txt (@bf767ef1fad9)
```

### A-guards

预先有 AGENTS=MINE；init 后读回并检查 axioms mode；重复 init；另对含自有 docaxioms/mine.txt 的目录 init。

```sh
"$NODE" "$LAB/reproduce.mjs" A-guards
```

[完整输出](codex-lab/logs/A-guards.txt)。关键输出（摘录）：

```text
exit=0
preserved: "MINE\n"
mode: 444
exit=1
the project has a docaxioms.json: use update
exit=1
the project has a docaxioms/ folder of its own
```

### A-tamper

仅在 fixture chmod+追加 axioms 内容，check；再同步改 fixture profile 的对应 hash，check。

```sh
"$NODE" "$LAB/reproduce.mjs" A-tamper
```

[完整输出](codex-lab/logs/A-tamper.txt)。关键输出（摘录）：

```text
exit=1
FAIL core files are the pinned version (A4, A6): 1
       docaxioms/AXIOMS.lock.md: not the pinned version (it comes from docaxioms; change it there, then update)
exit=0
```

### A-withdrawn

active D1 无 landing，check；只改状态为 withdrawn，再 check。

```sh
"$NODE" "$LAB/reproduce.mjs" A-withdrawn
```

[完整输出](codex-lab/logs/A-withdrawn.txt)。关键输出（摘录）：

```text
exit=1
FAIL a decision names where it landed, and that passage names it (A0, A4): 1
       D1: no landing passage
exit=0
```

### A-pin-motion

L1-L2 pin 对应 alpha/beta；在上方加 header，check；relocate，check；最后改覆盖内容的一个前导空格，再 check。

```sh
"$NODE" "$LAB/reproduce.mjs" A-pin-motion
```

[完整输出](codex-lab/logs/A-pin-motion.txt)。关键输出（摘录）：

```text
exit=1
FAIL code pins match the current source (A2, A6, A7): 1
       README.md:3: src/a.txt#L1-L2 moved to #L2-L3 (identical hash @bbfb79e82216; verify and run pin --relocate)
exit=0
moved README.md:3 src/a.txt#L1-L2 -> #L2-L3 (@bbfb79e82216 unchanged)
       2 | alpha
       3 | beta
new pin: # Demo
<!-- pin: src/a.txt#L2-L3@bbfb79e82216 -->
exit=0
ok   code pins match the current source (A2, A6, A7)
exit=1
FAIL code pins match the current source (A2, A6, A7): 1
       README.md:3: src/a.txt changed (pinned @bbfb79e82216, now @90b48519e2ce)
```

### M-json-schema

README 有行内 make missing；先把 commands 拼成 commmands 并加未知 inventedKey，再纠正 commands；分别 check --json，另跑 garden --json。

```sh
"$NODE" "$LAB/reproduce.mjs" M-json-schema
```

[完整输出](codex-lab/logs/M-json-schema.txt)。关键输出（摘录）：

```text
调用 1，exit=0
{
  "name": "commands named in current documents exist",
  "axioms": "A2, A7",
  "level": "gate",
  "problems": [],
  "notes": []
}
调用 2，exit=1
{
  "name": "commands named in current documents exist",
  "axioms": "A2, A7",
  "level": "gate",
  "problems": [
    "README.md:3: `make missing` is not defined"
  ],
  "notes": []
}
调用 3，exit=0
{
  "stageCard": {
    "file": "CURRENT.md",
    "lines": 15,
    "chars": 224
  },
  "descriptions": [
    {
      "file": "AGENTS.md",
      "lines": 11,
      "chars": 552,
      "pins": 0,
      "mappedCode": []
    }
  ]
}
```

### M-commands-fence

配置允许 make test；README 先只有 bash fence 中 make missing，再加行内 make missing。

```sh
"$NODE" "$LAB/reproduce.mjs" M-commands-fence
```

[完整输出](codex-lab/logs/M-commands-fence.txt)。关键输出（摘录）：

```text
exit=0
ok   commands named in current documents exist (A2, A7)
exit=1
FAIL commands named in current documents exist (A2, A7): 1
       README.md:7: `make missing` is not defined
```

### M-missing-cli

直接调用 demo、check --changed-only、check --format sarif、check --require-base、mcp。

```sh
"$NODE" "$LAB/reproduce.mjs" M-missing-cli
```

[完整输出](codex-lab/logs/M-missing-cli.txt)。关键输出（摘录）：

```text
exit=1
usage:
  docaxioms check  [--root <dir>] [--report] [--strict-aids] [--json]
  docaxioms pin    [--root <dir>] [--relocate] [--write (--file <doc> | --pin <doc:line> | --all)]
  docaxioms garden [--root <dir>] [--json]
  docaxioms init   <project>
  docaxioms update <project> [--accept-axioms]
exit=1
Unknown option '--changed-only'
exit=1
Unknown option '--format'
exit=1
Unknown option '--require-base'
exit=1
usage:
  docaxioms check  [--root <dir>] [--report] [--strict-aids] [--json]
  docaxioms pin    [--root <dir>] [--relocate] [--write (--file <doc> | --pin <doc:line> | --all)]
  docaxioms garden [--root <dir>] [--json]
  docaxioms init   <project>
  docaxioms update <project> [--accept-axioms]
```

### M-init-detect

现有目录有 package.json scripts.verify 与 Makefile test；init 后打印实际 profile，观察未自动填充扩展和 commands。

```sh
"$NODE" "$LAB/reproduce.mjs" M-init-detect
```

[完整输出](codex-lab/logs/M-init-detect.txt)。关键输出（摘录）：

```text
exit=0
profile.codeExtensions = []
profile.commands: absent
```

### M-init-link

现有 README 含 [Missing](docs/missing.md)，init 保留它；未增加任何配置，直接 check。

```sh
"$NODE" "$LAB/reproduce.mjs" M-init-link
```

[完整输出](codex-lab/logs/M-init-link.txt)。关键输出（摘录）：

```text
exit=0
exit=1
FAIL links and anchors resolve (A2, A4): 1
       README.md: docs/missing.md leads nowhere
```

### M-aid-report

启用 evolutionary used to，README 含此语句；依次普通、strict、strict+report；最后把 profile 改成非法 JSON 再 report。

```sh
"$NODE" "$LAB/reproduce.mjs" M-aid-report
```

[完整输出](codex-lab/logs/M-aid-report.txt)。关键输出（摘录）：

```text
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: no commit to compare with (not a git repository, or no commits yet); nothing was compared
aid  current descriptions use evolutionary phrasing (A3, M1, M2): 1
       README.md:3: contains "used to" (state what is now, or mark past behaviour as a record)
exit=1
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: no commit to compare with (not a git repository, or no commits yet); nothing was compared
aid  current descriptions use evolutionary phrasing (A3, M1, M2): 1
       README.md:3: contains "used to" (state what is now, or mark past behaviour as a record)
exit=0
note a history file changes only in link targets, or grows by a dated erratum (A5)
       note: no commit to compare with (not a git repository, or no commits yet); nothing was compared
aid  current descriptions use evolutionary phrasing (A3, M1, M2): 1
       README.md:3: contains "used to" (state what is now, or mark past behaviour as a record)
exit=1
Expected property name or '}' in JSON at position 1 (line 1 column 2)
```

### M-concurrency

仅在 fixture Git 中开两个分支，都给同一 decision 表追加不同内容的 D1；实际执行 merge。只证明存在冲突条件，不证明普遍频率。

```sh
"$NODE" "$LAB/reproduce.mjs" M-concurrency
```

[完整输出](codex-lab/logs/M-concurrency.txt)。关键输出（摘录）：

```text
exit=1
Auto-merging docs/decisions.md
CONFLICT (content): Merge conflict in docs/decisions.md
Automatic merge failed; fix conflicts and then commit the result.
```

### M-semantic

active D1 的 landing 指向完全无关的 README 正文，但正文包含字面 D1。

```sh
"$NODE" "$LAB/reproduce.mjs" M-semantic
```

[完整输出](codex-lab/logs/M-semantic.txt)。关键输出（摘录）：

```text
exit=0
ok   a decision names where it landed, and that passage names it (A0, A4)
```

### M-suggestions

按 B443 的逐行 regex 删除 Python 多行字符串数据行的尾空格，分别实际运行两份 Python；另测指南 profile 段字节与报告算术。

```sh
"$NODE" "$LAB/reproduce.mjs" M-suggestions
```

[完整输出](codex-lab/logs/M-suggestions.txt)。关键输出（摘录）：

```text
exit=0
'a  \nb'
exit=0
'a\nb'
old/new hashes: d0d63d20d3b9 ed86eecb1326
GUIDE profile section bytes: 1983
template total bytes: 11592 GUIDE percent: 61.171497584541065
bootstrap total bytes: 20700
template budget-chain chars: 20816
```

### M-metadata

直接读文件 bytes/string.length、受跟踪清单、精确 level 属性行号，以及调用原始 check() 查看运行时检查总数；没有模拟算法。

```sh
"$NODE" "$LAB/reproduce.mjs" M-metadata
```

[完整输出](codex-lab/logs/M-metadata.txt)。关键输出（摘录）：

```text
整组复现进程 exit=0
runtime: v22.23.5 darwin arm64
HEAD: 8336bed3bbcfc7ff99a01fb9549142c7260a5aa9
bytes/chars templates/AGENTS.md 552 552
bytes/chars core/AXIOMS.lock.md 3460 3460
bytes/chars core/GUIDE.md 7091 7091
bytes/chars templates/CURRENT.md 224 224
bytes/chars templates/docs/README.md 265 265
bytes/chars core/GARDEN.md 2346 2346
bytes/chars README.md 6971 6969
bytes/chars AGENTS.md 832 832
bytes/chars core/LICENSE 1065 1065
bytes/chars templates/CLAUDE.md 11 11
tracked: 32 engine-files: 7 engine-bytes: 64606
gate [
  262, 293, 304, 325,
  355, 371, 401, 409,
  433, 461, 482, 514,
  530, 550
]
aid [ 588, 627 ]
runtime check count: 16 gates: 14 aids: 2
exports: check, decisionRows, descriptionDocs, extractLinkTargets, findRelocatedWindows, formatPinComment, gardenManifest, hashSourceSlice, init, inspectPins, packageVersion, parseMarkdown, parsePinComment, project, source, syncPins, update, verifyPins, withoutFences
exists action.yml false
exists action.yaml false
exists .github/workflows/check.yml true
exists Dockerfile false
exists .gitattributes false
exists .agents/skills false
templates: templates/AGENTS.md, templates/CLAUDE.md, templates/CURRENT.md, templates/docaxioms.json, templates/docs/README.md, templates/docs/decisions.md, templates/docs/history/README.md, templates/docs/log.md, templates/docs/plan.md
```

## 8. 完成清单与证据限制

1. **已完成**：七项推测的各分支、对照输入、实际 CLI/API 行为、退出码与报告细节纠正；42 个实验块与 70 次子进程调用均已逐项核对预期退出码，未将任何异常中断当作目标 gate 的失败。
2. **已完成**：A 的重点 P0/默认值/写 pin/预览/计数；B 的逐文件字节、顺序阅读约定、八项缺失功能；其余源码事实及未来方案中的事实基础已按出处登记。
3. **已完成**：本地 tarball/独立 consumer 导入、Node 22 下 102 项现有测试、自检，以及原仓库 34 个文件的内容指纹比对。原仓库 HEAD 与未跟踪文件清单未变。
4. **不适用/未冒称已做**：原始旧 ZIP/bundle 未提供；Windows/Linux 实机、真实项目误报频率、代理 token A/B、外部 Release/使用数据与竞品/论文真实性没有在本次验证。已用可执行的 Git CRLF 条件见证补足可在本机完成的部分，没有把“待实机验证”当作停止本地调查的理由。

现有测试成功只证明这些测试的断言通过；fixture 见证证明特定配置和输入下的行为。两者都不自动证明作者给出的严重度、普遍频率、修复工作量或候选补丁的正确性。

## 9. 对后续迭代最有价值的 5 条（按收益/成本）

这里的成本是依据当前改动边界的相对判断，没有把报告的行数/工时估算当成测量结果；五项均不授权本次修改源码。

| 顺位 | 迭代项 | 收益与成本判断 | 与两份报告不同的意见及理由 |
|---|---|---|---|
| 1 | **统一现行描述的 paths 扫描作用域**，明确是否另含 stage card，并保留必要豁免/已消失路径契约 | 默认初始化就可复现，容易阻断正常日志/计划；已有 descriptionDocs，改动边界小，收益/成本最高。用计划、日志、研究、旧决策和真实 K3 错路径共同验证。 | 同意 B1 根因；不接受“见到旧记录就改写它”的修复。先收紧 authoritative 扫描集，不堆每种文档的临时豁免。stage card 是否纳入应明说，不能把它悄悄从所有路径保护中排除。 |
| 2 | **修正 history 的“只有 URL 可变”比较边界**，保留 label/title/正文、支持引用定义和平衡括号，补正反见证 | 影响明确的 A5 承诺，同时有绕过与误报；比第一项成本高，但可信度收益大。已有 parser 可复用，必须验证原始偏移与实际 URL 区间。 | 同意 B2 是真问题；不把正则擦除范围说成任意全文改写，也不接受“上 AST 就零绕过/110 行够了”的承诺。A 的“防篡改”应写成可被有写权主体改变的机械比对边界。 |
| 3 | **先做 profile 已知键/类型/正则的早期校验**，让拼错配置明确失败 | 已有 commmands 静默关闭检查的真实见证；局部入口处理可阻止一类无效配置，成本低至中。扩展键和 projectChecks 的兼容约定须先定义。 | 同意 schema 价值；反对以“当前没有结构化 JSON”为理由重写输出。现有 check 对象已可用，应增补 finding 的稳定字段；SARIF/MCP 等待实际集成需求，不先扩接口面。AD-7 的本仓库阻断升级仍须遵守原约定。 |
| 4 | **明确文本 pin 的换行契约并统一贯彻 check/manage/history**，以 LF blob/CRLF checkout 场景验证 | 四个 core 文件及正常勘误都能误报；跨平台团队一旦命中即阻断。可选择明确字节约束配合 Git 属性，或有版本/迁移说明的规范化，成本中等。 | 同意 B4 根因；不接受“所有 Windows 默认必然如此”或“随处加归一化就完全兼容”。须把原始 byte identity、规范化文本 identity、旧 pin 的兼容方式区分清楚；命名区域/忽略空白不能替代这个问题。 |
| 5 | **让默认 decision 前缀避开 D1/D2/D3 等普通术语，并说明现有项目的迁移范围** | 模板默认即命中常见名字，修改新初始化的默认值成本小；无需先引入目录式 ADR 或更复杂解析。验证独立术语、真实 ID、边界标识符和已知行。 | 同意 B3 的见证；“高频”“必然关闭 gate”仍无实证。只调整新模板不会自动修好现有 D profile，应说明而非静默重写 owner 记录。目录式 ADR 可后做，不能许诺它消除所有 worktree 冲突。 |

research 的真实链接关联、非 Markdown landing 契约和 init 返回名可在随后的小修中分别处理；它们不需要先上单二进制、常驻 MCP 或默认去空白 hash。特别不同意 B443–445 的普适语义安全承诺：本次 Python 多行字符串实跑已经给出反例。阅读链可瘦身，但先修明确的机械边界，实际 token 收益再通过会话实验判断。
