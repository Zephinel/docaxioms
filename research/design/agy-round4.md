# 《全流程文档系统方案》第四轮独立复审（agy-round4）

复审基线：独立通读 `research/全流程文档系统方案.md`（当前 468 行版）与 `research/design/brief.md`，逐行核对 `src/`、`bin/docaxioms.mjs`、`templates/`、`core/`、`docs/decisions.md`、`docaxioms.json`、`package.json`、`.github/workflows/check.yml` 及 `test/*.test.mjs`，不沿用第三轮结论。

---

## 全局最高优问题速览（P0–P1）

1. **【P0｜内部死锁】** “治理变更通道只允许改白名单文件”（`全流程文档系统方案.md:72`）在启用新规则/升级检查器同时需修违规文档、或重命名目录需同步改 `gonePaths`/`codeToDocs` 时会 **100% 自锁**。
2. **【P0｜过度设计+违背 A3/M4/A7】** 本地预写事件日志（序号+校验和+尾部隔离+恢复凭据拒写，`L147-195`）与“汇总视图全部不入库”（`L282, L314-318`）用极高机制复杂度去解低频或拦不住的问题，反而破坏纯文本仓库自足性并制造 Ctrl+C 假中断锁死。
3. **【P1｜设计击穿源码机制】** 条目 ID 改为裸 `<日期-slug>`（`L304, L332`）后，现有全文/源码决策引用扫描（`src/check.mjs:311`）失去前缀词法边界，无法检出拼错的决策引用。
4. **【P1｜平台事实高估】** GitHub `on: pull_request` 实际执行**候选分支**的 workflow，且个人账号仓库（如 `Zephinel/docaxioms`）物理上没有 Merge Queue 与组织级 Required Workflows（`L48, L74, L400`）。

---

## 一、事实错误（对照源码逐条核实，按严重度排序）

### 1. 【P1】新旧方案残留打架：声称关闭任务会“追加 log”，但后文已废除入库 `log.md`
- **出处**：`research/全流程文档系统方案.md:202` vs `L309, L314`
- **核实**：L202 写“关闭任务时会追加 log、归档任务页，这会产生一棵新树 T₂”；但 L309、L314 已将完成日志改为“从任务关闭记录按需生成、不入库的视图（取代 log.md）”。属于改稿未删净的前后事实冲突。
- **修改建议**：L202 改为“关闭任务时会在任务页写入关闭记录并移入 `history/`，这会产生一棵新树 T₂”。

### 2. 【P1】误述 `CLAUDE.md` 在现有引擎中的豁免范围
- **出处**：`research/全流程文档系统方案.md:259`（“现在只有模板里手工豁免了 `CLAUDE.md`；入口、规则、技能多了以后，不排除就会误报”）
- **核实**：对照 `templates/docaxioms.json:14-16` 与 `src/garden.mjs:10`，`CLAUDE.md` **仅从 `garden` 清单中豁免**，并未从 `p.currentDocs`（`src/check.mjs:107`）或 `descriptionDocs(p)`（`src/check.mjs:238-256`）排除。它目前仍被 `links`（`L294`）、`decision numbers`（`L314`）、`paths`（`L383`）、`commands`（`L415`）、`evolutionary`（`L631`）和 `inspectPins`（`src/pins.mjs:117`）全量扫描，只是因为内容仅 `@AGENTS.md` 才未触发报错。此外 `reachable`（`src/check.mjs:474`）只扫匹配 `^docs/` 的文档，若适配器把文件生成在 `docs/` 下还会触发不可达报错。
- **修改建议**：写准现状——当前 `templates/docaxioms.json` 仅豁免了 `garden`；生成物排除机制必须同时作用于 `descriptionDocs`、`currentDocs` 中的路径/命令/决策扫描及 `reachable` 边界。

### 3. 【P1】对符号链接源码现状的描述漏掉了“已过滤末级文件，但未防父目录符号链接”
- **出处**：`research/全流程文档系统方案.md:90`（“按 Git 树里的对象类型判断符号链接……当前 `has()` 用 `existsSync`，会跟随符号链接”）
- **核实**：`src/check.mjs:90-91` 与 `L101` 在构建 `p.all` 时已执行 `!lstatSync(at(file)).isSymbolicLink()` 排除了末级文件 symlink；真正的源码漏洞在于：① `has()`（`L77`）和 `read()`（`L74`）对链接/pin 目标未查 symlink；② **当中间父目录是符号链接时**，对末级路径调 `lstatSync`（或只看 Git 树叶节点对象类型）仍会看到普通文件（mode `100644`），从而绕过检查。
- **修改建议**：G05 改为“解析目标路径时**逐层**检查路径分量（Git 树中不允许经过任何 mode `120000` 条目；工作树模式下校验 `realpathSync` 仍在仓库根内）”。

