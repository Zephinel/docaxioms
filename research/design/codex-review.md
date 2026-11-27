**结论：主方向成立，但还不宜直接作为实施规格。** CURRENT/plan 生成、决策分文件、事件日志加 checkpoint、G16 流程门禁都可保留；“不取 workflow.md”的理由需要改。

未见必须修改公理的理由。适配留在 core 外符合 AD-2；AD-7 只约束本仓库的判断也正确，升格仍须满足外部实证和 owner 批准。[现行决策](docs/decisions.md:8)

以下按严重度排序。

1. **高｜独立进程不足以保证验收器独立。** [L48 起](research/全流程文档系统方案.md:48)省略了原案“候选代码不得持有签发凭据”的关键条件。同权限子进程仍可能改共享文件或接触凭据。建议明确：可信汇总器读取基线策略，候选执行环境无签发权限，结果经独立通道核验。“策略取自基线”不能独自堵住绕过。[原案](research/design/codex-proposal.md:595)、[GitHub 官方安全边界](https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout)。

2. **高｜综合时丢了证据有效性的关键合同。** [L47](research/全流程文档系统方案.md:47)漏掉环境身份，谓词目录又漏了 G10。相同源码树换工具链、依赖或外部输入，旧证据未必有效；刷新 pin 也不能证明正文经过核对。建议恢复“正文摘要＋依赖集合＋验证方法＋环境身份＋证据”的绑定及失效条件，符合 A1/A2。[原案输入模型](research/design/codex-proposal.md:90)、[G10](research/design/codex-proposal.md:140)。

