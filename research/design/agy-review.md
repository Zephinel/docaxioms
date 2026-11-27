以下按**严重度（P0 → P3）**挑错，涵盖 1) 事实错误、2) 四项核心裁决评估、3) 公理 / AD-2 / AD-7 / A0 合规性、4) 遗漏与高估、5) 第四节 7 项冲突联网核实（文末附核实总表与 URL）。未读取或修改任何文件。

---

## P0（阻断级：机制死锁、内部矛盾、公理越界）

### 1. 遗漏/高估：“策略取自基线”存在首次接入与坏策略自锁（Break-glass）死锁
- **位置**：第二节第 3 条、第八节待决第 3 条。
- **问题**：仅规定“策略从基线 B 取，新策略另行批准”，未处理两种必然发生的场景：
  1. **首次接入**：基线 B 尚无 `docaxioms.json` 时如何验收；
  2. **坏策略自锁**：若基线中的 profile 正则写错、豁免失效或升级检查器不兼容，修复策略的 PR 也会被坏掉的旧策略永远拦截，无法合入。
- **修改建议**：补齐两类例外——(a) 首次接入的 bootstrap 规则；(b) **纯策略变更 PR** 走 CODEOWNERS/owner 强制审批 + 以候选策略自检（或显式 break-glass 审批标签），而非被待修复的坏规则死锁。

### 2. 裁决漏洞（裁决 1 & 2）：“生成物入库 + G20 强校验 + 合并队列”产生合并冲突悖论
- **位置**：第三节第 1 条、第五节第 2 条、第六节“降噪”。
- **问题**：初稿裁决把 `CURRENT.md`、`plan.md`、`decisions.md` 全部改为“由分立文件生成并入库，且受 G20 强校验”，同时在第六节宣称“每个决策、每个任务各一个文件，减少多人争改同一张表”。但只要这三份汇总视图**入库且受 G20 校验**，任意两个并行 PR 新增/修改不同任务或决策，都会在 `CURRENT.md` / `plan.md` / `decisions.md` 上产生 **100% Git 冲突**，并反复被合并队列踢出重跑 CI。
- **修改建议**：二选一并在方案中写明代价——
  1. 汇总视图改为**按需/CI 生成不入库**（或发布到静态页/PR 评论）；
  2. 若坚持入库，须承认合并队列热点冲突，配套自动重生成策略（或仅对低频索引启用 G20）。

### 3. 公理 / AD-2 / A0 冲突：M1 分类错位、GUIDE 越界风险、A0 口径打架
- **位置**：第三节第 1 条、第五节第 2 条、第七节第 4 条、第八节第 1/2/6 条。
- **问题**：
  1. **M1 分类冲突**：`docs/decisions.md` 是生成视图却标为 **K2**（规范权威），而决策单文件标为 **K1**（历史记录）。按 M1/M3，规范权威在落地文档（K2），由 K1 投影出的汇总表应是 **K3 衍生视图**，不能从 K1 派生 K2。另外，把不入库的本机运行态 `events.jsonl`、`checkpoint.json` 硬塞进文档分类体系的 K1/K3，混淆了“受控文档”与“本机运行态”。
  2. **AD-2 渗漏风险**：第八节第 1/2/6 条明确要改 `core/GUIDE.md` 以适配“决策一事一文件”“任务页生成 `CURRENT.md`”“SKILL.md 按需读 GUIDE”。若在 `core/` 引入生成器、`SKILL.md`、`.agents/skills/` 或特定目录约定，会直接违背 **AD-2**（`core/` 禁止出现项目、工具、路径或语言名）。
  3. **A0 口径自相矛盾**：第七节第 4 条称“机器可提议的修改只有 `pin --relocate` 待审补丁，其余一律不自动改写文档（A0）”，但第三、五节又让生成器和关闭命令直接写 `CURRENT.md`、`plan.md`、`decisions.md`、`CODEOWNERS`、`log.md` 甚至代写任务页。
- **修改建议**：
  - 将 `docs/decisions.md` 改为 **K3 状态视图**；将 `events.jsonl`/`checkpoint.json` 移出 M1 文档分类，单列“本机运行态”。
  - 明确 `core/GUIDE.md` 只保留抽象操作语义，不写生成器/目录/`SKILL.md`。
  - 第七节第 4 条改为区分三类写入：**确定性衍生视图（G20）**、**人/Agent 显式触发且经 PR 审查的脚手架命令**、**禁止后台自发改写语义散文（A0）**。