### 4. 【P2】对“链接一个目录”现有源码行为的概括失真
- **出处**：`research/全流程文档系统方案.md:317`（“现在链接一个目录，只会展开成它的 README.md”）
- **核实**：现有三处检查对目录链接的行为并不一致：
  1. 可达性 `src/check.mjs:467`：展开成 `${path}/README.md`；
  2. 链接有效性 `src/check.mjs:295`：`p.has(path)` 只要目录存在就直接通过，**即使目录内没有 `README.md` 也不报错**；
  3. 决策落地点 `src/check.mjs:500-501`：因目录不以 `.md` 结尾，直接 `continue` 跳过反向引用校验（缺陷 9）。
- **修改建议**：改为“现在**可达性检查**遇到目录链接只会展开成它的 `README.md`（而链接检查只要目录存在即放行，落地点检查直接跳过）”。

### 5. 【P2】把新方案的“任务页”误写成现有模板原文
- **出处**：`research/全流程文档系统方案.md:465`（“模板的顺序是：公理、GUIDE、`CURRENT.md`、任务页”）
- **核实**：`templates/AGENTS.md:3-7` 第 4 项原文是 `Only the task-relevant pages linked from [docs/README.md](docs/README.md)`，而 `templates/docs/README.md:3-6` 只有 `decisions.md`、`plan.md`、`log.md`、`history/README.md`，现有模板并无“任务页”概念。
- **修改建议**：改为“模板的顺序是：公理、GUIDE、`CURRENT.md`、从 `docs/README.md` 链接的任务相关文档”。

### 6. 【P2】预算行数的源码行为描述漏掉了 `trimEnd()` 吞尾部空行
- **出处**：`research/全流程文档系统方案.md:132`（“当前预算按 UTF-16 的 `length` 计数，空文件算 1 行”）
- **核实**：`src/check.mjs:519, 538` 与 `src/garden.mjs:15, 35` 写的是 `text.trimEnd().split("\n").length`。不仅空文件算 1 行，纯空白/多换行文件（如 `"\n\n\n"`）也算 1 行，且末尾所有空行在算行数时被吞掉、算字符数（`text.length`）时却保留。
- **修改建议**：补全为“当前行数先 `trimEnd()` 再按 `\n` 切分（空文件或纯换行算 1 行，尾部空行不计行却计 UTF-16 `length`）”。

---

## 二、设计上的内部矛盾、与公理及 AD-1..AD-7 的冲突（按严重度排序）

### 1. 【P0｜机制死锁】治理变更通道“只允许改治理白名单文件”与“用候选策略自检”自相锁死
- **出处**：`research/全流程文档系统方案.md:69-75`
- **矛盾推演**：
  1. 当升级 `docaxioms`（修掉漏检 bug）或在 `docaxioms.json` 收紧 `budgets` / 新增规则时，仓库现有文档往往存在首次暴露的违规项：若只许改白名单文件，**候选策略自检必败**；若顺手在同 PR 修掉违规文档，**违反白名单互斥规则被拒**——陷入先有鸡还是先有蛋的死锁。
  2. 日常重构把目录 `src/old/` 迁为 `src/new/` 时，按 `core/GUIDE.md:15, 59` 应同任务更新文档与 `docaxioms.json` 的 `gonePaths` / `codeToDocs`。强制路径互斥会把一次原子重构强拆成两个串行 PR；若旧策略恰好引用了被删文档路径，拆成两个 PR 也会死锁。
- **修改建议**：取消“只允许改白名单文件”的互斥限制。简化为：未改治理白名单文件的 PR 用基线策略验收；**凡改动了治理白名单文件的 PR，强制要求 L4 owner 审批，并用候选策略 + 候选检查器对整棵候选树 `T` 完整验收通过**。

### 2. 【P0｜违背 A3 / M4】废除全部入库汇总表且 `CURRENT.md` 不列任务，破坏纯文本仓库自足可达性
- **出处**：`research/全流程文档系统方案.md:168, 282, 314-316` vs `core/AXIOMS.lock.md:12, 24`（A3、M4）、`core/GUIDE.md:38`
- **冲突点**：A3 与 M4 要求读者仅凭从入口可达的有限阅读量即可掌握现状。在 `full` 档中，`CURRENT.md` 不列任务，`plan.md`、`decisions.md`、`log.md` 全部不入库；任何不运行 CLI 的读者（GitHub 网页审查者、未装 Node 的协作者、只读文件工具）要知道“当前有哪些生效决策或开放任务”，必须逐个点开 `docs/decisions/*.md` 与 `docs/tasks/*.md` 全量遍历，直接违背 M4（有界阅读）。L316 引用 A6 写明代价不能消解设计本身对 A3/M4 的违背（A6 约束的是检查谓词的边界声明，不是放弃文档可读性的免责条款）。
- **修改建议**：见第三节替代方案 2。

