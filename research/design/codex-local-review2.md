基于 HEAD `a56e5c0` 和当前 617 行稿，已逐项对照两份复审及其待决建议，并查阅官方资料。以下仅列仍需修改处；未做平台部署实测。下文“方案”均指 `research/全流程文档系统方案.md`。

1. **P1｜快照导出建议吸收有误。**  
   [方案：104](research/全流程文档系统方案.md:104)采用 agy 的 `git archive` 建议，但普通 archive 会保留符号链接，还会按候选的 `export-ignore` 漏文件、按 `export-subst` 改内容，不能直接作为与 T 等价的检查输入。建议按 Git 对象导出并核对路径、mode、blob 摘要；不支持的对象明确拒绝，不能删掉后仍宣称验收了 T。依据：[属性规则](https://git-scm.com/docs/git-archive#_attributes)、[符号链接导出代码](https://github.com/git/git/blob/master/archive-tar.c#L250)。

2. **P1｜两阶段批准仍缺待审入口合同。**  
   [方案：100](research/全流程文档系统方案.md:100)、[108](research/全流程文档系统方案.md:108)、[140](research/全流程文档系统方案.md:140)新增待审引用，却没明确它如何避开正式接收所需的批准。按现有通用合同执行，治理候选仍可能在取得批准前被拒绝。建议明确：待审入口只接收数据、运行预审，不要求尚未取得的批准，不签发 G22、不转发；批准绑定最终权威 ref。否则 agy 指出的死锁只是换了位置。依据：[接收钩子](https://git-scm.com/docs/githooks#pre-receive)。

3. **P1｜签发格式与远端验签命令不兼容。**  
   [方案：121](research/全流程文档系统方案.md:121)选定 DSSE，[183](research/全流程文档系统方案.md:183)却直接用 `ssh-keygen -Y verify` 验 notes。该命令接受 SSHSIG，不能直接验证一般 DSSE envelope。建议选定完整链路：DSSE 配套验签器，或明确 SSHSIG 包装、被签字节及 namespace。codex 第 12 条尚未完整吸收。依据：[DSSE 协议](https://github.com/dsse-lf/dsse/blob/master/protocol.md)、[OpenSSH 文件验签接口](https://man.openbsd.org/ssh-keygen.1)。

4. **P2｜Actions 来源限制不够精确，并把 App 写成了通用必需项。**  
   [方案：186](research/全流程文档系统方案.md:186)应写“同名 job/check”，不是仅同名 workflow。必需检查不绑定工作流文件，来源选 GitHub Actions 也不能区分其中的不同工作流。独立 App 方案须进一步把检查来源固定到该 App。组织另有固定源仓库和工作流的 required workflow 路线，不过它约束 PR 合并，不能直接替换本文的直推流程。建议按适用场景表述，避免无条件要求维护 App。依据：[检查名匹配](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules#troubleshooting-required-status-checks)、[预期 App 来源](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)、[required workflow](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-workflows-to-pass-before-merging)。

5. **P2｜文档档位与闸门只在声明上解耦。**  
   [方案：412](research/全流程文档系统方案.md:412)允许 full 不配闸门，但[适配器底线：394](research/全流程文档系统方案.md:394)、[恢复：313](research/全流程文档系统方案.md:313)和[生命周期：496](research/全流程文档系统方案.md:496)仍无条件依赖闸门。建议统一规定这些条款的适用条件，并给无闸门模式保留 Git、任务页和普通验证入口；生成的 AGENTS 也按条件裁剪。两份复审的解耦意见只吸收了一半。

6. **P2｜旧决策整体归档漏了仍有效的授权。**  
   [方案：603](research/全流程文档系统方案.md:603)保留 agy 的整体转 history 建议，却漏了 [codex：73](research/design/codex-local-review.md:73)要求的活跃决策入口。旧表含 active 决策时，不能因换存储形式就退出正常规范阅读路径。建议保留旧 ID，在现行索引中链接仍有效的旧记录，并纳入授权及引用解析，不复制改写原文。依据：[M4：24](core/AXIOMS.lock.md:24)、[退役规则：25](core/GUIDE.md:25)。

7. **P2｜G13 对 minimal 决策仍没有完整合同。**  
   [方案：240](research/全流程文档系统方案.md:240)点名 `decisions/` 和 minimal 的 log，却没明确覆盖 minimal 决策表；若直接补成整行不可改，又会阻断 [GUIDE：14](core/GUIDE.md:14)允许的 superseded 状态更新，而[方案：409](research/全流程文档系统方案.md:409)承诺 minimal 继续遵循现行流程。建议分别定义不可改的决策正文、合法状态转换和链接修复，不把 full 的追加式关系规则直接套到旧表。

8. **P2｜管理员批准后备路线与 G12 冲突。**  
   [方案：147](research/全流程文档系统方案.md:147)允许退回管理员口令，但 [G12：240](research/全流程文档系统方案.md:240)仍只认硬件签名；[第六节：524](research/全流程文档系统方案.md:524)也一律声称批准来自硬件。建议在 owner 决定后，以策略明确允许的批准方式定义 G12，记录实际方式及认证证据；决定前将口令路线保留为待选方案。仅写“不等价”没有解决验收冲突。

9. **P2｜SK 标志的事实分歧没有真正裁决。**  
   [方案：145](research/全流程文档系统方案.md:145)保留“名单不得带 `no-touch-required`”，但它不是 `allowed_signers` 的合法开关。agy 混用了 SSH 登录与文件验签：本轮核对的 9.9p2、当前发布版 10.6p2，文件验签路径均只记录 SK 标志，没有据此要求 UP。建议写明版本化事实，保留闸门独立强制 UP 的要求，并明确拒绝 UP=0、缺失 SK 详情和普通软件密钥。依据：[允许签名者格式](https://man.openbsd.org/ssh-keygen.1#ALLOWED_SIGNERS)、[9.9p2 源码](https://github.com/openssh/openssh-portable/blob/V_9_9_P2/ssh-keygen.c#L2679)、[10.6p2 源码](https://github.com/openssh/openssh-portable/blob/V_10_6_P2/ssh-keygen.c#L2688)。

10. **P2｜Windows 首实例标志被写成了防抢注保证。**  
    [方案：155](research/全流程文档系统方案.md:155)中，`FILE_FLAG_FIRST_PIPE_INSTANCE` 只能在同名管道已存在时让合法服务创建失败；攻击者先占名时，客户端仍可能连接假服务。建议改为“检测占名并拒绝启动”，补充客户端认证服务端，并说明该标志只用于首实例。DACL、最小权限和拒绝远程客户端仍须保留。依据：[CreateNamedPipeW](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew)、[管道权限](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)。

11. **P2｜“仅限个人分支的细粒度凭据”不是 GitHub token 的原生能力。**  
    [方案：192](research/全流程文档系统方案.md:192)照收 agy 的建议，但 fine-grained PAT 按仓库和权限授权，没有分支范围选项。建议改为“只读凭据，或受不可修改的服务端规则限制的写凭据”。个人 Free 私有仓缺少所需规则时，不能靠 token 本身实现分支隔离。依据：[PAT 授权范围](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)。

12. **P2｜结论和生命周期仍保留超出正文合同的保证。**  
    [方案：20](research/全流程文档系统方案.md:20)宣称检查“没有空跑”，但[正文：110](research/全流程文档系统方案.md:110)只能证明命令启动及退出，候选测试可以全部 skip；[发布步骤：499](research/全流程文档系统方案.md:499)又无条件承诺绑定制品，而[范围：596](research/全流程文档系统方案.md:596)将它留待另立合同。建议将前者收敛到可信监督器实际观测的谓词，后者标为制品合同启用后才适用。否则仍越过 [A1、A6](core/AXIOMS.lock.md:10)的证据边界。

13. **P3｜G21 与时间豁免仍缺可执行定义。**  
    [方案：555](research/全流程文档系统方案.md:555)允许阻断接收，但“实质变更”“到期”“豁免窗口”没有精确谓词；[方案：199](research/全流程文档系统方案.md:199)把时间一律降为显示，也没说明如何处理时间型密钥有效期。序号能表达顺序，不能自动表达经过了多久。建议首版保留提醒；后续明确按变更代次计量，或为确需时限的授权使用可信时间，满足 M2 后再讨论阻断。依据：[codex：78](research/design/codex-local-review.md:78)、[OpenSSH 时间型有效期](https://man.openbsd.org/ssh-keygen.1#ALLOWED_SIGNERS)。

其余指定事实的核验出处：[rulesets 套餐](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)、[DeployKey 类及 bypass 范围](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)、[规则叠加](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)、[显式 lease 条件](https://git-scm.com/docs/git-push)、[服务端拒绝非快进](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#block-force-pushes)、[launchd Sockets](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)、[getpeereid](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/getpeereid.3.html)、[SO_PEERCRED](https://man7.org/linux/man-pages/man7/unix.7.html)。