### 4. 事实错误（内部不一致）：G10 缺失、G18 悬空引用、G13 口径冲突
- **位置**：第二节第 4 条、第五节第 2 & 4 条。
- **问题**：
  1. 第二节第 4 条表格跳过了 **G10** 和 **G18**；但第五节第 4 条“暂停或交接”一行直接引用了未定义的 **`G18（本地）`**。
  2. **G13 前后矛盾**：第二节写 G13 允许“改真实链接的 URL 区间和在末尾追加带日期的勘误”；第五节却写决策文件“写完就不再改（G13 变成‘文件不变’的简单谓词）”。允许改链接和追加勘误就不是简单的“文件哈希不变”。
- **修改建议**：补全 G10、G18 定义（或重排编号并消除悬空引用）；统一 G13 口径（若采用严格不可变，勘误也走新决策文件 `amends/supersedes`；若允许改链接，明示需语法级 diff 谓词）。

---

## P1（高严重度：第四节关键事实错漏、核心裁决缺陷、安全与可靠性遗漏）

### 5. 第四节事实错误与冲突项裁决（4 项高影响核实结果）
- **Roo Code 已归档关停**（**核实状态：已确认，codex 正确、agy 旧稿有误**）
  - 依据：`RooCodeInc/Roo-Code` 已于 **2026-05-15** 归档为只读并官方关停（终版 `v3.54.0`），URL：https://github.com/RooCodeInc/Roo-Code
  - 修改建议：从“待核实”删除，按第四节规则移入“已归档旧版”，不再列入适配计划。
- **Windsurf 已整合更名为 Devin Desktop**（**核实状态：已确认**）
  - 依据：Windsurf 已由 Cognition 更名整合为 **Devin Desktop**，站点与文档迁至 https://devin.ai 、 https://docs.devin.ai/desktop 与 https://docs.devin.ai/cli/extensibility/hooks/overview 。配置转向 `.devin/`（如 `.devin/hooks.v1.json`），兼容旧 `.windsurf/` / `.windsurfrules`，**且会自动加载 `.claude/` 下的 hooks**。
  - 修改建议：不要建 `adapters/windsurf/`，改为评估 `devin-desktop`（标注旧 `.windsurf/` 兼容）；**特别补充风险**：因其自动读 `.claude/` hooks，若仓库同时部署 `.claude/` 与 `.devin/` 转发钩子，可能触发**双重执行**。
- **Cline `hookErrorMode` 与项目级 `.clinerules/hooks/` 混淆**（**核实状态：对象混淆，需拆分表述**）
  - 依据：`hookErrorMode`（默认 `"ignore"`，可选 `"throw"`，超时 3s）属于 **Cline SDK / 插件运行时钩子**（https://docs.cline.bot ）；而普通仓库使用的可执行脚本钩子位于 `.clinerules/hooks/`（`PreToolUse` 等，默认 30s 超时，`stdout` 返回 `{"cancel": true}` 阻断），并不受 `hookErrorMode` 控制，且脚本崩溃/非法 stdout 在部分版本曾触发 UI 卡死在“Resume task”。
  - 修改建议：第四节拆分说明——仓库适配器面对的是 `.clinerules/hooks/` 脚本钩子（须用 wrapper 捕获异常并恒定输出合法 JSON），而非 SDK 的 `hookErrorMode`。
- **Codex CLI 双层信任模型漏写一层，且与 `update` 冲突**（**核实状态：已确认，比初稿更严格**）
  - 依据：Codex CLI 采用**双层信任**（https://learn.chatgpt.com/docs/hooks 、 https://developers.openai.com/codex/hooks ）：
    1. **项目信任**：目录未信任时完全不加载 `.codex/`（非交互 `codex exec` 需 `--trust`）；
    2. **单条 Hook 哈希信任**：绑定命令/参数精确哈希，需在 `/hooks` 审批（CI 可用 `--dangerously-bypass-hook-trust`）。**关键后果**：`docaxioms update` 一旦改动 `.codex/hooks.json` 的命令串，旧哈希失效，Codex 会**静默跳过**该钩子！
    3. 持久终端后续 `write_stdin` 不再触发 `PreToolUse` 亦已确认（对应 `openai/codex` Issue #46372，URL：https://github.com/openai/codex/issues/46372 ）。
  - 修改建议：第四节补齐双层信任；在“update 同时迁移适配器”与第七节绕过面中明示：`update` 改动 `.codex/hooks.json` 后必须提示用户重新 `/hooks` 授权，否则钩子静默失效。