### 3. 【P1｜与 AD-2 单测及 `core/GUIDE.md` 冲突】一份简短 `GUIDE.md` 无法同时编码两套相反动作，且新术语易撞单测红线
- **出处**：`research/全流程文档系统方案.md:275-276, 449-450` vs `core/GUIDE.md:13-22, 56`、`test/check.test.mjs:353-356`
- **冲突点**：
  1. 现行 `core/GUIDE.md` 写死了单表行操作（`L13: then a row`、`L14: The status of the old row`）、单文件计划删项（`L20: Delete the item`）和阶段卡记活跃任务（`L21: What is active, what is next`），这与 `full` 档“一事一文件只追加、不入库视图、`CURRENT.md` 禁列任务”是**相反动作**。若在 `GUIDE.md` 并列写两套规程，直接膨胀核心必读文件（违背 A3）。
  2. `test/check.test.mjs:355` 对 `core/*` 执行强正则拦截：禁止 `\bgit\b`、任何 `\b[A-Z]{1,3}\d{2,}\b`（**包括 `G01`–`G22`、`K10`、`L0` 等编号若达两位数字即挂**）及 `\bAD-`。修订 `core/GUIDE.md` 时若写入门禁编号 `G01`–`G22` 或小写 `git` 会直接导致测试失败。
- **修改建议**：收敛 `minimal` 与 `full` 的核心动作差异（见第三节替代方案 2）；并在方案中注明 `core/` 严禁出现 `G01`–`G22` 等字母加多位数字代号及 `git` 字样（`test/check.test.mjs:355`）。

### 4. 【P1｜与 A5 / M1 / GARDEN 冲突】把“决策演进（supersede）”混同为“过去记录勘误（erratum）”，且 G13 漏保 `reviews/`
- **出处**：`research/全流程文档系统方案.md:92, 308, 311` vs `core/AXIOMS.lock.md:14, 21`（A5、M1）、`core/GARDEN.md:13`
- **冲突点**：
  1. `core/GARDEN.md:13` 明确将生效中的 owner 决策归为 **K2（规范）**，而定稿 L308 将 `decisions/` 标为纯 **K1**；同时 A5 的勘误（erratum）针对的是“过去记录在当时就写错了（`may have been wrong then`）”，而旧决策被新决策推翻是**规范随时间演进**，并非原记录失实。把状态变更硬塞进 G13 的“末尾说明”通道混淆了 K1 事实勘误与 K2 效力状态。
  2. 定稿 L311 将 `reviews/` 定义为 K1，但 L92 的 G13 受保护列表只写了 `（history、decisions/、关闭记录）`，**漏掉了留在现行目录下的 `reviews/`**。
- **修改建议**：决策文件标为“K1 授权记录 + K2 规范效力”；G13 按文档声明的 K1 集合统一保护（纳入 `reviews/`，以及 `minimal` 档的 `log.md`）。

---

## 三、错误裁决与过度设计（附更简替代，按严重度排序）

### 1. 【P0｜严重过度设计】本地恢复采用“预写意图事件日志（序号+校验和+尾部隔离）+ checkpoint + 恢复凭据阻断写入”
- **出处**：`research/全流程文档系统方案.md:147-163, 177-195`
- **问题诊断**：
  1. **地基不成立**：L46、L163、L195、L230 已承认 shell 写入、持久终端（`write_stdin`）、Ctrl+C、钩子超时 fail-open 和无成对钩子的工具都会绕过或中断日志。
  2. **高自锁风险（违背 A7）**：在漏水的钩子层上做严格预写意图配对，每次用户按 Ctrl+C、网络抖动或命令超时都会留下“有开始没结束”的假中断记录，阻塞后续写操作，逼人频繁跑“人工清除假未完成命令”（`L162`），最终训练用户关掉钩子。
  3. **无证据价值**：L114 已明确本地跑过的验证不算 G17 证据，真正的代码差异又随时可从 Git 精确读取（`L146`）。造半套 WAL 数据库毫无必要。
