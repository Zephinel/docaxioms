结论：**调整后保留本地终审路线。** 跨用户接收端能形成普通用户进程无法直接绕过的边界，但现稿对硬件批准、签发时序和远端发布的保证过强。

基于 HEAD `a56e5c0` 及当前工作区，只读核对了需求、两份原稿和规范，并查阅官方资料；未做平台部署实测。下文“方案”指 [research/全流程文档系统方案.md](research/全流程文档系统方案.md)。

1. **P1｜共用系统用户的两种补法，都不能无条件补上缺口。**  
   [方案:165](research/全流程文档系统方案.md:165)：远端验签有效的前提是，闸门签名密钥独立，Agent 不能修改验签策略、信任根或远端权限。若闸门也运行于同一用户，轻量档仍可被自签自推。网络白名单则只约束被覆盖的执行通道；Agent 仍可能经浏览器、其他工具、IPC 或沙箱外进程使用凭据。**改为条件性结论，并要求凭据、文件、网络、IPC 和完整进程边界一起成立。** [Claude 官方沙箱边界](https://code.claude.com/docs/en/sandboxing#scope)

2. **P1｜“每次触摸”“证明 owner 在场”“唯一机制”均表述过强。**  
   [方案:126](research/全流程文档系统方案.md:126)、[方案:127](research/全流程文档系统方案.md:127)：OpenSSH 支持 `no-touch-required`；UP 只表示用户在场，UV 才涉及用户验证，两者都不自动确认屏幕上的交易内容。更具体地，OpenSSH 9.9p2 的文件签名验证代码只记录 SK 标志，没有据此强制 UP/UV。  
   **批准端应受保护，展示并冻结仓库、ref、B、C、策略摘要和批准用途；验签端明确强制所承诺的标志，限制并发批准请求。** 删除“唯一机制”，将保证缩为“指定密钥对指定批准载荷签名，并满足规定的人机交互条件”。[OpenSSH 手册](https://man.openbsd.org/ssh-keygen#FIDO_AUTHENTICATOR)、[验证代码](https://github.com/openssh/openssh-portable/blob/V_9_9_P2/ssh-keygen.c#L2679)、[FIDO 交易确认定义](https://fidoalliance.org/specs/common-specs/fido-glossary-v2.1-ps-20220523.html)

3. **P1｜先接收后签名，与“密钥不可用即 blocked”矛盾。**  
   [方案:85](research/全流程文档系统方案.md:85)、[方案:137](research/全流程文档系统方案.md:137)：引用更新后，签名失败已经不能阻止该提交进入权威分支。quarantine 禁止此时更新 notes，并不禁止向仓外证据库写入签名。  
   **接收前持久保存检查证据和签名许可；接收后确认 accepted，再更新 notes、入队。** 补充崩溃恢复及孤立许可的处理，不能把后置钩子当事务回滚点。[Git 接收与 quarantine](https://git-scm.com/docs/git-receive-pack#_quarantine_environment)、[接收钩子](https://git-scm.com/docs/githooks#post-receive)

4. **P1｜多机模式混用了本地检查基线和远端引用旧值。**  
   [方案:96](research/全流程文档系统方案.md:96)、[方案:112](research/全流程文档系统方案.md:112)、[方案:154](research/全流程文档系统方案.md:154)：离线接收或多机合并后，本机 B 可以不同于远端旧 OID。GitHub Check Run 绑定 `head_sha`，不会原子约束 `(old,new,ref)`；先读旧值再普通推送，也没有明确保证使用那个旧值。  
   **区分检查基线、目标旧值、提交验收证明和发布许可。首版采用单一权威发布者；发布时条件更新旧值，不匹配就重新判断。** [Checks API](https://docs.github.com/en/rest/checks/runs#create-a-check-run)、[Git 引用更新协议](https://git-scm.com/docs/gitprotocol-pack#_reference_update_request_and_packfile_transfer)

5. **P1｜G22 和 report 的绝对写法，会误越过 AD-7。**  
   [方案:194](research/全流程文档系统方案.md:194)、[方案:206](research/全流程文档系统方案.md:206)：AD-7 允许本仓库其余检查产生报告发现，同时接收通过。“以上适用项全部满足”必须限定为**获授权的阻断集合**；“report 结果永不作凭据”应改为“不能仅凭 report 退出码认定通过”。完整报告仍可成为证据，签名结论应明确哪些规则阻断、哪些只报告，执行错误继续失败。依据：[决策:12](docs/decisions.md:12)、[实际阻断集合:11](test/self.test.mjs:11)。  
   此外，正式模式的 blocked 合同与现行 [GUIDE:31](core/GUIDE.md:31)“note 不失败”不同，需作为新模式明确批准。

6. **P2｜GitHub 个人仓库的限制能力写得过于含糊，遗漏了更简单的发布者限制。**  
   [方案:144](research/全流程文档系统方案.md:144)、[方案:159](research/全流程文档系统方案.md:159)：
   - 原生“要求签名提交”要求签名 verified，**不能指定只接受某个闸门签名者，更不验证自定义 attestation**。
   - 传统分支保护的推送者限制面向组织仓库；个人仓库在套餐支持 rulesets 时，可组合“限制更新”和部署密钥 bypass。
   - 但 API 的 `DeployKey` actor 要求 `actor_id=null`，这里选的是部署密钥类，不能指定某一把。若要实际只有一把，须另行限制有效写入密钥；GitHub App 可提供更明确的发布身份。

   **将发布者限制与必需验签拆成两套规则，避免发布者 bypass 同时绕过验签。** 公共仓库 Free、个人私有仓库 Pro 等套餐边界也应写明。[可用规则](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)、[Rules API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)、[传统分支限制](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#restrict-who-can-push-to-matching-branches)

7. **P2｜跨用户边界还缺首次信任引导和执行闭包。**  
   [方案:70](research/全流程文档系统方案.md:70)、[方案:98](research/全流程文档系统方案.md:98)、[方案:102](research/全流程文档系统方案.md:102)：尚未定义首次没有 B 时信任谁、谁启动另一身份的运行器、怎样移交 quarantine 中的快照，以及检查器的导入依赖、命令定义和解释器如何受保护。只保护入口文件不够。  
   **安装合同应覆盖运行时、依赖、父目录、环境和固定运行器服务；治理范围覆盖实际执行依赖。** 明确候选测试来自 C、可信监督器来自批准版本；记录命令退出零，不能升级为“测试确实充分执行”。[systemd 执行身份与环境](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)

8. **P2｜Git 接收机制主体正确，但 SSH 与权限措辞需修。**  
   [方案:55](research/全流程文档系统方案.md:55)、[方案:92](research/全流程文档系统方案.md:92)：接收端钩子不受客户端 `--no-verify` 影响、文件传输不切换身份，这些正确。但 `safe.directory` 有显式例外，不能当权限边界。  
   [方案:70](research/全流程文档系统方案.md:70)、[方案:93](research/全流程文档系统方案.md:93) 的“不能登录”应明确为禁止交互登录；若设成 `nologin` shell，forced command 也可能无法执行。还须禁用转发、PTY、用户 rc，并严格解析原始命令。`git daemon` 虽可用独立身份接收，但 receive-pack 默认关闭，启用后协议没有身份认证，监听 localhost 不等于用户认证。[safe.directory](https://git-scm.com/docs/git-config#Documentation/git-config.txt-safedirectory)、[sshd](https://man.openbsd.org/sshd#AUTHORIZED_KEYS_FILE_FORMAT)、[git daemon](https://git-scm.com/docs/git-daemon#_services)

9. **P2｜Windows 的显式 DACL 判断正确，但契约不完整。**  
   [方案:135](research/全流程文档系统方案.md:135)：默认描述符向 Everyone、匿名账户授予的是读取权限，不等于任意写入或调用签名服务。Node/libuv 使用默认描述符的判断有源码依据。  
   **补上拒绝远程客户端、客户端身份核验、防管道冒名及最小访问权。** 不要直接给客户端 `FILE_GENERIC_WRITE`，它还包含创建管道实例的权限。[Microsoft 管道权限](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)、[CreateNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea)、[libuv 实现](https://github.com/libuv/libuv/blob/v1.51.0/src/win/pipe.c#L505)

10. **P2｜macOS“只支持 P-256”已过时；daemon 的谨慎结论应保留。**  
    [方案:133](research/全流程文档系统方案.md:133)：当前 CryptoKit 已公开 `SecureEnclave.MLDSA65`，应改成“本方案选用 P-256”，无需扩展算法范围。Apple DTS 已确认 daemon 经 CryptoKit 使用 SE 可以工作，但明确没有确认正式支持，并指出默认访问条件在首次登录前可能失败。**原型要分开验证登录前、锁屏后和普通后台场景。** [Apple API](https://developer.apple.com/documentation/cryptokit/secureenclave/mldsa65)、[DTS 说明](https://developer.apple.com/forums/thread/804612)  
    [方案:134](research/全流程文档系统方案.md:134) 的“需经 PKCS#11”也应改为“可经”；TPM2-TSS 的 FAPI 等也是直接路径。[Fapi_Sign](https://tpm2-tss.readthedocs.io/en/latest/group___fapi___sign.html)

11. **P2｜G13、G16 的谓词与所宣称的流程不完全一致。**  
    [方案:205](research/全流程文档系统方案.md:205)：按“只允许改 URL 或追加勘误”的字面，minimal 档正常追加完成日志也会被拒绝。**应保护既有记录正文，同时允许新增记录和勘误。**  
    [方案:216](research/全流程文档系统方案.md:216)：已有 pin 的切片被交给 G09 后，修改代码并刷新摘要即可满足它，却未必留下 G16 承诺的处置。**pin 校验与处置登记应同时覆盖受管变更**，可按接口或变更组登记，避免逐文件填表。依据：[A5、M2](core/AXIOMS.lock.md:14)。

12. **P2｜DSSE 和防回滚合同还不够精确。**  
    [方案:110](research/全流程文档系统方案.md:110)：DSSE 签的是 `PAE(payloadType,payload)`，应写明，避免实现成签裸 payload。采用 SSHSIG 时，还需约定编码、namespace 和 SK 验证规则。[DSSE 协议](https://github.com/dsse-lf/dsse/blob/master/protocol.md)  
    [方案:122](research/全流程文档系统方案.md:122)：**签名状态链本身也可以整体回退**。它不能替代可信外部检查点或消费方保存的最新状态；首次接入者只拿到旧链，无法自行发现截断。

13. **P2｜“守不住”清单遗漏了制品、可用性及资源边界。**  
    [方案:161](research/全流程文档系统方案.md:161)、[方案:506](research/全流程文档系统方案.md:506)：应加入未受管 ref、标签、发布 API、包仓库等其他出口，以及制品替换。提交验收不自动证明最终发布字节经过验收。另需列出磁盘满、密钥丢失、测试卡死、恶意大 pack、缓存污染和恢复失败。**正式承诺分别限定为接收安全、证据完整性、制品绑定和可用性；配置资源限额与恢复流程。**

14. **P3｜档位和远端模式不应绑定成互斥套餐。**  
    [方案:371](research/全流程文档系统方案.md:371)、[方案:553](research/全流程文档系统方案.md:553)、[方案:560](research/全流程文档系统方案.md:560)：minimal/full 是文档规模，轻量/跨用户是隔离强度，应独立选择。远端的权威位置、验签、复验也是不同维度，薄验签与跨平台复验可以同时存在。**首版宜采用单一权威闸门和受限镜像，按需增加其他保证。** 同用户裸仓不必做成完整产品档位，可保留为明确的防误操作方案。

未发现本地方案必须修改公理的理由。平台机制放在 `core/` 外符合 AD-2；独立配套包合理，但其产品范围需要新决策，不能视为 AD-4 已经授权。改公理仍须遵守明确 owner 原话及决策引用要求，硬件签名不能替代它。决策表没有 AD-5，不应补造。

对 12 项待决问题的推荐如下：

| 项 | 推荐 |
|---|---|
| **1．档位与保护对象** [方案:553](research/全流程文档系统方案.md:553) | 首版实现跨用户闸门；默认验收权威分支最终 C。逐提交历史与发布制品另立合同，轻量方案只承诺防误操作。 |
| **2．打包** [方案:558](research/全流程文档系统方案.md:558) | 同意独立、可选配套包。主 CLI 保持现有边界，特权安装显式执行，新增决策明确范围。 |
| **3．密钥与批准** [方案:559](research/全流程文档系统方案.md:559) | 闸门自动签发先用隔离的软件密钥；治理及信任变更使用受保护批准流程。FIDO2 可作默认方案，管理员口令不能宣称等价，也不能静默降级。 |
| **4．远端与多机** [方案:560](research/全流程文档系统方案.md:560) | 先单一权威加受限镜像；多机协议成熟后加薄验签，复验按环境需要叠加。设备逐台登记，撤销与恢复均属治理。 |
| **5．平台顺序** [方案:561](research/全流程文档系统方案.md:561) | 先完成 macOS 拒绝路径，再扩 Linux、Windows。WSL2 只能代表 Linux 路径，不能充当原生 Windows 验收。 |
| **6．full 结构** [方案:562](research/全流程文档系统方案.md:562) | 默认 minimal；并行任务确有需要时采用一事一文件。索引生成，状态只存一处；归档旧表时保留活跃决策的可达入口。GUIDE 保持抽象，不加入平台名称、路径和门禁编号。 |
| **7．ID** [方案:565](research/全流程文档系统方案.md:565) | 类型前缀加稳定标识，日期可辅助；保留历史 AD 编号。引用按登记 ID 精确识别，不依赖泛化的“大写字母加数字”。 |
| **8．G16** [方案:566](research/全流程文档系统方案.md:566) | 先窄范围报告运行；处置按接口或变更组登记。责任人确认即可，只有治理或明确规定的变更要求 owner 批准。 |
| **9．适配器** [方案:567](research/全流程文档系统方案.md:567) | 同意维护，先把 Claude Code、Codex CLI 做到有版本探测和契约测试；其余先提供模板，通过验证再升 Tier 1。 |
| **10．冷启动必读** [方案:568](research/全流程文档系统方案.md:568) | 同意底线必读、细则按需。AGENTS 必须保留关键禁令、验证入口与恢复要求，并保证相关 GUIDE 规则可达。 |
| **11．G21** [方案:569](research/全流程文档系统方案.md:569) | 首版只提醒。实证后可选择仅阻断发布；不默认阻断接收。“实质变更”和到期条件必须先变成精确合同。 |
| **12．本仓库采用方式** [方案:570](research/全流程文档系统方案.md:570) | 保持 minimal 和现有阻断集合。选外部项目试验，每项检查分别满足 AD-7 的至少 10 次相关变更、3 条值得改文档的发现，再由 owner 逐项升格。 |