### 6. 四项核心裁决的合理性评估与修正
| 裁决 | 总体判断 | 核心漏洞 | 修改建议 |
|---|---|---|---|
| **`CURRENT.md`/`plan.md` 改为任务页生成** | **方向对，但过死** | 1) 丢失“跨任务/项目级现状”（发版冻结、全局阻塞、近期焦点），纯由任务页拼不出；2) 与 `minimal` 档（无 `tasks/`，手写 `CURRENT.md`）规则分裂；3) 如 P0-2 所述，入库生成物制造 PR 冲突 | `full` 档改为“手写项目概览区 + 生成的任务摘要区”混合结构（或视图不入库）；明确 `minimal` 档仍手写 |
| **决策一事一文件** | **基本合理，支持采用** | 1) 漏了**并行 PR 抢决策顺序号**（两人同时建 `D-042.md`）问题；2) `decisions.md` 入库冲突；3) 与 G13 口径打架（见 P0-4） | 采用抗碰撞 ID（如 `YYYYMMDD-<slug>` 或发号规范）；`decisions.md` 标为 K3；统一 G13 不可变口径 |
| **事件日志 + 可丢弃 checkpoint（替代 `session.json`）** | **裁决合理，优于 `session.json`** | 1) 同工作区多终端/子 Agent 并发写同一 `events.jsonl` 会串行或误判中断；2) 用户 Ctrl+C、hook 超时 fail-open 或无成对 `PostToolUse` 会残留大量“假未完成”记录，导致恢复凭据拒写死锁；3) 缺轮转裁剪与敏感命令参数脱敏 | 按 `<session-id>.jsonl` 分片 + 提供日志裁剪与人工清除假未完成命令；仅记录命令名与输入摘要，不落明文参数/环境变量；无成对 hook 的 Agent 降级为“仅 Git 快照 + 任务页” |
| **不取 `workflow.md`** | **结论可接受，理由不成立** | “生命周期就是 GUIDE”混淆了**通用文档规程（GUIDE，受 AD-2 约束不能含项目/工具细节）**与**本项目协作流程**（分支策略、合并队列名、热修绕过、PR 规范、外部工单映射），后者无处安放，容易撑爆 `AGENTS.md`（≤100 行） | 可不单设 `workflow.md` 以控文件数，但须明文把“项目协作流程”划归 `operations.md`（或 `ownership.md`）固定章节，而非声称 GUIDE 已覆盖 |

### 7. 三项关键架构遗漏
1. **G17“可信运行器记录”缺存储与防伪造模型**：全文多次依赖“针对候选树 T 的可信验证记录”，但未说明凭据载体（GitHub Checks API / 签名 attestation / 平台 API 查询）。若靠任务页或本地日志申报，Agent 可直接伪造。
2. **冷启动将 GUIDE 挪到 `SKILL.md` 按需读取，可靠度被高估**：并非所有 Agent 支持 `.agents/skills/`（如 Aider、部分旧版或受限环境），且技能触发依赖模型自觉（纯 L0）。把核心操作规程全藏进按需技能，极易导致冷启动漏守规程、到回合末或 CI 才大面积返工。建议 `AGENTS.md` 保留最小不可违反的操作底线，技能只承载详细步骤。
3. **不可信仓库的 hooks 与 `projectChecks` 供应链安全未评估**：第二节称 `projectChecks` 在“隔离进程”运行，但普通子进程只隔离了崩溃与 JSON 协议，**不是操作系统沙箱**，无法防恶意候选 PR 在审查者本机或 CI 偷读凭据、篡改文件；同时克隆外部 PR 时本地 `.cursor/hooks.json` 等也有同样风险（Codex 做双层信任正是为此）。建议明确 CI 隔离模型（如只跑基线受信任的 `projectChecks`，不可信 PR 不执行候选自带插件代码）。