- **更简替代**：
  - **砍掉事件日志分片、序号校验和、尾部隔离、checkpoint 和写前恢复凭据锁**。
  - 恢复只做**启动时无状态只读核对**：`SessionStart` / `PreCompact` 调 `docaxioms status --brief`，实时汇总 `git status/diff` + `CURRENT.md` + 活跃任务页（顶多配一个可随时丢弃的单文件 `.docaxioms/last-task.json` 记当前 `taskId`），生成 20 行简报注入上下文。零死锁、零运维命令、全 Agent 通用。

### 2. 【P0｜错误裁决/过度设计】“汇总视图全部不入库 + 静态站补盲 + PR 巨型评论 + 脚手架改旧决策文件 + 目录可达性特批”
- **出处**：`research/全流程文档系统方案.md:282, 308, 314-318, 368`
- **问题诊断**：为了规避尚未证实频率（`调研校验与迭代参考.md:80`）的汇总表冲突，删掉了所有入库索引，结果被迫打上 5 个重型补丁：① CI 发静态页补网页可读性；② PR 评论每次附带全库开放任务与决策表（制造严重 PR 噪音，违背第六节降噪初衷）；③ 脚手架回头修改已冻结的旧决策文件并由 G11/G13 双向校验；④ 放宽目录可达性规则；⑤ 造成 `GUIDE.md` 在 `minimal` 与 `full` 间规则分裂。
- **更简替代**：
  1. **任务与日志靠目录位置自解释，无需生成表**：开放任务在 `docs/tasks/<id>.md`（通常同时只有寥寥数个），关闭时写入验证说明并 `git mv` 到 `docs/history/tasks/`。目录本身即状态，网页与本地一目了然，根本不需要 `plan.md` 和 `log.md` 生成视图。
  2. **决策保留低频入库薄索引（或默认单表）**：Owner 决策是低频事件。中小项目直接保留单表 `docs/decisions.md`（ID 改用 `D-YYYYMMDD-slug` 防撞号即可）；超大项目若拆 `docs/decisions/`，仅维护一张入库的极薄状态表 `docs/decisions/README.md`（由命令生成、G20 校验），旧决策文件真正做到**写完永不再改**，无需脚手架回写末尾、无需静态站、无需 PR 塞总表。

### 3. 【P1｜过度设计】G10、G12、G21 与“受控工作区”超出文档门禁工具边界
- **出处**：`research/全流程文档系统方案.md:53, 91-93, 196, 411-418, 433, 437`
- **问题诊断与更简替代**：
  - **G10（声明级四元组证据账本，`L91`）**：即便 opt-in 也是高摩擦专有耦合格式。**替代**：直接用现有 **G09（code pin）** 锚定源码及 `package.json`/锁文件/配置文件的关键行，删掉 G10。
  - **G12（绑定摘要的内部授权事件模型，`L92`）**：与 L4（GitHub Rulesets + `CODEOWNERS` + `Dismiss stale approvals`）完全重复造轮子。**替代**：删掉独立 CLI 谓词 G12，由 G20 保证 `ownership.md → CODEOWNERS` 生成一致，审批交由托管平台 L4 执行。
  - **G21（审计义务到期阻断合入/发布 + 热修豁免窗口，`L93, L411-418`）**：把只读 `garden` 变成了复杂的工单 SLA 阻断系统。**替代**：删掉 G21 硬阻断，保留契约面变更计数超阈值时自动更新单一去重 `doc-drift` Issue 即可。
  - **受控工作区（OS 权限隔离 + 独立写入代理，`L53, L196, L459`）**：属于容器/IDE 沙箱范畴，非 npm 文档 CLI 职责。**替代**：在 L1/L3 边界说明中提一句“本地更强隔离依赖宿主沙箱”即可，移出项目方案与待决清单。

---

## 四、仍然遗漏或高估的点（按严重度排序）

### 1. 【P1｜关键遗漏】条目 ID 改为 `<日期-slug>` 后，击穿现有全文/源码决策引用校验机制
- **出处**：`research/全流程文档系统方案.md:304, 332` vs `src/check.mjs:150, 311, 489`
- **问题**：现有引擎靠固定前缀加纯数字 `\b${escape(id)}(\d{1,4})\b`（`src/check.mjs:311`）在源码注释和 Markdown 正文里扫描所有决策引用，确保没有悬空/拼错的决策号（G08/G11）。一旦如 L332 写成无前缀的 `<日期-slug>`（如 `2026-11-26-cache-ttl`），引擎在散文与源码中根本无法区分“普通连字符短语/日期”与“写错了拼写的决策 ID 引用”。
- **修改建议**：强制要求条目 ID 保留显式可识别前缀（如 `D-20261126-cache-ttl`、`T-20261126-pin-crlf`），并明确重写 `src/check.mjs:150, 311, 489` 的词法匹配规则（限定前缀 + 日期 + `[a-z0-9-]+`）。

