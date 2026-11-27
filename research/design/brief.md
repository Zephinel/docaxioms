# 研究简报：docaxioms 全流程开发文档管理系统

仓库：仓库根（HEAD a56e5c0；src/bin/templates/core 自 8336bed 起未改）。只读，不要修改仓库任何文件。

必读上下文：
- README.md、core/AXIOMS.lock.md、core/GUIDE.md、core/GARDEN.md、templates/ 全部、docs/decisions.md（尤其 AD-1..AD-7）、AGENTS.md
- research/调研校验与迭代参考.md（三份调研报告的校验结论：15 项缺陷、迭代候选、外部证据、待 owner 决定的分歧）
- src/ 按需读

## Claude 上一轮的总结（供你批驳）
- docaxioms 不改 LLM/harness，改的是 agent 冷启动读到的东西和“文档没跟上代码”能否被发现。
- 流程：init → 每任务循环（读：CLAUDE.md→AGENTS.md→公理→GUIDE→CURRENT.md→任务页；owner 决定先改段落再加 decisions 行；改代码同任务改文档、pin relocate/write；收尾写 log、清 plan、重写 CURRENT；check 门禁）→ 定期 garden（只读审计 K3 与阶段卡）→ update（公理变更需 owner 明确同意）。
- 修正：门禁有静默失效（缺陷 4 profile 键名拼错、11 零匹配显示 ok）和绕过（2 history 比较、3 链接越界、13 gitignore 目标）；A5 “旧决策行不删”无检查执行；init 的 `D` 前缀与 CRLF 坑；必读链含整份 GUIDE；AD-7 外部实证为零，所有门禁对新项目都是“已知有缺陷的预发布门禁”。

## 用户的新需求（原话要点）
1. 现在门槛还是不够硬。
2. session 重启的处理不够完善；session 中断后的状态恢复同类问题。
3. 可以加入对主流 Agent 的针对性适配。
4. 设计一套全流程的开发文档管理系统：有多少个文档、每个负责的任务、对应的目录层级。
5. 人类阅读、审查的便利性、可靠性、高效性的保证和延续。
6. 各类确保文档不过时、不腐坏的检查的“自发性”保证（即不依赖人/agent 记得去跑）。
不考虑实现成本，研究实现可行性和对应方案。

## 约束（来自仓库，不可违背，除非你明确提出需 owner 改的决策/公理并说明理由）
- 公理 A0–A8、M1–M4 锁定（AD-1）；core/ 不得出现任何项目名、工具名、其路径或语言（AD-2）——所以“主流 Agent 适配”只能放在 core/ 以外（templates、adapters、CLI）。
- 门禁必须精确（A7、M2）；一个检查只保证它的谓词（A6）；没守住的要在被读的地方说出来。
- 不做自动改写文档迎合代码的闭环（A0）；参考文档“不建议做”一节。
- AD-7：门禁升格需外部真实项目 10 次相关变更、3 条发现。

## 每个方案必须回答
A. 门槛加硬：哪些可以做成精确硬门禁（谓词=性质本身），哪些本质上只能是 aid/审计；“硬”的可行上限在哪（本地 hook 可绕过、CI required check、分支保护、签名/owner review、agent 层 deny/hook）。分层给出强度和“没守住什么”。
B. Session 重启与中断恢复：恢复需要哪些状态（进行中任务、未提交改动、未验证项、owner 待决问题、上次跑过的命令），这些状态放在哪个文档/文件、属于 M1 哪一类、谁写、何时写、如何防止它过时（A2/A4/A5）；中断（未正常收尾）如何被检测并强制恢复；与 CURRENT.md、log 的关系；能否做成可检查的谓词。
C. 主流 Agent 适配：Claude Code、OpenAI Codex CLI、Gemini CLI、Cursor、GitHub Copilot（coding agent/instructions）、Windsurf、Kiro、Aider、Cline/Roo、OpenCode 等——各自的入口文件、hooks/规则/技能/会话恢复机制（请核实，标注是否核实及来源），适配器怎么组织、如何避免多份入口文件成为 A4 的手抄副本（生成或检查）。
D. 全流程文档体系：文档清单（数量）、每个文档职责与 M1 类别、目录树、谁读/何时读、预算；从需求→决策→计划→实现→验证→发布→退役的全生命周期每一步动哪个文档、哪个检查守。
E. 人类阅读与审查：可读性、审查效率（PR 里怎么看文档变更、diff 噪声、审查清单、渲染视图/报告）、可靠性（审查记录本身如何可信）、延续性（人员更替）。
F. 自发性保证：检查怎么在不需要人记得的情况下自动发生（CI、hooks、agent 生命周期 hook、定时任务触发 garden、PR bot），以及每一层的绕过面。
G. 可行性评级与风险：每项方案 可行/有条件可行/不可行，依据；与公理/决策的冲突点；需要 owner 决定的问题清单。
H. 对 Claude 上一轮总结的批驳：错误、高估、遗漏。

输出：中文，结构化，区分“已核实事实（给出处：文件:行 或 URL）”与“推测/设计”。写到你被告知的输出文件；不要改仓库。