---

## P2（中严重度：能力边界遗漏、运营高估、AD-7 自举）

### 8. Claude Code 原生 `AGENTS.md`（v2.1.277+）关键限制遗漏
- **核实状态：版本门槛已确认，但有严格前提**（2026-09-18 发布的 `v2.1.277` 引入，见更新追踪站 `claudeupdates.dev` 与社区多方实测；官方主文档仍以 `CLAUDE.md` 为主入口）。
- **关键事实**：
  1. **默认仅作 fallback，不是合并**：当前或任意父目录只要存在 `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md`，就会忽略 `AGENTS.md`（除非用户经 `/config` → Project instructions 修改）；
  2. **仅限直连 CLI**：通过 Amazon Bedrock、Google Cloud Vertex AI、Microsoft Foundry 等企业代理通常不可用。
- **修改建议**：移出“待核实”，明确结论——因为默认仅 fallback 且企业代理不支持，**一行 `@AGENTS.md` 桥接不能省**，且反过来要注意仓库若有 `CLAUDE.md` 就必须显式包含 `@AGENTS.md`。

### 9. Cursor `failClosed` 核实 + 漏掉企业/团队托管限制
- **核实状态：已确认**（默认 `failClosed: false` 即 fail-open，需在 `.cursor/hooks.json` 显式配置 `"failClosed": true`，URL：https://cursor.com/docs ）。
- **遗漏**：Dashboard 托管的 Team/Enterprise hooks 通常不支持 per-hook 的 `failClosed` 与 `matcher` 配置，仅本地/系统级 `hooks.json` 支持。
- **修改建议**：移出“待核实”，补充企业托管钩子的这一限制。

### 10. G16“每个受管源码变更都要登记处置”易退化为形式主义（隐性违背 A0 / M2）
- **位置**：第二节第 4 条、第八节待决第 4 条。
- **问题**：若对所有源码改动（单测、重构、typo、构建脚本）一刀切要求绑定 diff 摘要的处置记录，开发者与 Agent 会迅速养成机械粘贴“无需改文档：内部重构”的习惯，制造高噪声低信息量记录，反而淹没真正需要审的变更。
- **修改建议**：G16 默认收敛为**仅触发于受管契约面（带 pin 的文件、公开 API/schema、配置契约）**或设为项目 opt-in，而非全源码强制。

### 11. AD-7 的本仓库自举（dogfood）问题未说明
- **位置**：第一节、第八节第 10 条。
- **问题**：初稿正确澄清 AD-7 只约束本仓库自身，但若 owner 批准了 `decisions/` 一事一文件、生成视图 G20 等新设计，本仓库自身是否切换？若切换，受 AD-7 限制本仓库的 G20 不能阻断（除非修订 AD-7）；若不切换，源仓库与 `full` 模板结构分叉。
- **修改建议**：在第八节第 10 条显式列出“本仓库是否自举及是否相应修订 AD-7”。

### 12. 遗漏 Monorepo 场景 & 高估 `full` 档的团队日常认知负荷
- **位置**：第五节第 2 & 3 条。
- **问题**：全文假设单根单 `CURRENT.md` / `architecture.md` / `docaxioms.json`，未考虑多包 Monorepo 与主流 Agent 已普遍支持的嵌套目录 `AGENTS.md`；同时 `full` 档 16 份固定文件 + 5 个增长目录 + 技能/钩子/CI 套件，即使不计工具实现成本，消费团队的日常维护与新人心智成本也偏高。
- **修改建议**：在第八节可行性表补充“单仓默认，Monorepo 作用域暂未设计”；考虑 `full` 档中 `requirements.md` / `operations.md` / `ownership.md` 按模块按需启用，而非 16 份全量一次性落地。

---

## P3（低严重度：文档域名与出处精确化）