### 2. 【P1｜平台能力高估】高估 GitHub `pull_request` 工作流隔离性与个人仓库的 Merge Queue 可用性
- **出处**：`research/全流程文档系统方案.md:48, 74, 78, 400, 407, 435` vs `.github/workflows/check.yml:3-6`、`package.json:7`
- **问题**：
  1. 在 GitHub Actions 中，`on: pull_request` 运行的是 **PR 分支合并后的候选 workflow 文件**，而非基线分支的 workflow。若没有组织级 Ruleset Required Workflows（免费个人仓不可用），候选 PR 修改 `.github/workflows/check.yml` 即可在 `pull_request` 检查中自报绿灯，此时唯一防线是 L4 `CODEOWNERS` 人工拦住 workflow 改动。
  2. GitHub **Merge Queue 仅支持组织（Organization）公开库或 Enterprise 仓库**，个人命名空间（如当前 `github.com/Zephinel/docaxioms`）根本无法开启 Merge Queue（`merge_group`）。
- **修改建议**：在 L3/L4 与第八节条件中明示这两项平台边界：个人仓库无 Merge Queue 与 Required Workflows，必须依赖分支保护的“Require branches to be up to date before merging”替代合并队列，并靠 `CODEOWNERS` 锁死 `.github/workflows/**`。

### 3. 【P2｜本地能力低估 + 快照盲区】`pre-push` 其实可以检查提交而非工作树；本仓库自身 `docaxioms.json` 与新 G01/G06 不兼容
- **出处**：`research/全流程文档系统方案.md:47, 89-90, 131` vs `docaxioms.json:2-6`、`src/manage.mjs:74-81, 114`
- **问题**：
  1. L47 把“检查读的是工作树，不是提交”列为 `pre-push` 的固有缺陷；但一旦按 L131 实现了快照读取（如 `docaxioms check --commit HEAD`），`pre-push` 完全可以直接检查待推送的 `HEAD` 提交树，消除脏工作树错觉。
  2. 本仓库自己的 `docaxioms.json:2-6` 写的是 `"core": { "files": { "core/AXIOMS.lock.md": "..." } }`（无 `core.dir`，键名带路径斜杠，且只锁 1 个文件），而消费项目锁 `core/` 下全部 4 个 basename 文件且 `src/manage.mjs:114` 拒绝带路径的键名。直接上 G01/G06 会让本仓库自身校验报错。
- **修改建议**：① `pre-push` 改为跑 `--commit HEAD`；② G01/G06 schema 显式定义“上游源仓库模式”与“消费项目模式”（或统一本仓库 `docaxioms.json` 的 `core` 字段结构）。

### 4. 【P2｜运行性能高估】高频工具钩子（`PreToolUse` / `PostToolUse`）每次冷启动 `npx` + Remark AST 会严重拖慢会话
- **出处**：`research/全流程文档系统方案.md:257, 397-398` vs `bin/docaxioms.mjs:11-14`、`src/markdown.mjs:3-10`
- **问题**：单回合 Agent 常触发数十次工具调用。每次走 `npx --no-install docaxioms hook <event>` 并顶层静态导入 `unified` / `remark-parse` / `remark-gfm`，单次冷启动达数百毫秒，整回合累计延迟可达 10–30 秒，且易触发客户端钩子超时放行（L46）。
- **修改建议**：① 适配器配置钩子时配置客户端 `matcher`（仅拦截写文件与 shell 工具，跳过只读工具）；② `bin/docaxioms.mjs` 钩子分支做**延迟动态 `import()` 快路径**——先用零依赖 `node:fs` 判定路径是否受保护，无关操作 <15ms 退出；③ 优先直调本地 `node ./node_modules/docaxioms/bin/docaxioms.mjs` 而非经 `npx` 包装。

### 5. 【P3｜打包遗漏提醒】新增 `adapters/` 需同步白名单 `package.json#files`
- **出处**：`research/全流程文档系统方案.md:240` vs `package.json:21-28`
- **问题**：`package.json:21-28` 使用显式 `"files"` 白名单发布 npm 包，新增顶层 `adapters/` 目录若未写入该数组，打包安装后将丢失全部适配器资源。
- **修改建议**：在实施检查项补一条同步更新 `package.json` 的 `"files"` 并由 `npm pack` 测试验证。