3. **高｜统一技能目录没有接入保证。** [L182、目录树](research/全流程文档系统方案.md:182)把 GUIDE 改为按需读取，却只列 `.agents/skills/`。支持 SKILL.md 格式不等于扫描这个目录；Claude 官方项目路径是 `.claude/skills/`。建议适配器声明技能发现路径，并生成桥接或受检副本；通过加载探测后才缩短必读链。[Claude 官方技能目录](https://code.claude.com/docs/en/skills#choose-where-skills-load)。

4. **中｜验证与关闭任务的顺序会更换候选树。** [生命周期表](research/全流程文档系统方案.md:260)先验证、合入，再追加 log、归档任务、生成视图；这些修改得到 T₂，针对 T₁ 的记录不能直接覆盖它。建议先准备最终候选再验收，或关闭改动形成新候选重新验收。可信证明宜存外部，避免证明文件写入自身所绑定的树。依据是本文 G17/G19/G20 和 A1。

5. **中｜日志选择合理，但崩溃安全论证不充分。** [L99](research/全流程文档系统方案.md:99)把可变 JSON 与写坏等同；快照可以原子替换，追加日志也需要持久化协议。建议补回意图落盘后才执行、序号与校验、写入串行化、尾部隔离、checkpoint 原子替换及外部副作用“结果未知”的处置。日志优势是保留操作历史，不是格式天然安全。[原案](research/design/codex-proposal.md:257)、[原子替换](https://docs.python.org/3/library/os.html#os.replace)、[Node 持久化选项](https://nodejs.org/api/fs.html#fsappendfilesyncpath-data-options)。开头“未恢复任务不能关闭”也须限定受控模式；[L136](research/全流程文档系统方案.md:136)已承认远端看不到本地恢复状态。

6. **中｜CURRENT/plan 生成可取，但不等于状态真实。** [L100](research/全流程文档系统方案.md:100)把手写 CURRENT 一概判为副本，推导过强：M3 允许唯一维护位置，也允许受检副本。生成只能保证与任务页一致，任务页照样可能陈旧。建议补任务状态核对、项目级优先顺序和有界汇总规则；所有任务不能无限铺进阶段卡。minimal 没有任务页体系时，也要另定维护合同。[M3/M4](core/AXIOMS.lock.md:23)。

7. **中｜决策分文件合理，尚不能宣称退役问题已解决。** [L221](research/全流程文档系统方案.md:221)的“文件不变简单谓词”与 G13 允许修链接、追加勘误不一致，也没定义部分替代和未发布撤回。建议规定接受后冻结、替代事件的作用范围与合法关系、署名勘误；未发布记录能否删除仍交 owner 决定。公理变更引用 owner 原话的 AD-6 例外也应显式保留。[A5 与锁文件变更规则](core/AXIOMS.lock.md:14)、[AD-6](docs/decisions.md:11)。

8. **中｜不单列 workflow.md 可以，但“与 GUIDE 重复”不成立。** [L229](research/全流程文档系统方案.md:229)忽略了原案的项目级生命周期、角色和处理规则。通用 GUIDE 不知道本项目的审批角色、关闭条件或发布例外。建议保留“通用流程＋项目差异”的分工；差异可放 profile、ownership、operations，不必新增同名文件。否则 G19 所称“合法转换”缺少权威定义。[原案职责](research/design/codex-proposal.md:424)、[现行 GUIDE](core/GUIDE.md:9)。

9. **中｜M1 分类过粗，可能让审计误改规范。** [文档清单](research/全流程文档系统方案.md:204)把 CURRENT 全标 K3，把含不变量、接口契约的 architecture 全标 K3。生成不会把计划变成现状；契约若表达 owner 要求，仍是 K2。建议按段标 K3/K4、K2/K3，并明确 garden 不能以代码现状覆盖 K2。[M1](core/AXIOMS.lock.md:21)、[GARDEN 边界](core/GARDEN.md:13)。

10. **中｜零匹配缺合法空集合例外。** [L46](research/全流程文档系统方案.md:46)应区分必需目标丢失与本次确实无对象，例如没有开放研究、没有源码变更。建议输出适用原因与计数，只对声明必须存在的目标失败，避免 A7 所说的无效门槛。[原案明确保留的例外](research/design/codex-proposal.md:114)。

11. **中｜G16 定位正确，处置合同还需补齐。** [G16 段](research/全流程文档系统方案.md:61)正确区分了流程完整与语义正确，但“关联到某份文档”比原案“关联已检查的文档”弱。建议明确受管集合、逐路径处置、责任人、审批条件和差异变化后的失效规则；同时观测是否沦为例行填表。精确可检不等于已有收益，本仓库升格仍受 AD-7 约束。[原案 G16](research/design/codex-proposal.md:173)。

第四节五项争议，联网核实结果如下：

| 事项 | 官方结论与修改建议 |
|---|---|
| Roo Code | 官方仓库已于 **2026-05-15 归档**。标为旧版适配；开放 issue 不能证明仍活跃。[官方仓库](https://github.com/RooCodeInc/Roo-Code) |
| Claude 原生 AGENTS.md | **v2.1.277+ 有官方依据**，不是只能引用社区；但默认受上级 CLAUDE 文件影响，v2.1.281 前还存在部分环境不可用的限制。写明条件，保留 `@AGENTS.md` 兼容桥接。[官方说明](https://code.claude.com/docs/en/memory#agents-md) |
| Codex 项目 hooks | 需要可信项目层，且非托管 hook 的**当前定义哈希**须经用户审阅信任；修改后重新信任。托管 hook 属政策信任，另有显式绕过参数。两份原案没有冲突，持久终端后续输入不重跑前置钩子是另一项限制。[官方 hooks](https://learn.chatgpt.com/docs/hooks) |
| Windsurf 迁移 | 旧文档已重定向 Devin Desktop/Local；新规则用 `.devin/rules/`，部分旧规则默认兼容；新 hooks 用 `.devin/hooks.v1.json`。旧 `.windsurf/hooks.json` 的兼容性仍不能由规则兼容推断。按旧 Cascade、新 Devin Local 分列。[规则](https://docs.devin.ai/desktop/devin-local/customizations)、[hooks](https://docs.devin.ai/cli/extensibility/hooks/overview) |
| Codex 官方域名 | 本轮观察到 `developers.openai.com/codex/` 的 hooks、AGENTS、CLI 页面重定向至 `learn.chatgpt.com/docs/`。后者不能判为非官方；记录旧入口、现目标和核验日期即可。[官方旧入口及重定向](https://developers.openai.com/codex/hooks) |

核验范围：当前 HEAD 为 `a56e5c0`，所述源码目录相对 `8336bed` 无变化；只读自检 `test/self.test.mjs` 通过 1 项。未改文件，未运行会写临时夹具的全量测试，未做各 Agent 安装版探测。