### 13. Codex 文档域名双轨、Copilot 云端钩子收口、`arXiv:2608.11095` 焦距补充
- **Codex 官方文档域名**：**双域名均有效且官方并行**——https://developers.openai.com/codex/hooks （开发者与 API 参考入口）与 https://learn.chatgpt.com/docs/hooks （Codex CLI / IDE / Cloud 产品指南与 Hooks 主文档）。建议适配器 manifest 与维护文档注明以 `learn.chatgpt.com/docs/hooks` 为主、`developers.openai.com/codex/hooks` 对照。
- **Copilot 云端 Agent 钩子**：**已核实**（https://docs.github.com ）——`.github/hooks/` 必须已合入**默认分支**才生效，默认超时 30s 且**超时 fail-open**（普通非零退出在阻断类钩子上通常 fail-closed）。可从第四节“待复核”移入“已核实”。
- **`arXiv:2608.11095`（第六节）**：**已核实存在**（*Why Does CLAUDE.md Keep Growing? Catastrophic Remembering in Agentic Coding*, 2026-08，https://arxiv.org/abs/2608.11095 ）。论文核心论据不仅是“记录为什么（A8）”，更是**没有理由就无人敢删旧规则，导致指令文件平均膨胀 226%**——它直接支撑第四、五节的“退役/修剪”与 `AGENTS.md <= 100 行` 预算控制，建议补充点出。

---

## 附：第四节 7 项冲突联网核实总表

| 核实项 | 核实状态 | 结论要点 | 参考 URL | 初稿修改建议 |
|---|---|---|---|---|
| 1. Roo Code (`RooCodeInc/Roo-Code`) 是否归档 | **已确认（已归档）** | 2026-05-15 官方关停并归档为只读（终版 `v3.54.0`），codex 正确 | https://github.com/RooCodeInc/Roo-Code | 移出“待核实”，标为已归档旧版，剔除适配路线图 |
| 2. Claude Code 原生读 `AGENTS.md` 版本门槛 | **已确认（带条件）** | `v2.1.277`（2026-09-18）引入，但默认**仅 fallback**（存在 `CLAUDE.md` 即忽略），且 Bedrock/Vertex/Foundry 代理通常不可用 | https://claudeupdates.dev （社区/更新追踪站多源一致，官方主文档仍以 `CLAUDE.md` 为主） | 移出“待核实”，注明 fallback 限制，坚持保留一行 `@AGENTS.md` 桥接 |
| 3. Codex CLI 项目级 hooks 是否需用户信任 | **已确认（双层信任）** | 需同时满足**项目信任**（`codex exec --trust`）+ **单条 hook 定义哈希信任**（`/hooks` 审批）；命令变更即静默跳过；`write_stdin` 绕过亦确认 | https://learn.chatgpt.com/docs/hooks ；https://github.com/openai/codex/issues/46372 | 补全双层信任，补充 `docaxioms update` 改 hooks 后需重新信任的告警 |
| 4. Windsurf 文档是否迁至 `devin.ai` | **已确认（且产品更名）** | 已更名整合为 **Devin Desktop**，文档迁至 `docs.devin.ai`，配置转向 `.devin/`，兼容 `.windsurf/` 且自动读 `.claude/` hooks | https://docs.devin.ai/desktop ；https://docs.devin.ai/cli/extensibility/hooks/overview | 更名为 Devin Desktop 适配项，并防范与 `.claude/` hooks 双重触发 |
| 5. Codex 官方文档域名 | **已确认（双域名并行）** | `learn.chatgpt.com`（CLI/IDE/Cloud 产品与 Hooks 主文档）与 `developers.openai.com`（开发者/API 与镜像入口）并存 | https://learn.chatgpt.com/docs/hooks ；https://developers.openai.com/codex/hooks | 注明双源并行，以 `learn.chatgpt.com/docs/hooks` 为主 |
| 6. Cursor hooks `failClosed` 默认值 | **已确认（默认 `false`）** | 默认 fail-open，需在 `.cursor/hooks.json` 显式设 `"failClosed": true`；但 Team/Enterprise dashboard 托管钩子不支持该 per-hook 选项 | https://cursor.com/docs | 移出“待核实”，补充企业托管钩子不支持 per-hook `failClosed` 的限制 |
| 7. Cline `hookErrorMode` 默认值 | **已确认但对象混淆** | `hookErrorMode` 默认 `"ignore"`（可选 `"throw"`，3s 超时）属于 **SDK/插件钩子**；仓库级 `.clinerules/hooks/` 脚本钩子（30s 超时，`cancel: true`）不走该配置 | https://docs.cline.bot | 区分 SDK 插件钩子与仓库 `.clinerules/hooks/`，后者要求用 wrapper 兜底输出合法 JSON |
