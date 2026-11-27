# docaxioms 全流程开发文档管理系统研究与架构方案

> **声明与阅读约定**
> - 本文严格基于内嵌仓库文件（`HEAD a56e5c0`）与本次联网检索结果撰写，未修改仓库任何文件。
> - 全文显式区分 **【已核实事实】**（附仓库文件/行号或外部 URL 与核实状态）与 **【设计/推测】**（架构推导与工程方案）。
> - 严守既有约束：`core/AXIOMS.lock.md` 锁定（AD-1）；`core/` 不得出现任何项目名、工具名、其路径或语言（AD-2）；门禁遵循精确性原则（A6、A7、M2）；不做代码驱动自动改写文档迎合代码的闭环（A0）；新门禁升格遵循 AD-7（外部真实项目 ≥10 次相关变更、≥3 条值得改文档的发现）。

---

## 目录

- [H. 对 Claude 上一轮总结的批驳（先清基线）](#h-对-claude-上一轮总结的批驳先清基线)
- [A. 门槛加硬方案：精确谓词、分层强度与可行上限](#a-门槛加硬方案精确谓词分层强度与可行上限)
- [B. Session 重启与中断恢复机制](#b-session-重启与中断恢复机制)
- [C. 主流 Agent 逐项核实与适配器体系](#c-主流-agent-逐项核实与适配器体系)
- [D. 全流程开发文档管理系统设计](#d-全流程开发文档管理系统设计)
- [E. 人类阅读与审查的便利性、高效性、可靠性与延续性](#e-人类阅读与审查的便利性高效性可靠性与延续性)
- [F. 检查的自发性保证：五层无记忆自动触发体系](#f-检查的自发性保证五层无记忆自动触发体系)
- [G. 可行性评级、公理/决策冲突与待 Owner 决策清单](#g-可行性评级公理决策冲突与待-owner-决策清单)

---

## H. 对 Claude 上一轮总结的批驳（先清基线）

把批驳放在最前，是因为后续 A–G 的所有设计都必须建立在准确的基线之上。

### 1. 事实错误与不精确之处

| # | Claude 上一轮表述 | 核实事实与批驳 | 出处（仓库内嵌） |
|---|---|---|---|
| 1 | 冷启动读链为 `CLAUDE.md→AGENTS.md→公理→GUIDE→CURRENT.md→任务页` | **混淆了两种入口与两套仓库配置**。① `CLAUDE.md` 只是给 Claude 工具的薄桥接（`@AGENTS.md`），其他工具直接读 `AGENTS.md`；② 目标项目模板 `templates/AGENTS.md` 的顺序是 `AXIOMS.lock.md → GUIDE.md → CURRENT.md → docs/README.md 链接的任务页`（不包含 `GARDEN.md`）；③ docaxioms **本仓库** `AGENTS.md` 没有 `CURRENT.md`，而是把 `GARDEN.md` 和 `README.md` 放进了开头必读。 | `README.md`（init 说明）；`templates/AGENTS.md`；`AGENTS.md` |
| 2 | “AD-7 外部实证为零，所有门禁对新项目都是‘已知有缺陷的预发布门禁’” | **把两件性质不同的事混为一谈**。AD-7 约束的是“**本仓库开发期**哪些检查阻断合并，以及单条检查在本仓库升格的条件”（外部真实项目 ≥10 次相关变更 + ≥3 条发现）；而新项目使用 `docaxioms check` 时，所有 `gate` 默认即退出码 1 阻断（`README.md`）。真正导致部分门禁“不可靠”的是已核实的 15 项源码缺陷（如缺陷 1/2/3/4/5/11），而不是 AD-7 本身让门禁失效。 | `docs/decisions.md`（AD-7）；`README.md`；`research/调研校验与迭代参考.md` 第二节 |
| 3 | “A5 ‘旧决策行不删’无检查执行” | **只说对一半，漏掉了规范空缺**。确实没有检测旧决策行被删改的检查，但提交 `86dffc1` 删掉第 5 号未发布决策暴露的是**规范本身未定义“决策如何退役”**：代码接受 `withdrawn` 状态，但 `core/GUIDE.md` 只写了“被推翻（overturned）”时保留旧行改状态，没写未发布/不再适用决策的规则。不先补规范就直接加硬门禁，会违反 M2/A7。 | `core/GUIDE.md`（Which document owns what）；`research/调研校验与迭代参考.md` 第五节 |
| 4 | “init 的 `D` 前缀与 CRLF 坑” | **表述过粗**。① `D` 前缀误报仅发生在文档侧（默认 `codeExtensions` 为空，源码不扫），且“高频误报”尚无实测数据；② CRLF 并非全仓库未处理，`src/pins.mjs:58` 已做 CRLF 归一化，真正出问题的是 `core` 文件哈希校验、`update` 与 `history` 勘误追加，且仅在 Git `core.autocrlf=true` 复现，Windows 实机尚未实测。 | `research/调研校验与迭代参考.md` 第二节（缺陷 6、7） |

### 2. 高估之处

1. **高估了“纯冷启动文本”的约束力**：Claude 总结说“docaxioms 不改 LLM/harness，改的是 agent 冷启动读到的东西”。**【已核实事实】** 外部对 Claude Code 与指令文件的研究表明，纯 Markdown 指令在长对话和复杂任务中存在显著遵从漂移（社区统计与架构分析指出纯文本指令遵从率约 80% 左右，且上下文越长越容易被忽略，[code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)；另见 `research/调研校验与迭代参考.md` 第四节引用的 arXiv 2608.11095）。如果 docaxioms 永远停留在“给冷启动写几行提醒”，就必然陷入“靠 agent 记得”的困局。
2. **高估了“任务收尾四件套（写 log、清 plan、重写 CURRENT、跑 check）”的完成概率**：它隐含了“每个 session 都能完整跑完并优雅收尾”的理想假设，没有考虑上下文压缩（compaction）、Token 耗尽、进程异常中断、用户中途切任务、多分支并行等高频现实。
3. **高估了现有 `check` 的强制力**：`README.md` 明确写着 `nothing calls it for you`；且在浅克隆（`actions/checkout` 默认 `fetch-depth: 1`）或主分支直接 push（`base == HEAD`）时，`history` 和 `codeToDocs` 只打 `note` 仍返回退出码 0；本地 Git hook 可用 `--no-verify` 跳过且克隆不自带。

### 3. 遗漏之处

1. **遗漏了多个已核实的高危源码缺陷**：缺陷 1（`paths` 门禁错误扫到 log/plan/research/旧决策导致误报）、缺陷 5（显式配置文件缺失时整次 `check` 中止且 `--json` 无输出）、缺陷 8/9（开放研究靠文件名子串匹配、非 `.md` 落地点跳过反向检查）、缺陷 10（`pin --write` 零命中仍退出 0、`#L` 漏检、npm 选项误判）。
2. **遗漏了人类审查侧的实证失效**：`research/调研校验与迭代参考.md` 第四节已核实 Yang、He 与 Zhou 的结论——**超过 70% 的指令文件 PR 没有实质人工审查，而 AI 自动审查仅召回了人类关注点的 1.3%–3.9%**。这意味着没有专门面向人类的审查减负与防绕过机制，文档门禁在“语义真实性（A0）”这一环会完全失守。
3. **遗漏了全生命周期文档缺口**：现有模板只覆盖了 `AGENTS.md`、`CURRENT.md`、`decisions`、`plan`、`log`、`research`、`history`，对**系统架构/边界（K3）、已知限制与运行手册（K3）、发布/变更验证记录（K1）、文档退役流程与责任人交接**缺乏标准落位。
4. **遗漏了 2026 年 Agent 生态的新基础设施**：主流 Agent（Claude Code、Codex CLI、Gemini CLI、Cursor、GitHub Copilot、Windsurf、Kiro、Cline、Roo Code、OpenCode）现已普遍原生支持 `AGENTS.md`、开放 `SKILL.md`（`agentskills.io`）以及确定性生命周期 Hooks——docaxioms 可以在**零触碰 `core/`（严守 AD-2）**的前提下，把确定性护栏直接前移到 Agent 运行时。
5. **遗漏了托管平台层的结构性陷阱**：GitHub Actions `paths:` 过滤导致 Required Check 永久 `Expected` 死锁；公开仓库 `schedule` 定时任务连续 60 天无推送会被静默停用；Ruleset bypass 列表与 `CODEOWNERS`/Merge Queue 的交互边界。

---

## A. 门槛加硬方案：精确谓词、分层强度与可行上限

### 1. 先修“漏水桶”再加硬（前置条件）

**【已核实事实】** `research/调研校验与迭代参考.md` 第二、三节已确认 15 项源码缺陷，其中 **6 项直接破坏门禁精度与完备性**（违反 A6/A7/M2）：
1. **缺陷 4（最高优）**：`docaxioms.json` 键名拼错（如 `commmands`）时对应门禁静默失效且退出 0 → 必须先加 strict schema 校验（预留 `x-*` 扩展键）。
2. **缺陷 1**：`paths` 门禁扫描范围错（`src/check.mjs:383` 用 `p.currentDocs` 而非 `descriptionDocs(p) + card`），导致对 K1/K4 误报。
3. **缺陷 2**：`history` 比较用正则擦 `](...)` 可被围栏代码或多行 title 绕过 → 改在 Markdown AST 上仅擦除 link/definition URL 区间。
4. **缺陷 3**：链接与落地点可用 `../` 越出仓库外，前导 `/` 解析错误 → 统一仓库内路径解析函数，越界即 FAIL。
5. **缺陷 5**：显式配置的文件缺失导致整次检查中止且 `--json` 空输出 → 改为该项报诊断、其余项继续。
6. **缺陷 11**：显式配置规则零匹配时显示 `ok` → 改为 `note` + `--json` 输出 `checked` 计数；配套缺陷 10（`pin --write` 零命中应退出非 0、`#L` 存在性检查、npm 选项处理）。

### 2. 精确谓词（Gate）与 Review Aid / 人工审计（Garden）的硬边界

**【设计】** 严格遵循 M2（“只有当被检谓词 = 性质本身且精确时才成为 `gate`”）：

#### （1）可做成精确硬门禁（Gate，谓词 = 性质本身）

| 维度 | 门禁谓词 | 推导公理 | 备注 / 现状 |
|---|---|---|---|
| **配置防静默失效** | `docaxioms.json` 符合 Schema（无未知键、类型合法、配置目标存在） | A6, A7 | 新增（修缺陷 4、5） |
| **规范锁校验** | `docaxioms/*` 哈希与 CLI 版本/commit 匹配 `docaxioms.json` | A4, A6 | 已有（需修缺陷 7 CRLF 契约） |
| **图可达与路径完整** | 链接/锚点有效、无仓外逃逸、现行文档从入口可达、现行描述路径存在、`gonePaths` 保持不存在 | A2, A3, A4, M4 | 已有（需修缺陷 1、3、10、13） |
| **代码锚点精确绑定** | `<!-- pin: path#Lstart-Lend@hash -->` / 命名区域 `ANCHOR:` 哈希一致 | A2, A6, A7 | 已有（可扩展可选命名区域） |
| **命令存在性** | K3 描述中的反引号命令存在于 `package.json`/Makefile/白名单 | A2, A6 | 已有（需修缺陷 10） |
| **文档预算** | `AGENTS.md`、`CURRENT.md`、各 K3 模块不超过 `maxLines`/`maxChars` | A3, M4 | 已有 |
| **K1 历史记录不可变** | ① `docs/history/` 除 URL 与末尾带日期勘误外不可改；② `docs/log.md` 已有日期条目不可删改（只允许末尾追加或带日期勘误）；③ `docs/decisions.md` 已有已发布决策行文本与 ID 不可删改，仅允许状态列按合法状态机转移（`active → superseded by <ID> / partly superseded / withdrawn`） | A5, M1 | ① 已有（需修缺陷 2）；②③ 新增（**须先补 GUIDE 退役规则，并按 AD-7 先跑 aid**） |
| **跨基线非降级** | `--require-base` 模式下，`history.base` 不可解析或比较基线缺失时由 `note` 升级为 `FAIL` | A6 | 新增可选开关（CI PR 强制开启） |
| **零匹配防空跑** | `--strict-empty`（或配置 `minMatches`）下，显式配置的规则命中 0 目标时失败 | A6, A7 | 新增（基于缺陷 11 的 `checked` 计数） |
| **适配器防漂移** | 所有托管的 Agent 适配器文件（`CLAUDE.md`、hooks、skills、bridge）与 `docaxioms.json` 声明的模板+校验和完全一致 | A4, M3 | 新增（见 C 节） |
| **运行态泄漏防护** | 本地会话态文件（如 `.docaxioms/session.json`）未被 git 跟踪 | A1, A4 | 新增（见 B 节） |
| **开放计划与阶段卡结构** | `CURRENT.md` 的 `Active` 条目必须指向 `docs/plan.md` 中存在的开放项；开放研究文件必须被 `docs/plan.md` 开放段真实链接 | A3, A4, M4 | 已有部分（修缺陷 8 后扩展到阶段卡） |

#### （2）本质上只能是 Review Aid 或只读审计（Garden）的性质（禁止做成硬门禁）

| 性质 | 为何不能做硬门禁 | 正确处理方式 | 公理依据 |
|---|---|---|---|
| **散文描述与代码实际行为一致** | 自然语言语义等价性不可机械判定；强行用 LLM 当硬门禁会引入高误报与不可复现性 | `codeToDocs`（aid）提醒 + 定期只读 `garden` 审计 + 人类 PR 审查 | A0, A6, A7, M2 |
| **决策确实出自 Owner 本人** | 文本里写“owner 决定”可被 agent 伪造；CLI 无法鉴别谁在键盘前 | GitHub `CODEOWNERS` + 强制 owner 审批 + 签名提交（主机层，非 CLI 文本层） | A0, A6 |
| **变更代码时对应文档一定需要改** | 重构内部实现未必改变外部行为，强制“改源码必改文档”会制造大量误报，诱导敷衍改空格 | `codeToDocs` 保持为 `aid` + PR 摘要高亮提示 | A7, M2 |
| **描述中出现演化措辞（“previously / used to”）** | 正当的历史对照或带标记的记录片段也会出现此类词汇 | `evolutionary` 保持 opt-in `aid` | A7, M1 |
| **架构设计是否合理 / 落地点是否写对地方** | 价值判断与意图对齐问题 | 人工 Review + Garden 审计报告 | A0, A8 |

### 3. “硬”的分层执行模型与可行上限

**【已核实事实 + 设计】** 下表整合了 GitHub Rulesets（[docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets)，已核实）与主流 Agent Hooks 机制：

| 层级 | 执行机制 | 守住什么 | **明确没守住什么（绕过面，A6）** |
|---|---|---|---|
| **L0 软约束层** | `AGENTS.md`、`GUIDE.md`、`SKILL.md` 文本指令 | 冷启动意图传递、操作规程、何时跑什么 | LLM 遗忘、上下文压缩丢失、长对话漂移（纯文本遵从不稳定） |
| **L1 Agent 运行时层** | Agent 原生 `PreToolUse` / `Stop` Hooks + `permissions.deny`（如 Claude Code `.claude/settings.json`、Cursor `.cursor/hooks.json`、Copilot `.github/hooks/*.json`、Windsurf `.windsurf/hooks.json`、Kiro `.kiro/hooks/*.json`、Codex `.codex/hooks.json`） | ① 阻断编辑 `AXIOMS.lock.md`、`docs/history/`；② 回合结束前强制跑 `docaxioms check`；③ 会话启动自动恢复上下文 | ① 用户换用不支持 hooks 的工具（如纯编辑器或旧版 Aider）；② Agent 通过非拦截工具/间接 shell 绕过（如仅禁 `Edit` 未禁 `Bash` 重定向写文件）；③ 用户手动关闭/修改本地 hook 配置 |
| **L2 本地 Git 层** | `core.hooksPath` + `lefthook`/`pre-commit`（`pre-push` 跑 `docaxioms check`） | 开发者/Agent 推送前拦截断链、过期 pin、超预算、错误配置 | ① `git push --no-verify` 一键跳过；② 全新 clone 未激活 hooks；③ `check` 读工作区而非暂存区（`README.md` 已注明） |
| **L3 远端 CI 强门禁层** | GitHub Actions（`pull_request` + `merge_group`）跑 `docaxioms check --require-base` + `fetch-depth: 0` + **Always-Running Gate Job** + **Required Status Check** + **Merge Queue** | 任何合并到受保护分支的最终树状态必须通过全部精确门禁，不可 `--no-verify`，Merge Queue 杜绝“两个各自通过的 PR 合并后互相弄断链接/pin”的竞态 | ① 具有 Ruleset **bypass 权限**的管理员强制合并；② 恶意 PR 同时改掉 `.github/workflows/` 和 `docaxioms.json`（需 L4 防护）；③ 不覆盖 `aid` 与语义正确性 |
| **L4 托管平台治理与密码学层** | **GitHub Rulesets**（禁止直推、禁止强推、**Require review from CODEOWNERS**、**Dismiss stale approvals on new commits**、**Require signed commits**）保护：`docaxioms/**`、`docaxioms.json`、`docs/decisions.md`、`.github/workflows/**`、`.github/CODEOWNERS`、各 Agent hook/adapter 目录 | ① 防止 Agent 或普通贡献者“把公理文件连同哈希、CI、CODEOWNERS 一起改掉”的合谋绕过；② 防止审批后再追加未审提交（bait-and-switch）；③ 用 GPG/SSH 签名确保提交者身份不可伪造 | ① **物理上限 1**：仓库所有者/组织管理员（Ruleset bypass actor）仍可覆盖规则——但按 A0，owner 本身就是最终权威；② **物理上限 2**：`CODEOWNERS` 批准者“闭眼点 Approve”（橡皮图章，社会技术边界）；③ **物理上限 3**：散文语义与运行行为的真实一致性永远不可由门禁穷尽证明（A0、A6） |

> **关键结论（可行上限）**：工程上能做到的最高硬强度是 **L3（Always-Running CI + Merge Queue + `--require-base`）+ L4（Rulesets 锁定受保护路径 + CODEOWNERS 独立审批 + Dismiss stale approvals + 签名提交）+ L1（Agent PreToolUse/Stop 确定性拦截）**。在此之上不存在更高的纯技术“硬锁”，剩余风险必须通过 E 节的**人类审查减负与可信化**及 F 节的**周期性自发 Garden 审计**兜底，并在项目 `AGENTS.md` / `README.md` 诚实写明未守住的部分（A6）。

---

## B. Session 重启与中断恢复机制

### 1. 问题诊断：为什么现有 `CURRENT.md` 不够用

**【已核实事实】** `templates/CURRENT.md` 仅包含三个极简分段：`Active`、`Next`、`Not verified`，预算上限 45 行 / 4000 字符（`templates/docaxioms.json`）。`core/GUIDE.md` 规定：
- 阶段卡不写 commit id、数量或区间（A4）；
- 任务完成后写 `log`、清 `plan`、重写 `CURRENT.md`。

**【设计分析】** 在以下四种真实场景中，该设计会失效：
1. **异常中断（Crash / 断网 / 强杀 / 额度耗尽）**：Agent 根本没走到“收尾”一步，`CURRENT.md` 停留在上一个任务，工作区留下一堆半成品代码与未更新的文档/pin。
2. **上下文压缩（Compaction）**：Claude Code、OpenCode、Codex 等在长会话触达上下文上限时会触发摘要压缩，早期读过的规则、已失败的验证命令、被拒方案细节常被洗掉。
3. **跨工具/跨会话交接**：上午用 Cursor 改了一半，下午切 Claude Code 或由另一位工程师接手，新 session 既不知道上次跑过什么测试、也不知道哪件事正卡在等 owner 拍板。
4. **“假完成”风险（Anthropic 长时代理实证）**：**【已核实事实】** Anthropic 工程文章 *Effective harnesses for long-running agents*（[anthropic.com/engineering/effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)，已核实）指出，跨会话的“交班问题（shift-change problem）”会导致 Agent 重复摸索、上下文焦虑下提前宣称完成、或跳过真实验证；其成熟解法是把状态外置到文件系统（滚动进度记录 + **结构化 JSON 任务/检查点文件**，因为模型修改 JSON 比修改自由 Markdown 更不易损坏格式 + 强制 Git 快照）。

### 2. 恢复所需状态清单、存储归属与 M1 分类

**【设计】** 严格遵循 M3（一事一主，可派生的一律不手抄，避免违反 A4），将恢复所需状态拆为 **三层存储**：

| 恢复所需状态 | 存放位置 | M1 类别 | 谁写 / 何时写 | 是否入 Git | 防过时机制（A2/A4/A5） |
|---|---|---|---|---|---|
| **未提交改动、当前分支、HEAD SHA、冲突文件、最近提交** | **不落文档，直接由 Git 动态查询** | 实时观测证据（A1） | Git 本身实时维护 | 仓库元数据 | 零手抄，天然不会与代码漂移（A4） |
| **跨会话共享的阶段状态**：当前活跃任务（链接到 `docs/plan.md` 项）、下一步、**未验证项**、**待 Owner 决策阻塞项（Blocked on owner）** | `CURRENT.md`（升级版阶段卡，仍受 ≤45 行预算） | **K3（现行描述）** | Agent 或人类在**开始任务（claim）**、**遇到 owner 阻塞**、**任务收尾（close）**三个节点更新 | **入库** | 活跃项必须链接 `docs/plan.md` 开放项（门禁校验）；不写 commit SHA 与计数（A4） |
| **单会话高频中断/恢复检查点**：`sessionId`、`agent`、`status`（`active`/`clean`/`interrupted`）、`taskRef`、`headShaAtStart`、`touchedFiles`、`lastCommands[]`（命令、退出码、时间戳、针对的 tree hash）、`openQuestions[]`、`nextAction` | `.docaxioms/session.json`（本地运行态文件） | **本地运行态 K1/K3 混合快照**（明确标注时间戳与 `headSha`，遵守 A1） | **Agent 生命周期 Hook 自动维护**（`SessionStart` 创建/标 `active`，`PostToolUse`/`PreCompact` 增量刷新，`Stop`/收尾命令标 `clean`） | **强制 `.gitignore`（严禁入库）** | 每次恢复比对 `headShaAtStart` 与当前 `git rev-parse HEAD` 及工作区摘要；不匹配即标记 `STALE_CHECKPOINT` 强制重新校验，旧命令证据自动降级为“历史参考（A1）”而非当前通过证明 |
| **已完成步骤的永久账本**（跑了什么、没跑什么、结果与时间） | `docs/log.md` | **K1（不可变记录）** | 任务收尾或里程碑检查点追加 | **入库** | 只增不删，勘误追加（A5） |

> **为什么拆出 `.docaxioms/session.json` 而不全塞进 `CURRENT.md`？**
> 1. 避免在开发过程中每跑一条命令就污染 `CURRENT.md` 的 git diff；
> 2. 避免多分支/多人协作在 `CURRENT.md` 上产生高频合并冲突；
> 3. JSON Schema 便于 Hook 脚本和 CLI 做确定性读写与校验，不给大模型“改坏 Markdown 结构”的机会（印证 Anthropic 工程实践）。

### 3. `CURRENT.md` 升级模板（控制在 45 行内）

```markdown
# Current

A stage card: what is active, blocked on owner, next, and not verified.
Done: [log](docs/log.md). Open work: [plan](docs/plan.md).

## Active
- [P-012 校验 profile schema](docs/plan.md#p-012) — 实现阶段

## Blocked on owner
- [ ] 是否允许 `x-*` 之外的未知键（关联决策待立项）

## Next
- [P-013 修复 paths 门禁作用域](docs/plan.md#p-013)

## Not verified
- `npm run check` 在 `core.autocrlf=true` 环境尚未验证
```

### 4. 中断检测与强制恢复状态机

**【设计】** 新增 CLI 子命令 `docaxioms session`（`start` / `checkpoint` / `close` / `resume --brief` / `status`）：

```
           [SessionStart / TaskStart Hook]
                         │
                         ▼
             运行 docaxioms session status
                         │
       ┌─────────────────┴─────────────────┐
       ▼                                   ▼
检测到异常中断条件（任一满足）          正常冷启动
① session.json 存在且 status=active     ① 无残留 active 会话
② git status 有脏改动但无 clean 记录    ② 工作区干净
③ CURRENT.md Active 非空但无本次认领    │
④ 刚经历 PreCompact 上下文压缩          ▼
       │                         输出精简引导（≤30 行）：
       ▼                         CURRENT.md + 对应任务页链接
进入【强制恢复模式】
1. 自动计算恢复简报（注入上下文）：
   - 上次未完成任务 & nextAction
   - git diff --stat & 未提交文件
   - 上次已跑命令（标注是否仍有效：比对 tree hash，A1）
   - Blocked on owner & Not verified 列表
2. 写入中断事件到 session.json (status=interrupted)
3. Agent 第一步必须先对账（继续 / 回滚 / 收尾），
   未调用 `docaxioms session ack` 前，PreToolUse 可选阻断
   对无关目录的写操作或提交操作
```

**优雅收尾（`docaxioms session close`）原子动作**：
1. 运行 `docaxioms check`；不通过则拒绝关闭并列出阻断项；
2. 提示/检查 `docs/log.md` 已追加本次日期的运行与未运行项（A1）；
3. 提示更新 `CURRENT.md`（清空已完成 `Active`，更新 `Not verified`）；
4. 将 `.docaxioms/session.json` 置为 `status: "clean"` 并记录结束时的 `headSha`。

### 5. 哪些可做成精确可检查谓词（Gate）？

| 谓词 | 级别 | 理由（M2） |
|---|---|---|
| `.docaxioms/session.json`（及 `.docaxioms/tmp*`）不得出现在 `git ls-files`（已跟踪文件）中 | **Gate** | 谓词精确，防止本地脏运行态泄漏进版本库 |
| `CURRENT.md` 必须包含标准分段（`Active`/`Blocked on owner`/`Next`/`Not verified`），且 `Active` 中非 `Nothing.` 的条目必须带有效链接指向 `docs/plan.md` 开放段 | **Gate** | 谓词精确，防止阶段卡脱离计划变成孤岛（A4/M4） |
| `CURRENT.md` 不得包含裸 7–40 位 commit hash（规避手抄版本，A4） | **Aid → 实证后 Gate** | 存在极低概率误伤普通十六进制词，按 AD-7 先做 aid |
| 合并到主干分支前，若 `CURRENT.md` 的 `Not verified` 或 `Blocked on owner` 非空，给出告警（或由项目配置 `card.blockMergeOnUnverified: true` 升级为 Gate） | **默认 Aid，可选 Gate** | 有些项目允许分阶段合入“待 E2E 验证”的代码，不能一刀切 |

---

## C. 主流 Agent 逐项核实与适配器体系

### 1. 主流 Agent 能力逐项核实矩阵（2026 年现状）

> **核实等级说明**：
> - **已核实（官方域）**：本次 `search_web` 直接命中官方域文档并确认具体路径/机制。
> - **部分核实**：核心能力命中官方域或官方 GitHub Issue，但个别细节（如版本边界或实验性开关）来自二级来源/Issue 讨论，上线前需实机回归。

| Agent | 入口/全局规则文件 | 路径/条件级规则 | 原生 `AGENTS.md` | Skills (`SKILL.md` / `agentskills.io`) | Hooks / 生命周期拦截（路径、事件与阻断能力） | 权限 Deny / 沙箱 | 会话恢复 / 中断 / 压缩 | 核实状态与来源 URL |
|---|---|---|---|---|---|---|---|---|
| **Claude Code** | `CLAUDE.md`、`CLAUDE.local.md`（支持 `@file` 引用） | `.claude/rules/*.md`（支持路径/延迟加载） | **是（v2.1.277+ 作为无 `CLAUDE.md` 时的 fallback）**；有 `CLAUDE.md` 时优先前者，常用 `@AGENTS.md` 桥接 | **是**：`.claude/skills/<name>/SKILL.md`（支持 `context: fork`） | **极强**（`.claude/settings.json` / `~/.claude/settings.json`）：`SessionStart`（含启动/恢复/压缩后）、`UserPromptSubmit`、`PreToolUse`（**可 `exit 2` 阻断**）、`PostToolUse`、`PreCompact`、`Stop`（**可 `exit 2` 阻断回合结束**）、`SessionEnd` | `settings.json` `permissions.deny`（如 `Edit(**/AXIOMS.lock.md)`，但不防 Bash 间接写）+ 企业 managed policy | `--resume` / `--continue`；内置 **Checkpointing (`/rewind`)**（仅跟踪工具编辑，不含外部 shell）；`PreCompact` + `SessionStart` 可重注入上下文 | **已核实（官方域）**：[hooks](https://code.claude.com/docs/en/hooks) · [memory](https://code.claude.com/docs/en/memory) · [skills](https://code.claude.com/docs/en/skills) · [checkpointing](https://code.claude.com/docs/en/checkpointing)（`AGENTS.md` fallback 版本号 `2.1.277` 为**部分核实**，来自社区报道与 GitHub Issue #6235/#34235） |
| **OpenAI Codex CLI** | `AGENTS.md`、`AGENTS.override.md`（目录树向上合并）；`~/.codex/AGENTS.md` | 子目录 `AGENTS.md` / `AGENTS.override.md`；`config.toml` `project_doc_fallback_filenames` | **原生一等公民** | **是**：`.agents/skills/<name>/SKILL.md`、`~/.agents/skills/`（`$` / `/skills` 或按需触发） | **强（已 GA，默认开启 `[features] hooks = true`）**：`.codex/hooks.json`、`$CODEX_HOME/hooks.json` 或 `config.toml` `[hooks]`；支持 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PreModelRequest`、`PostModelRequest`、`Stop`、`Interrupt`、`SessionEnd`；**本地项目 hooks 需在 TUI `/hooks` 中人工信任内容哈希** | `config.toml` sandbox / approval policy；企业只读 `requirements.toml` 可锁定托管 hooks | `codex resume`（按仓库恢复历史会话）；内置 compaction | **已核实（官方域）**：[agents-md](https://developers.openai.com/codex/guides/agents-md) · [hooks](https://developers.openai.com/codex/hooks) · [skills](https://developers.openai.com/codex/skills) · [cli](https://developers.openai.com/codex/cli) |
| **Gemini CLI** | `GEMINI.md`（全局 `~/.gemini/GEMINI.md` + 目录层级合并，支持 `@file` 导入） | 子目录 `GEMINI.md`；可在 `.gemini/settings.json` 配 `context.fileName` | **可配置原生读取**（通过 `settings.json` `context.fileName: ["AGENTS.md", "GEMINI.md"]`）或 `GEMINI.md` 内 `@AGENTS.md` | **是**：遵循 `agentskills.io`（按需加载） | **极强**（`settings.json` 同步中间件）：`SessionStart`、`SessionEnd`、`BeforeAgent`、`AfterAgent`、`BeforeModel`、`AfterModel`、`BeforeToolSelection`、`BeforeTool`（**可拦截/改写**）、`AfterTool` | 工具过滤（`BeforeToolSelection`）与安全拦截（`BeforeTool`） | 自动保存至 `~/.gemini/tmp/<hash>/chats/`；`--resume`/`-r`、`/resume`、`/chat save\|resume`；**影子 Git Checkpointing**（`~/.gemini/history/<hash>` + `/restore`，通过 `settings.json` 开启） | **已核实（官方域）**：[hooks](https://geminicli.com/docs/hooks) · [gemini-md](https://geminicli.com/docs/cli/gemini-md) · [checkpointing](https://geminicli.com/docs/cli/checkpointing) · [session-management](https://geminicli.com/docs/cli/session-management) |
| **Cursor** | `AGENTS.md` + `.cursor/rules/*.mdc`（必须是 `.mdc`，纯 `.md` 被忽略） | `.cursor/rules/*.mdc` YAML frontmatter（`alwaysApply` / `globs` / `description` Agent 决定 / 手动 `@`） | **原生支持**（根目录及子目录，全局常驻） | **是**：`.cursor/skills/<name>/SKILL.md` 及 `.agents/skills/`（按需或 `/` 手动） | **极强**（`.cursor/hooks.json` / `~/.cursor/hooks.json`，stdio JSON 双向通信）：`sessionStart`、`sessionEnd`、`stop`、`preToolUse`、`postToolUse`、`beforeShellExecution`、`beforeMCPExecution`、`beforeReadFile`、`afterFileEdit`、`beforeSubmitPrompt`、App 级 `workspaceOpen` | `beforeShellExecution` / `preToolUse` / `beforeReadFile` 均可拦截阻断 | 内置本地 **Checkpoints**（每轮自动快照修改文件，Timeline 一键 Restore，独立于 Git） | **已核实（官方域）**：[rules](https://cursor.com/docs/context/rules) · [hooks](https://cursor.com/docs/agent/hooks) · [skills](https://cursor.com/docs/context/skills) |
| **GitHub Copilot（IDE + Coding Agent）** | `.github/copilot-instructions.md`、`AGENTS.md`（也识别 `CLAUDE.md`/`GEMINI.md`） | `.github/instructions/**/*.instructions.md`（frontmatter `applyTo: glob`）+ 子目录 `AGENTS.md` | **原生支持**（Coding Agent 与 IDE 均支持） | **是**：`.github/skills/<name>/SKILL.md`、`.claude/skills/`、`.agents/skills/` | **强**（`.github/hooks/*.json`，云端 Coding Agent **必须存在于默认分支**；跨平台 `bash`/`powershell` 字段）：`sessionStart`、`userPromptSubmitted`、`preToolUse`（**`exit 2` fail-closed 阻断**）、`postToolUse`、`agentStop`（仅 `preToolUse` 可控阻断） | `preToolUse` 阻断 + GitHub Rulesets / `CODEOWNERS`（对云端 Coding Agent PR 生效） | 云端 Coding Agent 以 PR 分支+工作流日志为持久会话载体；IDE 侧支持会话历史 | **已核实（官方域）**：[custom-instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions) · [hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration) · [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets) |
| **Windsurf（Cascade）** | `.windsurf/rules/*.md`（新版亦支持 `.devin/rules/*.md`）、旧 `.windsurfrules`、`AGENTS.md` | YAML frontmatter（Always On / Model Decision / Glob / Manual）+ 子目录 `AGENTS.md`；`.windsurf/workflows/*.md`（`/workflow-name`） | **原生支持**（根部全局、子目录按路径生效） | **支持**（Skills 模块与 Workflows） | **强**（`.windsurf/hooks.json`、用户 `~/.codeium/windsurf/hooks.json`、系统级 `/etc/windsurf/hooks.json`，共 12 事件）：Pre-hooks（**`exit 2` 阻断**）：`pre_user_prompt`、`pre_read_code`、`pre_write_code`、`pre_run_command`、`pre_mcp_tool_use`；Post-hooks（仅审计不阻断）：`post_setup_worktree`、`post_read_code`、`post_write_code`、`post_run_command`、`post_mcp_tool_use`、`post_cascade_response`、`post_cascade_response_with_transcript` | Pre-hooks `exit 2` 阻断 + 系统级 IT 强制 `hooks.json` | **Memories**（跨会话自动/手动记忆，不消耗额度）+ Cascade 历史与回退 | **已核实（官方域）**：[docs.windsurf.com/windsurf/cascade/hooks](https://docs.windsurf.com/windsurf/cascade/hooks)（`.devin/rules/` 过渡路径与 `AGENTS.md` 子目录规则为**部分核实**，来自 `devin.ai` 与社区实测） |
| **Kiro（AWS）** | `.kiro/steering/*.md`、`AGENTS.md`（支持 `#[[file:path]]` 实时引用） | `.kiro/steering/` frontmatter（`always` / `fileMatch` / `manual` / `auto`） | **原生支持**（跨 IDE/CLI/Web） | **是**：`SKILL.md`（渐进披露，`/` 手动或自动匹配） | **强**（`.kiro/hooks/<name>.json`）：`PostFileSave`、`PreToolUse`、`PostToolUse`、`Stop`；可执行 shell 命令（收 stdin）或向会话注入 prompt | `PreToolUse` 门禁 | **Spec 驱动三件套**（`.kiro/specs/<feat>/{requirements,design,tasks}.md` 天然充当跨会话进度载体）+ **Checkpoints & Rewind** | **已核实（官方域）**：[kiro.dev/docs/hooks](https://kiro.dev/docs/hooks) · [kiro.dev/docs/steering](https://kiro.dev/docs/steering) |
| **Aider** | 无固定隐式文件；通过 `.aider.conf.yml` 的 `read: [AGENTS.md]` 加载只读上下文（常用 `CONVENTIONS.md`） | 无内置 glob 规则，靠命令行或配置文件显式 `--read` | **无隐式自动发现**，需 `.aider.conf.yml` 显式配置 `read: [AGENTS.md]`（只读且享 Prompt Cache） | **不支持** | **无通用生命周期 Hooks**；仅提供 `auto-lint: true` + `lint-cmd`、`auto-test` + `test-cmd`（文件改动后自动跑校验并把输出回喂给 LLM 修复） | 只读 `--read` 保护配置不被改；无 `PreToolUse` deny | `--restore-chat-history`（从 `.aider.chat.history.md` 恢复，默认 `false`）；`--auto-commits` 每步自动生成 Git commit 充当天然检查点 | **已核实（官方域）**：[aider_conf.html](https://aider.chat/docs/config/aider_conf.html) · [conventions.html](https://aider.chat/docs/usage/conventions.html) |
| **Cline** | `.clinerules` / `.clinerules/*.md` / `.cline/rules/`、`AGENTS.md` | 规则面板开关 + 目录模块化规则 | **原生支持**（项目与 `~/.agents/AGENTS.md`） | MCP / 扩展为主 | **强**（`.clinerules/hooks/<EventName>` **无扩展名可执行脚本**，`chmod +x` + shebang，JSON stdin/stdout 返回 `cancel: true` 或 `contextModification`）：`TaskStart`、`TaskResume`、`UserPromptSubmit`、`PreToolUse`（**可 cancel 阻断**）、`PostToolUse`、`TaskCancel` | `PreToolUse` 阻断 | **影子 Git Checkpoints**（每步自动快照，Compare/Restore）+ 经典 **Memory Bank** 模式（`memory-bank/*.md`）+ `TaskResume` hook | **已核实（官方域）**：[docs.cline.bot/features/hooks](https://docs.cline.bot/features/hooks)（`TaskResume`/`TaskCancel` 经官方 GitHub 源码/Issue 交叉印证） |
| **Roo Code** | `.roo/rules/`（递归加载）、fallback `.roorules`、`AGENTS.md` | **模式级规则** `.roo/rules-{modeSlug}/`（如 `code`/`architect`/`docs-writer`） | **原生支持**（组合顺序：Mode 规则 → `AGENTS.md` → 通用规则） | **是**：`.roo/skills/` 及模式级 `skills-{modeSlug}/`（`SKILL.md` 渐进披露） | **演进中（部分核实）**：兼容 Claude Code 风格的 `.roo/hooks.json`（`PreToolUse`/`PostToolUse`/`Stop`），但官方 Issue #10834/#11504 显示部分工具尚未完全覆盖且部分模式偏只读观测 | 模式级文件写权限正则限制（`fileRegex`）+ Hooks | **影子 Git Checkpoints**（默认开启，一键回滚文件与任务状态） | **部分核实**：[docs.roocode.com/features/custom-instructions](https://docs.roocode.com/features/custom-instructions)；Hooks 覆盖度来自 [Roo-Code#11504](https://github.com/RooCodeInc/Roo-Code/issues/11504) & [#10834](https://github.com/RooCodeInc/Roo-Code/issues/10834) |
| **OpenCode** | `AGENTS.md`（目录向上合并，缺失时 fallback `CLAUDE.md`）；`opencode.json(c)` | 目录层级 `AGENTS.md` | **原生一等公民** | **是**：扫描 `.opencode/skills/`、`.claude/skills/`、`.agents/skills/`（`SKILL.md`） | **极强（JS/TS 插件化）**：`.opencode/plugin/*.{js,ts}` 或 `opencode.json` `plugin` 数组（`@opencode-ai/plugin`）；支持 `tool.execute.before`（**可拦截**）、`tool.execute.after`、`permission.ask`、`chat.message`、`chat.params`、`config`、`tool` | `opencode.json` 细粒度 `allow`/`ask`/`deny` + 插件 `permission.ask` | 原生会话持久化、恢复/分叉；**Auto-Compact**（约 95% 上下文自动摘要并重载 `AGENTS.md` 启动续跑会话） | **部分核实（官方域+生态交叉印证）**：[opencode.ai/docs/rules](https://opencode.ai/docs/rules) · [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins) |

**【关键洞察】** 2026 年的 Agent 生态已呈现**三项事实标准收敛**：
1. **入口收敛到 `AGENTS.md`**：10 个主流工具中，**8 个原生自动读取 `AGENTS.md`**，Claude Code v2.1.277+ 支持 fallback（并用 `@AGENTS.md` 1 行桥接兜底），Gemini CLI 可通过 `settings.json` 配 `context.fileName`，仅 Aider 需在 `.aider.conf.yml` 加 2 行 `read: [AGENTS.md]`。
2. **按需规程收敛到 `agentskills.io`（`.agents/skills/<name>/SKILL.md`）**：Claude Code、Codex CLI、Gemini CLI、Cursor、GitHub Copilot、Kiro、Roo Code、OpenCode 均支持该开放规范（[agentskills.io/specification](https://agentskills.io/specification)，已核实）。
3. **确定性拦截收敛到 `PreToolUse` / `PostToolUse` / `SessionStart` / `Stop` Hooks**：除 Aider 外几乎全部提供基于 stdin/stdout JSON 或退出码 `2` 的同步 Hook。

### 2. 适配器架构设计（严守 AD-2 与 A4/M3）

**【设计】**

1. **目录边界（守住 AD-2）**：
   - `core/` 保持绝对纯净，不提任何 Agent 名称与路径。
   - 在 `docaxioms` 包内新增 `adapters/` 模块（与 `templates/` 并列），提供统一 CLI：`docaxioms adapt --agents claude,codex,cursor,copilot,gemini,windsurf,kiro,aider,cline,roo,opencode`（也可在 `docaxioms.json` 的 `"adapters"` 数组声明，由 `init` / `update` 自动同步）。
2. **如何彻底杜绝多份入口文件沦为 A4 手抄副本（四项铁律）**：
   - **铁律 1：入口唯一真相源**：人类/项目只手写 `AGENTS.md`（≤100 行路由图）。**任何工具都不复制 `AGENTS.md` 的正文**。
     - 原生读 `AGENTS.md` 的工具（Codex/Cursor/Copilot/Windsurf/Kiro/Cline/Roo/OpenCode）：**零副本**。
     - Claude Code：`CLAUDE.md` 仅 1 行 `@AGENTS.md`（继续保持现有桥接，兼容所有版本）。
     - Gemini CLI：`.gemini/settings.json` 配置 `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }`（或 `GEMINI.md` 仅 1 行 `@AGENTS.md`）。
     - Aider：`.aider.conf.yml` 仅写 `read: [AGENTS.md]` + `lint-cmd: "npx --no-install docaxioms check"`。
   - **铁律 2：按需规程统一放 `.agents/skills/`（一份多用）**：
     - 生成 3 个精简 Skill（严格遵循 `agentskills.io` 规范，发现层 ~100 tokens，正文 <500 行）：
       - `.agents/skills/docaxioms-work/SKILL.md`（改代码时如何更新文档、写决策、更新 pin、收尾）
       - `.agents/skills/docaxioms-garden/SKILL.md`（只读审计流程，指向 `docaxioms/GARDEN.md`）
       - `.agents/skills/docaxioms-resume/SKILL.md`（中断恢复对账协议）
     - 这直接解决了 `research/调研校验与迭代参考.md` 第三节指出的“冷启动必读链过长（含整份 GUIDE + 1,983 B profile 字典）”问题：`AGENTS.md` 不再要求无条件全量读 `GUIDE.md`，改为冷启动读 `AXIOMS.lock.md` + `CURRENT.md`，实际改文档/做审计时由 Skill 按需加载对应章节。
   - **铁律 3：薄 Hook 转发器（所有工具调同一条 CLI）**：
     - 各 Agent 的 Hook 配置不做任何业务逻辑，只是一行转发到统一入口 `npx --no-install docaxioms hook <event> --agent <name>`（由 docaxioms 内部适配各工具的 stdin/stdout JSON 协议与 exit code 2 语义）：
       - `SessionStart` / `TaskStart` / `TaskResume` → `docaxioms hook session-start`（注入 `CURRENT.md` + 中断恢复简报）
       - `PreToolUse` / `pre_write_code` / `beforeShellExecution` → `docaxioms hook pre-tool`（拦截编辑 `AXIOMS.lock.md`、`docs/history/`、删改已发布决策行、禁止 `--no-verify`）
       - `PostToolUse` / `post_write_code` / `afterFileEdit` / `PostFileSave` → `docaxioms hook post-tool`（轻量增量提示：若改了被 pin 覆盖的源码文件，立刻提示需复核的文档；记录到 `.docaxioms/session.json`）
       - `PreCompact` → `docaxioms hook pre-compact`（落盘当前检查点）
       - `Stop` / `AfterAgent` → `docaxioms hook stop`（快速检查改动文件涉及的链接/pin/预算，未通过时按配置阻断或强提示）
   - **铁律 4：生成物受精确门禁校验（M3）**：
     - 所有由 `docaxioms adapt` 生成的桥接/Hook/Skill 文件，其 SHA-256 记录在 `docaxioms.json` 的 `adapters.files`（与现有 `core.files` 机制完全同构）。
     - `docaxioms check` 新增精确门禁 `adapter files match generated manifest (A4, M3)`——任何人手改适配器文件导致与声明漂移，或忘记随 `update` 刷新适配器，立即 FAIL；项目级自定义 Hook 放独立文件（如 `.claude/settings.local.json` 或声明 `custom: true`），绝不混写。

> **特别注意（已核实的安全边界）**：
> - **Codex CLI** 的本地项目 `.codex/hooks.json` 需用户在 TUI 执行 `/hooks` 信任内容哈希后才会运行（[developers.openai.com/codex/hooks](https://developers.openai.com/codex/hooks)）；
> - **GitHub Copilot Coding Agent** 的 `.github/hooks/*.json` 必须已合并在默认分支才对云端会话生效（[docs.github.com/en/copilot/reference/hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)）；
> - **Cline** 的 `.clinerules/hooks/*` 文件须无扩展名且具备 `+x` 可执行权限（Windows 兼容性需单独测试）。
> 这些差异全部封装在 `docaxioms adapt` 与 `docaxioms doctor` 诊断命令中，不在 `core/` 出现。

---

## D. 全流程开发文档管理系统设计

### 1. 设计原则：用 docaxioms 公理裁剪经典框架

**【已核实事实】** 外部成熟软件文档框架分为三块互补体系：arc42（系统架构蓝图，12 节，[arc42.org](https://arc42.org)）、ADR/MADR（架构决策记录，[adr.github.io/madr](https://adr.github.io/madr)）、Diátaxis（用户/开发手册四象限：Tutorials/How-to/Reference/Explanation，[diataxis.fr](https://diataxis.fr)），以及 OpenSpec 的“现行真相（specs）与进行中变更（changes）分离”。

**【设计】** 对中小到大型软件项目而言，直接全套引入 arc42（12 节）+ Diátaxis（4 象限）会导致文档数量爆炸、违反 A3（有限注意力）和 A4（多份手抄）。本方案基于 **M1 四类断言（K1/K2/K3/K4）+ M3 一事一主 + M4 可达有界**，将全流程收束为 **9 个常驻核心文档 + 3 个按需增长目录 + 2 个受检/运行态外围目录**。

### 2. 文档清单（总览：9 个固定常驻文档 + 3 类按需目录）

| # | 文档 / 目录 | 数量 | M1 类别 | 唯一负责的事实（M3） | 谁读 / 何时读 | 预算上限 | 守卫门禁 / 审计 |
|---|---|---|---|---|---|---|---|
| 1 | `README.md` | 1 | K3 | 项目对外定位、快速开始、核心命令与入口导航 | 人类与新贡献者 / 首次进入 | ≤150 行 | links, commands, paths, budgets |
| 2 | `AGENTS.md` | 1 | K2+K3（标明边界） | Agent 冷启动路由图：必读顺序、验证命令、禁止事项 | 所有 Agent / **每次冷启动** | **≤80 行 / 5000 字** | budgets, links, commands |
| 3 | `CURRENT.md` | 1 | K3 | 阶段卡：`Active`（链接 plan）、`Blocked on owner`、`Next`、`Not verified` | 人与 Agent / **每次会话启动与交接** | **≤45 行 / 4000 字** | card budget, active-links-plan, links |
| 4 | `docaxioms/{AXIOMS.lock,GUIDE,GARDEN,LICENSE}.md` | 4（锁定包） | K2 | 不可变公理、操作指南、只读审计规程（由上游 pinned） | Agent 按需（冷启动仅必读 `AXIOMS.lock.md`） | 锁定 | core hash + CLI version + Ruleset/CODEOWNERS |
| 5 | `docs/README.md` | 1 | K3 | 全部现行文档的**唯一总索引**（地图） | 人与 Agent / 找具体任务页时 | ≤80 行 | reachable 起点, links, budgets |
| 6 | `docs/decisions.md`（大型项目可选 `docs/decisions/NNNN-slug.md` + 索引） | 1（或目录） | **K2（现行规范）+ K1（历史裁决记录）** | Owner 的全部权威决定：ID、问题、决定、被拒选项摘要（A8）、状态、落地点链接 | 人与 Agent / 涉及意图争议、需求变更、新决策时 | 无硬上限（历史只增不删）；索引表保持精炼 | decision id/status/landing + **A5 不可删改门禁** + CODEOWNERS |
| 7 | `docs/architecture.md`（复杂项目拆至 `docs/specs/*.md`） | 1（+按需拆页） | **K3** | 系统当前真相：模块边界、核心数据流、不变量、关键接口契约、**代码 Pin 锚点** | 人与 Agent / 改对应模块前按需读 | 单页 ≤250 行 | links, paths, commands, **code pins**, `codeToDocs`(aid), garden |
| 8 | `docs/limits.md`（含运行与已知限制） | 1 | **K3** | 已知边界、不支持场景、故障排查、运行/发布操作手册（Runbook）与环境前提 | 开发者、运维、Agent / 排障、发布、评估可行性时 | ≤200 行 | links, paths, commands, code pins, garden |
| 9 | `docs/plan.md` | 1 | **K4（计划）** | 待办与进行中工作项（含验收标准与开放研究链接）；**完成/放弃即删除**（不留死计划） | 人与 Agent / 选任务、收尾清项时 | ≤150 行 | open-research-linked, active-links-plan, links |
| 10 | `docs/log.md`（按季度/年归档） | 1 | **K1（记录）** | 已完成步骤的带日期账本：做了什么、跑了哪些验证、**没跑哪些验证（A1）**、关联 PR | 人类审计、复盘 / 追溯近期进展时 | 定期轮转至 `docs/history/log-YYYY-Qn.md` | **A5 只增不删门禁**（不参与 K3 paths/garden 扫描） |
| 11 | `docs/research/*.md` | 0..N（按需） | **K4（开放调研）** | 仅服务 `docs/plan.md` 开放项的调研、方案对比、原型结论；头部声明 `Status: open (<item>)` | 负责该任务的人与 Agent / 仅做该项时 | 随项关闭迁入 `docs/history/` | research-linked-to-open-plan（修缺陷 8） |
| 12 | `docs/history/` | 0..N（只增） | **K1（退役档案）** | 退役描述、关闭的研究、历史轮转日志；标题下强制挂 `Out of date` 横幅并指向现行文档 | 仅追溯历史原因时（**不在冷启动路径上**，M4） | 无限（离线外围） | history AST 不可变门禁（仅允许 URL 修正与末尾带日期勘误） |
| 13 | `docs/reviews/`（可选，轻量团队放 PR） | 0..N | **K1（审计报告）** | 定期 `garden` 只读漂移审计报告（带日期、逐条源码行号证据、处理决议） | Owner / 维护者 / 定期治理 | 按日期只增 | A5 不可改 |

> **核心常驻文件计数**：根层 3 个（`README.md`、`AGENTS.md`、`CURRENT.md`）+ 锁定规范 1 组（`docaxioms/`）+ `docs/` 核心 6 个（`README.md`、`decisions.md`、`architecture.md`、`limits.md`、`plan.md`、`log.md`）= **9 个常驻业务/入口文档槽位 + 1 个锁定规范目录 + 3 个弹性目录（`specs/`、`research/`、`history/`）**。
> 绝大多数新项目从 9 个文件起步即可完整跑通全生命周期，只在模块膨胀超预算（单页 >250 行）时才按 `docs/specs/<domain>.md` 拆分。

### 3. 完整目录树

```text
<repo-root>/
├── README.md                         # [K3] 人类入口 & 快速开始 (≤150行)
├── AGENTS.md                         # [K2/K3] Agent 冷启动路由图 (≤80行, SSOT)
├── CURRENT.md                        # [K3] 阶段卡：Active/Blocked/Next/Not verified (≤45行)
├── CLAUDE.md                         # [生成/受检] 仅 1 行 `@AGENTS.md` 桥接
├── docaxioms.json                    # [配置/受检] Profile + core/adapter 清单 (CODEOWNERS 保护)
├── .gitattributes                    # [Git契约] 锁定 core/ 为 LF；标注生成适配器 linguist-generated=true
├── .gitignore                        # 忽略 .docaxioms/session.json 等本地运行态
│
├── docaxioms/                        # [K2 锁定/只读] 上游纯文本规范 (CODEOWNERS 保护)
│   ├── AXIOMS.lock.md                # 公理 A0-A8, M1-M4
│   ├── GUIDE.md                      # 维护指南
│   ├── GARDEN.md                     # 只读审计规程
│   └── LICENSE
│
├── docs/                             # 文档主体
│   ├── README.md                     # [K3] 现行文档总索引（reachable 起点）
│   ├── decisions.md                  # [K2+K1] Owner 决策台账（A5 只增不删，CODEOWNERS 保护）
│   ├── architecture.md               # [K3] 系统总体架构、边界与核心 Pin
│   ├── limits.md                     # [K3] 已知限制、运行手册与环境前提
│   ├── plan.md                       # [K4] 开放工作项（完成/放弃即清理）
│   ├── log.md                        # [K1] 带日期的验证与完成日志（A5 只增不删）
│   ├── specs/                        # [K3 按需] 领域详细描述（仅超预算时拆分，带 code pins）
│   │   └── <module>.md
│   ├── research/                     # [K4 按需] 开放调研（必须链接到 plan.md 开放段）
│   │   └── <topic>.md
│   ├── reviews/                      # [K1 按需] 定期 garden 漂移审计报告（YYYY-MM-DD-garden.md）
│   └── history/                      # [K1 只增] 退役文档、归档研究与轮转日志（AST 不可变）
│       └── README.md
│
├── .agents/skills/                   # [生成/受检] 跨 Agent 开放标准按需技能 (agentskills.io)
│   ├── docaxioms-work/SKILL.md
│   ├── docaxioms-garden/SKILL.md
│   └── docaxioms-resume/SKILL.md
│
├── .claude/ | .codex/ | .cursor/ | .gemini/ | .github/hooks/ | .windsurf/ | .kiro/ | .clinerules/
│                                     # [生成/受检] 按 docaxioms.json 声明生成的薄 Hook 转发器
│
├── .github/
│   ├── CODEOWNERS                    # [L4 治理] 锁定 docaxioms/, docaxioms.json, decisions.md, workflows, adapters
│   ├── PULL_REQUEST_TEMPLATE.md      # [E 节] 结构化文档影响与验证声明模板
│   └── workflows/
│       ├── docaxioms-gate.yml        # [L3 强门禁] Always-Running Gate + --require-base + PR 注解
│       └── docaxioms-garden.yml      # [F 节] 定时漂移巡检与自动建 Issue
│
└── .docaxioms/                       # [本地运行态, .gitignore 禁止入库]
    └── session.json                  # 会话检查点、中断状态与最近命令证据
```

### 4. 全生命周期映射（需求 → 退役）

| 生命周期阶段 | 触发事件 | 涉及文档 | 精确硬门禁守什么 | Aid / 人工审查补位 |
|---|---|---|---|---|
| **1. 需求与调研** | 新需求提出、技术选型不明 | 新建 `docs/plan.md` 条目；如需深研建 `docs/research/<topic>.md`（标 `Status: open (<item>)`） | `research` 文件必须被 `plan.md` 开放段真实链接；链接可达 | Owner 确认需求范围是否值得立项 |
| **2. Owner 决策** | 架构权衡、行为契约、约束变更 | 先改受影响的 K3 段落（标明 `<ID>`），再向 `docs/decisions.md` 追加行（含问题、决定、被拒选项摘要、落地点） | 决策 ID 唯一、状态合法、落地点存在且双向引用；旧决策行未删改（A5） | **CODEOWNERS 强制 Owner 批准 PR**（守 A0：确认为 Owner 意志） |
| **3. 计划认领与冷启动** | 开始一次开发任务/会话 | 更新 `CURRENT.md` 的 `Active` 指向 `plan.md` 项；`SessionStart` Hook 自动初始化 `.docaxioms/session.json` | `Active` 链接有效；`CURRENT.md` 未超预算；无未处理中断态 | 确认无未决 `Blocked on owner` 阻塞 |
| **4. 实现与同任务改文档** | 修改源码与对应行为 | 同分支/PR 更新 `docs/architecture.md`（或 `docs/specs/*.md`）、`docs/limits.md`；用 `pin --relocate` / `pin --write` 刷新锚点 | `PostToolUse` 实时提醒受影响 pin；`check` 强校验 links、paths、commands、code pins、budgets | `codeToDocs`（aid）提醒可能漏改的文档；PR diff 人工核对散文与代码行为一致（A0） |
| **5. 验证与会话收尾** | 任务完成或阶段交付 | `docs/log.md` 追加带日期条目（跑了什么/没跑什么，A1）；删除 `plan.md` 已完成项；研究迁入 `docs/history/` 加横幅；重写 `CURRENT.md`；`session close` | `Stop` Hook & CI 强跑 `docaxioms check --require-base`；`history` AST 不可变；`session.json` 未入库 | 人类审 PR 检查清单（仅审 A0 语义、K2 权威、M1 混写） |
| **6. 发布与上线** | 打 Tag / 发 Release | 更新 `docs/limits.md`（如新增运维/版本前提）；确认 `README.md` 对外命令无误；`docs/log.md` 记发布验证范围（A1） | CI Release 前校验 commands、links、pins、core/adapter 一致 | 触发一次 Release 后 `garden` 审计任务 |
| **7. 定期审计（Garden）** | 定时周期 / 大重构后 / `aid` 累积 | 只读执行 `docaxioms garden` + `GARDEN.md` → 产出 `docs/reviews/YYYY-MM-DD-garden.md`；发现代码与决策冲突先报 Owner，经确认后再改 K3 | `docaxioms check` 确保审计修复后所有机械不变量成立 | 人类维护者核验每条源码行号证据（不信任无证据的 LLM 摘要） |
| **8. 文档/功能退役（Retire）** | 模块下线、决策过时、文档不再描述现状 | 搬走仍有效的事实到现行所有者；文件移至 `docs/history/` 加 `Out of date` 横幅与继任链接；旧路径加入 `gonePaths`；更新所有入链；若涉及决策，只改状态为 `superseded by <ID>` / `withdrawn` | `gonePaths` 确保旧路径不再复生；links 确保无断链；history 门禁保护退役文件此后只增勘误 | 检查外部引用与权威归属（旧文档若仍为某规范权威则先迁权威） |

---

## E. 人类阅读与审查的便利性、高效性、可靠性与延续性

**【已核实事实】** `research/调研校验与迭代参考.md` 第四节已核实 Yang、He 与 Zhou 的实证：**超过 70% 的指令文件 PR 没有实质性的人工审查，且 AI 自动审查仅召回了人类关注点的 1.3%–3.9%**。这揭示了一个残酷现实：**人类不是不想审，而是被噪声淹没、看不出重点、且缺乏制度硬约束**。

### 1. 便利性与 Diff 降噪（让人类一眼看清该看什么）

**【已核实做法 + 设计】**
1. **自动折叠机械与生成物 Diff（`.gitattributes`）**：
   - **【已核实事实】** 在 `.gitattributes` 标注 `linguist-generated=true` 可让 GitHub 在 PR “Files Changed” 视图默认折叠这些文件，显著降低认知负担且避开部分评审机器人噪声（[nesbitt.io / GitHub Linguist 机制](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github)，已核实概念）。
   - **落地配置**：对 `docaxioms/**`（除更新规范 PR 外）、`.agents/skills/**`、各 Agent 自动生成的薄 Hook/桥接文件标记 `linguist-generated=true`（仍由 L3 CI 校验哈希，L4 CODEOWNERS 守护，但普通业务 PR 中不干扰视线）。
2. **行内精准注解而非刷屏评论（Check Runs + Annotations）**：
   - **【已核实事实】** 使用 GitHub Checks API / `reviewdog`（`filter_mode: added` + `-reporter=github-pr-check`）可将诊断直接标在改动行边栏，不污染 PR 对话流且避免旧文档噪音（已核实实践）。
   - **落地设计**：升级 `docaxioms check --json` 输出标准 `code` + `file` + `line` + `remediation`（见 `research/调研校验与迭代参考.md` 第三、四节，报错附带修复指引源自 OpenAI Harness Engineering），在 GitHub Action 中转为 **GitHub Check Annotations**（及可选 SARIF 上传）+ **单一可更新 PR 摘要评论**（Sticky Comment，每次 push 原地覆盖，绝不重复发 10 条评论）。
3. **面向人类的 PR“文档影响简报”**（由 CI 自动生成在 Sticky Comment 中）：
   - 列出本次 PR 触及的 **M1 文档类型分布**（K1/K2/K3/K4 各几处）；
   - **K2 决策变更高亮框**：新增/改状态的决策 ID、决定摘要、落地点直达链接（红色醒目标注“需 Owner 确认”）；
   - **Pin 变更对照**：区分“仅行号平移（`--relocate`，低风险）”与“锚定源码内容变化（`--write`，**高风险，必须核对旁白散文**）”；
   - **`codeToDocs` 提示表**：改动了哪些源码文件、映射到哪些未动文档，附 1 键跳转链接。
4. **可选的只读人类阅读视图**：
   - 保持仓库纯 Markdown 即可在 GitHub/IDE 原生阅读；若大型团队需要全文检索与导航，可用零侵入静态站（如 VitePress/MkDocs）**单向渲染** `docs/`，绝不回写源文档（守 M3）。

### 2. 审查高效性（把人类注意力聚焦到机器守不住的 3 件事）

**【设计】** 在 `.github/PULL_REQUEST_TEMPLATE.md` 与 PR Sticky Comment 中，固化一份**3 分钟极简人工审查清单**（机械项全部由 CI 归零，人类绝不再肉眼查链接、路径、预算）：
- [ ] **A0 权威核验（有 K2 改动时必查）**：新增/修改的决策是否确由 Owner 拍板？落地点是否准确表达了 Owner 原意而非 Agent 擅自扩展？
- [ ] **A0/A2 行为核验（有 K3/Pin 内容变更时必查）**：PR 中被改动（或被 `codeToDocs` 点名）的 K3 描述，与本次代码 diff 的真实行为是否一致？
- [ ] **M1/A4 卫生核验**：是否把“曾经如何”的历史叙述混进了 K3 现行描述？是否把另一份文档已拥有的事实手抄了一遍？

### 3. 审查可靠性（确保审查记录本身可信，防自审与偷换）

**【已核实平台能力 + 设计】** 结合 GitHub Rulesets 官方能力（[managing-rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets)，已核实）：
1. **强制审批隔离**：Ruleset 开启 `Require pull request before merging` + `Require review from Code Owners` + **禁止作者自批**（GitHub 默认不允许 PR 作者 Approve 自己的 PR，若使用 AI Coding Agent 发 PR，确保其用独立 Bot/App 身份而非 Owner 个人 PAT，否则会破坏主体隔离）。
2. **防审批后偷梁换柱**：Ruleset 强制开启 **`Dismiss stale pull request approvals when new commits are pushed`**——任何在审批后追加的提交（哪怕是 Agent 自动修复 lint 顺手改了文档）都会立即撤销旧审批，必须重审。
3. **防身份伪造**：Ruleset 开启 **`Require signed commits`**（GPG/SSH 签名），杜绝在本地用 `git config user.name` 冒充 Owner 提交决策或公理变更。
4. **决策行溯源绑定**：在 `docs/decisions.md`（或独立 ADR 文件）中可选记录关联 PR 号与合并日期（如 `2026-11-26, PR #42`），使每一条 K2 规范都能在托管平台审计日志里追溯到真实的审批人与审批时间。

### 4. 延续性（抗人员更替与知识流失）

**【设计】**
1. **15 分钟新人冷启动路径（M4）**：固定阅读顺序 `README.md` → `CURRENT.md` → `docs/architecture.md` → `docs/limits.md`，全程无需打开 `docs/history/` 或 `docs/research/`；总阅读量受预算硬门禁锁定（合计 ≤500 行）。
2. **角色化所有权而非绑定个人**：`.github/CODEOWNERS` 绑定组织团队（如 `@org/architecture-owners`、`@org/doc-maintainers`），避免单人离职导致门禁死锁或失管。
3. **为什么（A8）强制入档**：每条决策要求写明“被问了什么 + 被拒选项简述 + 决定”（对应 arXiv 2608.11095 实证：写清理由可使后续安全删减率从 6.0% 升至 17.1%、合规率提高 6.6 个百分点）。
4. **交接不靠口述**：人员变动或休假交接，只需核对 `CURRENT.md`（`Active` + `Blocked on owner` + `Not verified`）与近期 `docs/log.md`；离任前跑一次 `docaxioms garden` 产出带日期的基线审计报告留档 `docs/reviews/`。

---

## F. 检查的自发性保证：五层无记忆自动触发体系

要解决“依赖人或 Agent 记得去跑”，必须把触发点绑定到**不可绕过的开发与时间事件**上，形成五层自动触发闭环。

### 1. 五层自动触发架构

| 触发层 | 触发事件 | 自动执行动作 | 覆盖对象 | 绕过面（A6） | 补偿层 |
|---|---|---|---|---|---|
| **F1. Agent 生命周期自动触发** | `SessionStart` / `PreToolUse` / `PostToolUse` / `PreCompact` / `Stop` | ① 启动注入 `CURRENT.md` + 恢复简报；② 写前拦截受保护文件；③ 写源码后增量提示受影响 pin/`codeToDocs`；④ 回合结束自动跑 `docaxioms check`（支持阻断的 Agent 直接 `exit 2` 打回修复） | 使用 Claude Code、Codex CLI、Gemini CLI、Cursor、Copilot、Windsurf、Kiro、Cline、OpenCode 等的会话 | 换用无 hook 工具（纯手写/旧版 Aider）；用户禁 hooks；Codex 未 `/hooks` 信任；绕过工具走间接脚本 | F2 + F3 |
| **F2. 本地 Git 生命周期自动触发** | `pre-push`（首选，而非 `pre-commit`，符合 `README.md` 建议：允许代码和文档分提交，推送前配对通过） | `lefthook` / `pre-commit` / `package.json` `prepare` 自动设置 `core.hooksPath`，推送前自动跑 `docaxioms check` | 任何使用本地 Git 的人类与 Agent | `--no-verify`；未执行 install/init 的裸 clone；Git GUI 客户端环境差异 | F3 |
| **F3. PR / Merge Queue 远端强门禁** | `pull_request` + `merge_group` | CI 强制 `fetch-depth: 0` + `docaxioms check --require-base` + **Always-Running Gate Job** + 生成 PR 注解与 Sticky 摘要；Ruleset 设为 Required Check | 全部合入主干的变更（零记忆成本） | 仅 Ruleset bypass 管理员；`paths:` 误配死锁（**通过 Always-Running Gate 消除**） | F4 事后巡检 + L4 审计日志 |
| **F4. 定时自动巡检与 Garden 触发** | `schedule`（如每周一 02:00 UTC）+ **防 60 天停用保活/外部触发** | 自动跑 `docaxioms check --report --json` + `docaxioms garden --json`：① 若发现漂移/过期 aid 累积/超期未清空的 `CURRENT.md`/`research`，自动创建或更新**单一去重 Issue**（标签 `doc-drift`，`@CODEOWNERS`）；② 可选按季度自动开一个“例行 Garden 审计任务单” | 检测“代码没动但外部依赖/时间推移/跳过 PR 的遗留漂移”（A2 外部依赖） | **【已核实陷阱】** GitHub Actions 公开仓库连续 **60 天无默认分支提交**会自动静默停用 `schedule` 工作流且不发失败邮件（[GitHub Docs: Disabling and enabling a workflow](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow)，已核实） | 见下方“60 天陷阱反制” |
| **F5. 里程碑事件驱动触发** | Release 发布（`release: published`）、大 PR 合并（改动文件 >N 或涉及核心架构目录） | 自动在 PR 合并后或发版后开启追踪 Issue / 触发 `garden` 清单，提醒对本次大变更关联的 K3 文档做只读语义复核 | 解决“平时小改没问题，大重构后散文整体失真”的盲区 | Issue 开了没人认领 | 纳入团队迭代/发版 Checklist 与 SLO（如发版前必须关闭 `doc-drift` P0 Issue） |

### 2. 必须避开的两个平台级坑（已核实）

1. **GitHub Actions `paths:` + Required Check 永久 Pending 死锁**（已核实）：
   - **坑**：若在 workflow 顶层写 `on: pull_request: paths: ['docs/**', 'src/**']` 并将其设为 Required Check，当某个 PR 只改了 `.gitignore` 时 workflow 根本不启动，GitHub 永久卡在 `Expected — Waiting for status to be reported`，合并按钮锁死。
   - **解法**：`docaxioms-gate.yml` **绝不在顶层使用 `paths:` 过滤**（`docaxioms check` 本身毫秒-秒级极快，每次 PR 全跑即可）；若项目另有重型任务，必须用 `dorny/paths-filter` + 永不跳过的 `ci-gate` 汇总作业作为 Required Check。
2. **GitHub Actions 公开仓库 60 天无活动自动停用 Cron**（已核实）：
   - **解法**：对低频维护的公开仓库，除原生 `on: schedule` 外，增加 `workflow_dispatch` / `repository_dispatch` 入口，配合外部轻型定时监控（如外部 cron/监控服务每月校验并触发，或在 `release`/人工维护周期里检查工作流启用状态），避免漂移巡检在无声中死亡。

### 3. 严守 A0：自发性只触发“检测与报告”，绝不自动改写文档

- F4/F5 定时巡检或 PR Bot **绝不**自动提“AI 重写文档迎合代码”的自动合并 PR（如 Mintlify Autopilot / Dosu Auto-Accept 模式），以免违背 A0 并制造虚假绿灯。
- 唯一允许由机器人自动建议（仍需人类审核合并）的机械操作，仅限于 **零语义改动的 `pin --relocate`（源码哈希完全未变、仅行号平移）**，且必须以独立 Draft PR 或建议补丁形式呈现。

---

## G. 可行性评级、公理/决策冲突与待 Owner 决策清单

### 1. 分项可行性评级与风险评估

| 模块 / 子项 | 可行性评级 | 核心依据 | 主要风险与缓解 | 与公理/决策的冲突分析 |
|---|---|---|---|---|
| **A1. 修复 15 项既有源码缺陷（尤以 4/1/2/3/5/11 为先）** | **完全可行** | 根因与修法已在 `research/调研校验与迭代参考.md` 实跑定位，纯 JS 低风险 | 缺陷 7（CRLF）、13（gitignore）、9（非 md 落地点）涉及契约变更，可能破坏存量项目预期 | 无冲突；直接落实 A6/A7/M2。契约变更需 Owner 拍板 |
| **A2. 新增精确硬门禁（Schema、A5 日志/决策不可删改、`--require-base`、适配器哈希）** | **完全可行** | 均为确定性语法/哈希/Git 集合谓词，符合纯 JS（AD-4） | 若在未验证误报率前直接强阻断，可能违反 A7 | **须遵守 AD-7**：新门禁（尤其 A5 日志/决策检查）须先以 `aid` / `--report` 在外部真实项目跑满 ≥10 次相关变更 + ≥3 条发现，再由 Owner 升格；且决策退役前须先补 `GUIDE.md` |
| **A3. L3/L4 托管平台硬门禁（Rulesets + CODEOWNERS + Merge Queue + 签名）** | **完全可行（平台依赖）** | GitHub 原生能力已核实；GitLab/Bitbucket 有等价机制 | 个人单人仓库无法强行“禁止作者自批”；免费版/私有仓库部分 Ruleset/Merge Queue 功能受套餐限制 | 无冲突；文档须按 A6 写明单人仓库与套餐限制下的退化边界 |
| **B. Session 重启与中断恢复（`CURRENT.md` 升级 + `.docaxioms/session.json` + `docaxioms session`）** | **有条件可行** | 文件系统外置状态 + JSON 检查点已被 Anthropic 实战验证；CLI 与 Hook 实现简单 | ① 依赖 Agent Hook 支持度（Aider 与旧版工具无 `SessionStart`/`PreCompact` hook，只能退化为手动命令）；② 若误把 `session.json` 提交进 Git 会造成脏态 | 不冲突，但须**守住 M1 与 A4**：禁止在 `CURRENT.md` 写 commit hash，Git 可派生状态绝不落盘重复；`session.json` 必须 gitignore 并受门禁保护 |
| **C. 主流 10+ Agent 适配器体系（`docaxioms adapt` + 统一 Hook 转发 + `agentskills.io`）** | **有条件可行** | `AGENTS.md` + `SKILL.md` + Hooks 在 2026 年高度收敛；外围目录不触碰 `core/` | ① 各 Agent Hook Schema 演进快（如 Windsurf 向 `.devin/` 过渡、Roo Code Hooks 仍在补齐工具覆盖），适配器有持续维护成本；② Codex 需人工信任 Hook 哈希、Cline 需无扩展名 `+x` 脚本（跨平台 Windows 易踩坑） | **严守 AD-2**：适配器与 Skill 模板全部放 `core/` 外；通过生成物哈希门禁守住 A4/M3；需 Owner 确认将适配器纳入官方维护范围（及是否分层级支持：Tier 1 强保证 vs Tier 2 社区模板） |
| **D. 全流程文档体系（9 常驻 + 3 弹性目录）** | **完全可行** | 直接在现有模板上扩展 `architecture.md`、`limits.md`、升级 `CURRENT.md`，与 M1/M3/M4 完美契合 | 小型脚本/工具类项目可能觉得 9 个文档偏重 | 提供两档模板预设（`minimal`：沿用现有 6 槽位；`full`：全流程 9 槽位），避免强迫小项目背负空文档（A3） |
| **E. 人类阅读与审查体系（Diff 折叠、Check 注解、Sticky 摘要、3 分钟清单）** | **完全可行** | 依赖结构化 `--json`（加 `code`/`file`/`line`）与薄 GitHub Action，技术成熟 | 若 PR Sticky Comment 过长会再次制造阅读疲劳（违背 A3） | 无冲突；摘要严格限长（默认折叠明细，只突出 K2 决策、内容变更的 Pin 和失败项） |
| **F. 五层自发性触发（含定时 Garden 与防 60 天停用）** | **有条件可行** | CI + Git Hooks + Agent Hooks + Cron 均成熟 | ① 公开库 60 天无提交停用 Cron 需外部保活或事件兜底；② 定时开的 `doc-drift` Issue 若无人认领仍会堆积成“告警疲劳”（A7 变体） | 无冲突；严守 A0（只建报障 Issue，不自动改写文档）；采用单一去重滚动 Issue 防止刷屏 |
| **绝对不可行 / 禁止项** | **不可行（原则红线）** | ① 用 LLM 作为阻断合并的语义硬门禁（高误报+不可复现，违背 A6/A7/M2）；② 代码驱动自动改写文档迎合代码（违背 A0）；③ 在 `core/` 写死任何工具名/路径（违背 AD-2）；④ 常驻 MCP Server（已达成共识不做，浪费每会话上下文） | — | 直接违反核心公理与既有决策 |

### 2. 需要 Owner 明确决定的问题清单

#### 第一组：仓库已有待决分歧（来自 `research/调研校验与迭代参考.md` 第五节，阻塞首批修复）
1. **缺陷 7（换行契约）**：`core` 哈希继续按字节认文件、由 `init` 写 `.gitattributes` 锁定 LF（推荐，守 A4 字节身份，且不进 `core/`）；还是改为统一 LF 归一化（需契约迁移说明）？
2. **决策退役规则**：在 `core/GUIDE.md` 补一条“不再适用/未发布决策改状态为 `withdrawn` 并保留原文”的统一规则（推荐，便于做统一的 A5 精确门禁）；还是明确允许删除未发布的决策行？
3. **缺陷 13（被 `.gitignore` 忽略的目标）**：默认报错并为构建产物开显式豁免（推荐，避免“本地过、干净 CI 挂”）；还是维持“磁盘存在即过”？
4. **缺陷 9（非 `.md` 落地点）**：决策落地点指向源码文件时，去源码查决策 ID，还是直接禁止非 Markdown 落地点？
5. **`docaxioms.json` 扩展键约定**：做 strict Schema 校验（缺陷 4）时，是否约定 `x-*` 作为项目私有扩展键前缀？

#### 第二组：本全流程方案引入的新增决策（需 Owner 拍板后方可实施）
6. **Agent 适配器官方定位与分级（关联 AD-2、AD-3）**：是否在 `docaxioms` 仓库外围（`core/` 之外）正式提供 `docaxioms adapt`、`docaxioms hook` 与 `agentskills.io` 标准 Skill 包？建议采用分层承诺：**Tier 1（CI 契约测试覆盖：Claude Code、Codex CLI、Cursor、GitHub Copilot、Gemini CLI）**，**Tier 2（标准模板支持：Windsurf、Kiro、Cline、Roo Code、OpenCode、Aider）**。
7. **缩短冷启动必读链的方式**：是否允许在 `templates/AGENTS.md` 中将 `GUIDE.md` 从“无条件全量必读”改为“通过 Skill/改文档时按需读”（保留 `AXIOMS.lock.md` + `CURRENT.md` 为冷启动必读），以降低每会话 token 税？
8. **Session 运行态恢复机制范围**：是否接受在 CLI 引入 `docaxioms session` 与本地 `.gitignore` 的 `.docaxioms/session.json`（不改 `core/AXIOMS.lock.md`，仅在外围工具层实现），并同步升级 `templates/CURRENT.md` 增加 `Blocked on owner` 分段？
9. **全流程文档模板档位**：`docaxioms init` 是否提供 `--preset minimal | full`（`full` 启用 9 常驻槽位含 `docs/architecture.md`、`docs/limits.md` 及 `.github/` 治理模板）？
10. **AD-7 外部实证试验田选定**：确定哪一个**外部真实项目**作为首轮试跑对象（跑满 ≥10 次相关变更、收集 ≥3 条有效发现），作为所有新旧门禁（含 A5 日志/决策防删改、命名区域 pin、`--require-base`）升格的唯一前置条件。

---

## 附：本次联网核实来源汇总

| 主题 / 工具 | 核实 URL | 核实状态 |
|---|---|---|
| Claude Code（Hooks / Memory / Skills / Checkpointing） | [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) · [memory](https://code.claude.com/docs/en/memory) · [skills](https://code.claude.com/docs/en/skills) · [checkpointing](https://code.claude.com/docs/en/checkpointing) | 已核实（官方域）；`AGENTS.md` fallback 版本 `2.1.277` 为社区/Issue 交叉印证 |
| OpenAI Codex CLI（AGENTS.md / Hooks / Skills / CLI） | [developers.openai.com/codex/guides/agents-md](https://developers.openai.com/codex/guides/agents-md) · [hooks](https://developers.openai.com/codex/hooks) · [skills](https://developers.openai.com/codex/skills) · [cli](https://developers.openai.com/codex/cli) | 已核实（官方域） |
| Gemini CLI（Hooks / GEMINI.md / Checkpointing / Sessions） | [geminicli.com/docs/hooks](https://geminicli.com/docs/hooks) · [gemini-md](https://geminicli.com/docs/cli/gemini-md) · [checkpointing](https://geminicli.com/docs/cli/checkpointing) · [session-management](https://geminicli.com/docs/cli/session-management) | 已核实（官方域） |
| Cursor（Rules / Hooks / Skills） | [cursor.com/docs/context/rules](https://cursor.com/docs/context/rules) · [hooks](https://cursor.com/docs/agent/hooks) · [skills](https://cursor.com/docs/context/skills) | 已核实（官方域） |
| GitHub Copilot（Instructions / Hooks） | [docs.github.com/en/copilot/how-tos/configure-custom-instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions) · [hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration) | 已核实（官方域） |
| Windsurf Cascade Hooks | [docs.windsurf.com/windsurf/cascade/hooks](https://docs.windsurf.com/windsurf/cascade/hooks) | 已核实（官方域）；`.devin/rules/` 迁移路径为部分核实 |
| Kiro（Hooks / Steering） | [kiro.dev/docs/hooks](https://kiro.dev/docs/hooks) · [kiro.dev/docs/steering](https://kiro.dev/docs/steering) | 已核实（官方域） |
| Aider（Config / Conventions） | [aider.chat/docs/config/aider_conf.html](https://aider.chat/docs/config/aider_conf.html) · [conventions.html](https://aider.chat/docs/usage/conventions.html) | 已核实（官方域） |
| Cline Hooks | [docs.cline.bot/features/hooks](https://docs.cline.bot/features/hooks) | 已核实（官方域） |
| Roo Code（Instructions / Hooks Issues） | [docs.roocode.com/features/custom-instructions](https://docs.roocode.com/features/custom-instructions) · [Roo-Code#11504](https://github.com/RooCodeInc/Roo-Code/issues/11504) · [#10834](https://github.com/RooCodeInc/Roo-Code/issues/10834) | 指令已核实；Hooks 能力为部分核实（Issue 演进中） |
| OpenCode（Rules / Plugins） | [opencode.ai/docs/rules](https://opencode.ai/docs/rules) · [opencode.ai/docs/plugins](https://opencode.ai/docs/plugins) | 部分核实（官方路径与生态教程交叉印证） |
| Agent Skills 开放规范 | [agentskills.io/specification](https://agentskills.io/specification) | 已核实（官方域） |
| Anthropic 长时代理会话交接实践 | [anthropic.com/engineering/effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | 已核实（官方域） |
| GitHub Rulesets / 60 天 Cron 停用 / Paths 过滤死锁 | [managing-rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets) · [disabling-and-enabling-a-workflow](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow) | 已核实（官方域 + 工程实践交叉印证） |
| 软件文档体系标准 | [diataxis.fr](https://diataxis.fr) · [arc42.org](https://arc42.org) · [adr.github.io/madr](https://adr.github.io/madr) | 已核实（官方域） |
