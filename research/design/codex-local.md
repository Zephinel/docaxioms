**最终验收可以留在本地。** 推荐采用“独立系统用户拥有的本机闸门仓库＋受隔离的检查运行器＋本地签名凭据”。开发者和 Agent 可以自由编辑、提交，但只有闸门能够把通过验收的提交写入权威分支、转发远端或发布制品。

这修正了原方案“本地只能提醒，最终门槛必须远端化”的结论：**强制力来自权限与发布路径的封闭，不来自机器位于本地还是远端。** 接收端钩子能够阻断接收；操作系统权限能够阻止普通开发者修改接收端。相关机制分别见 [Git 接收钩子](https://git-scm.com/docs/githooks#pre-receive)、[Apple 文件权限](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html)、[systemd 服务身份](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)、[Windows 服务 SID](https://learn.microsoft.com/en-us/windows/desktop/api/winsvc/ns-winsvc-service_sid_info)。

研究基线为 2026-11-26、HEAD `a56e5c080b9484f7c85f0320efc9d6210e9b0b9c`，对照当前工作区源码与官方文档。以下明确区分已核实事实与设计建议；尚未部署跨平台原型，未将历史复现实验视为本轮实跑结果。未修改仓库文件。

**本地机制各自只能守住自己的边界。**

| 机制 | 已核实事实与能够守住的部分 | 没守住的部分 |
|---|---|---|
| `pre-commit`、`pre-push` | 适合提前反馈；客户端可以跳过对应钩子，也可以改变钩子路径。[githooks](https://git-scm.com/docs/githooks)、[hooksPath](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath) | 不能作为不可绕过的发布边界；同用户还能直接修改本地引用。 |
| 同用户的 bare 闸门仓库 | `pre-receive` 失败可拒绝本次全部引用更新；`update` 按引用拒绝。客户端 `--no-verify` 不关闭接收端钩子。[接收钩子](https://git-scm.com/docs/githooks#pre-receive)、[push 参数](https://git-scm.com/docs/git-push#Documentation/git-push.txt---no-verify) | 拥有仓库写权限的人仍可改钩子、配置、引用，或者另找发布路径。 |
| 跨系统用户的闸门 | 文件权限、ACL、服务身份可以使普通开发者无法修改闸门或读取其密钥。具体平台做法见下文。 | root、管理员、服务自身被攻破，以及仍然存在的其他发布凭据。 |
| 本地签名 attestation | 非对称签名允许其他机器只持公钥验签；可以绑定不可变对象及检查声明。[in-toto Statement](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)、[DSSE](https://github.com/dsse-lf/dsse/blob/master/protocol.md) | 签名不证明检查标准充分，也不证明签发器诚实。硬件密钥不理解“验收通过”。 |
| 文件监控守护进程 | 可以自动发现变化、使缓存失效、补充恢复简报。三平台均存在事件合并、溢出或历史缺口，见后文官方依据。 | 无法证明“所有操作都记录了”，也无法补回短暂修改后恢复的内容。 |
| 沙箱、容器、虚拟机 | 可限制候选代码访问宿主资源；Linux Landlock、Apple Virtualization、Windows Sandbox 均有官方实现基础。[Linux](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html)、[Apple](https://developer.apple.com/documentation/virtualization)、[Microsoft](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-overview) | 只读挂载不等于完整隔离；仍须限制其他可写挂载、凭据、IPC 和宿主管理接口。 |

因此，最低可信组合是：**跨用户接收端＋不可变快照验收＋受保护策略＋唯一发布凭据。** 签名使结果可以跨进程、跨机器消费；守护进程改善体验，不能代替这四项。

**推荐架构使用三个权限域，监控作为辅助组件。**

| 组件 | 权限与职责 |
|---|---|
| 开发者、Agent、客户端 | 可以编辑工作区、创建普通提交、请求验收；没有闸门文件写权限、签名权限或正式发布凭据。 |
| 闸门服务 | 专用系统身份；拥有 bare 仓库、验收账本和转发队列；读取获批准的策略及检查器；决定是否接收、签发和发布。程序与治理配置安装在开发者不可替换的位置。 |
| 检查运行器 | 与闸门不同的低权限身份或虚拟机；读取固定候选，写临时产物；不能读取密钥、修改闸门引用或调用签名接口。 |
| 可选监控进程 | 监听工作区变化、维护缓存、生成恢复信息；其事件不直接构成通过凭据。 |

数据流为：

```text
工作区 → 普通提交 C → 本机受控接收入口
                         ↓
               确定基线 B、策略 P、候选树 T
                         ↓
                    隔离运行检查
                         ↓
               闸门核对结果、审批和输入身份
                         ↓
                签名凭据 → 接收权威引用
                         ↓
                   可选：转发远端
```

**信任根**是管理员保护的闸门程序、策略引导记录、授权公钥集合，以及操作系统权限。候选仓库中的 `docaxioms.json`、检查脚本或自报结果都不能自行成为信任根。这个要求针对的正是现源码从候选目录加载扩展的行为：[src/check.mjs:664](src/check.mjs:664)。

不计实现成本时，建议将候选代码执行放入虚拟机；确定性文档检查仍可采用轻量隔离。完整的“所有写入经过代理”只在需要强制控制每次编辑时启用，**最终验收并不要求拦截每次编辑**。

**接收端应按以下契约实现。**

1. **入口必须真正切换到闸门身份。**  
   不能把共享目录中的 `file://` 仓库当作跨用户服务：本地协议沿用文件权限。推荐本机 SSH forced command，或受 ACL 保护的 IPC；入口只接受登记的仓库和操作，不提供任意 shell、任意接收程序或任意路径。[Git 本地协议](https://git-scm.com/book/en/v2/Git-on-the-Server-The-Protocols#_local_protocol)、[OpenSSH 强制命令](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT)

2. **读取本次接收的完整 `(old, new, ref)`。**  
   默认拒绝未登记引用、删除和非快进更新；例外必须单独授权。首版每次只更新一个受保护引用，避免跨引用策略依赖。需要批量原子更新时使用并验证 `--atomic`；它只保证同一接收事务中的引用更新。[接收钩子](https://git-scm.com/docs/githooks#pre-receive)、[atomic push](https://git-scm.com/docs/git-push#Documentation/git-push.txt---atomic)

3. **B 来自闸门保存的权威状态，T 来自新提交 C。**  
   不使用开发者的 `HEAD`、工作树或可变远程跟踪分支替代。对同一仓库串行处理治理与发布事务；提交引用前再次核对旧 OID、策略代次和审批绑定，防止检查期间基线变化。[Git 更新协议](https://git-scm.com/docs/gitprotocol-pack#_reference_update_request_and_packfile_transfer)、[update-ref 条件更新](https://git-scm.com/docs/git-update-ref)

4. **直接检查 Git 对象中的内容。**  
   建议通过 `ls-tree` 枚举路径、类型与 mode，通过 `cat-file` 读取原始 blob；不用检出后的换行转换、过滤器或跟随符号链接来定义文档输入。关闭 replacement refs，明确子模块、LFS 内容及生成物的输入合同；无法取得必需输入时返回 blocked。[ls-tree](https://git-scm.com/docs/git-ls-tree)、[cat-file](https://git-scm.com/docs/git-cat-file)、[replacement 控制](https://git-scm.com/docs/git#Documentation/git.txt---no-replace-objects)

5. **治理文件由旧策略识别，不能由候选删掉自己的保护范围。**  
   普通变更使用已批准的策略和检查器。治理升级时，旧策略负责判断“谁有权批准这次迁移”；获批准的新策略再验收整个 T。批准必须绑定 B、C、新策略摘要和检查器摘要；候选改变后旧批准失效。这是对原方案[验收器独立性合同](research/全流程文档系统方案.md:72)的加强。

6. **候选代码不能以闸门身份运行。**  
   不在持有凭据的进程里执行候选的 `npm` 脚本、插件或 `projectChecks`。使用批准版本的检查器、扩展和依赖；确需执行候选程序时进入无凭据运行器。受信监督器记录实际启动的命令、输入和退出状态，不能接收客户端提交的“PASS JSON”作为证明。[当前动态导入点](src/check.mjs:670)

7. **必需规则只能产生明确终态。**  
   保留 pass、fail、blocked、not-applicable、disabled；必需项的 blocked、disabled 都不通过。每个规则 ID 恰有一个合法结果，并带检查对象数和适用原因。进程提前退出、非法结果、Git 失败、必需对象缺失均不能变成空结果成功。[当前结果归一化](src/check.mjs:659)、[当前 Git 错误处理](src/check.mjs:35)

8. **区分“检查通过”“本地接收”“远端送达”。**  
   `pre-receive` 期间的新对象处在 quarantine，不能在此更新 refs，因此不能直接在钩子中执行需要更新 notes ref 的操作。先保存检查记录；接收成功后登记 accepted，再写 notes、唤醒转发队列。`post-receive` 只能触发后续工作，不能撤销已经完成的接收。[quarantine](https://git-scm.com/docs/git-receive-pack#_quarantine_environment)、[post-receive](https://git-scm.com/docs/githooks#post-receive)

本地接收和远端转发是两次事务，不能承诺跨仓库“全有或全无”。转发失败应保留“本地已接收、远端待送达”，通过持久队列和重启对账重试；不能盲目回滚本地引用。[Git 多远端原子性边界](https://git-scm.com/docs/git-push#_remote_groups)

还须明确验收粒度：默认只承诺本次进入权威分支的最终 C 合规；若要承诺“新引入的每个历史提交都合规”，就必须枚举并检查这些提交，不能把 tip 的通过推广到全部历史。这是 A1、A6 的直接限制。

**签名凭据绑定完整的验收声明。**

建议使用 detached attestation，采用已有的 in-toto Statement／DSSE 封装，签署确定的 payload 字节；验签后消费同一份 payload，不重新拼装内容。[in-toto](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)、[DSSE 验证合同](https://github.com/dsse-lf/dsse/blob/master/protocol.md)

| 字段组 | 建议绑定内容 |
|---|---|
| 对象 | 稳定仓库 ID、完整目标 ref、旧提交 B、新提交 C、树 T、Git 对象哈希算法 |
| 策略 | 策略摘要、治理代次、必需规则集合、审批记录摘要 |
| 执行 | 检查器版本及实际制品摘要、扩展与依赖摘要、环境清单摘要、必需结果和日志摘要 |
| 签发 | 获授权的签发身份、协议版本、请求 ID；按消费方式增加有效期或一次性挑战 |

环境清单至少覆盖操作系统、架构、运行时与工具链、执行参数、依赖锁、相关配置及外部输入。**签名环境清单只是闸门对环境的声明；没有测量启动或远程证明时，不能声称硬件证明了整个执行环境。**

签名接口只接受“验收这个候选”的请求，不能提供“签任意字节”或“替调用方签 PASS”的接口。否则即使私钥不可导出，服务仍会成为签名 oracle。

载体建议如下：

- **主载体：**仓库外、闸门管理的内容寻址证据库；发布级证据另做备份。
- **可选索引：**`refs/notes/docaxioms`，存凭据或其摘要和定位信息。Notes 不改变被注释提交，但可以被修改、删除；必须验签，而且需要显式传输，不能假定普通 clone/push 自动携带。[git-notes](https://git-scm.com/docs/git-notes)、[clone 与 mirror](https://git-scm.com/docs/git-clone#Documentation/git-clone.txt---mirror)
- **不推荐 trailer 作为主载体：**加入 trailer 会改变 commit OID，虽然 tree 可以不变。把“最终 commit OID 的证明”写入该提交自身会形成自引用；写进被证明的树也有同类问题。这是由 [Git commit 对象结构](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects#_git_commit_objects)推得的设计约束。

仅绑定 old/new 不能处理所有重放：引用回退后，同一转换可能再次出现。需要严格防重放时，消费端还须维护挑战或已消费状态；离线文件本身不能替代这项状态。[Git push certificate 的 nonce 机制](https://git-scm.com/docs/gitprotocol-pack#_push_certificate)

**macOS 可用独立 daemon，但钥匙串与 Secure Enclave 必须分开设计。**

- **服务与权限——已核实。**系统级 launchd job 可通过 `UserName`、`GroupName` 指定身份；程序、job 配置、策略及其父目录由管理员保护。建议专用非登录账号运行闸门，本机 SSH forced command 作为首版入口，开发者只有提交请求权限。[launchd 手册](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)、[Apple 启动服务指南](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- **软件密钥——已核实及建议。**开发者自己拥有的 `0600` 私钥不能隔离同用户 Agent。应使用闸门身份下的私有目录和密钥，或专用 file-based keychain，并明确解锁方式。launchd daemon 不在用户登录上下文中，不能直接使用 data-protection keychain，也不能假定开发者 login keychain 可用。[文件权限](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemDetails/FileSystemDetails.html)、[TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)
- **硬件密钥——已核实。**Security 框架所述 Secure Enclave 路径使用 NIST P-256，密钥在其中生成，没有明文导入导出机制。不能选 Ed25519 后再声称由该路径保存。每次人工确认是额外访问约束，不是 Secure Enclave 密钥的自动属性。[Secure Enclave](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave)、[userPresence](https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/userpresence)
- **daemon 使用 Secure Enclave——有条件可行。**Apple DTS 已纠正“daemon 完全不能使用”的旧结论：CryptoKit 路径可以工作；但其说明仍未确认正式支持范围，并指出首次登录前存在可用性差异。应作为目标版本原型项目，不能当作已完成的平台保证。[Apple DTS 具体说明](https://developer.apple.com/forums/thread/804612?answerId=865384022)

推荐先完成独立账号下的软件签名版本，再验证 CryptoKit／硬件签名适配器。密钥不可用时正式验收返回 blocked，不自动降级成另一把软件密钥。

**Linux 的服务隔离最直接，Secret Service 与 TPM 签名不能混为一谈。**

- **服务与 IPC——已核实及建议。**使用系统级 systemd service 的专用 `User=`；普通 user service 不构成跨用户边界。使用受保护目录中的 pathname Unix socket，显式设置如 `0660` 的权限，并核验 `SO_PEERCRED`。不要依赖 abstract socket 名称提供访问隔离；systemd socket 默认权限也不能直接沿用。[systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)、[systemd.socket](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html)、[unix(7)](https://man7.org/linux/man-pages/man7/unix.7.html)
- **软件密钥——已核实。**`LoadCredentialEncrypted=` 可用 TPM2 或主机秘密保护静态凭据，但启动后仍向服务提供明文；服务用户和 superuser 可读。它适合保护凭据分发，不能称为“私钥始终在 TPM 内签名”。桌面 Secret Service 是用户会话中的秘密存取接口，也不能自动隔离同用户 Agent。[systemd credentials](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials)、[Secret Service 规范](https://specifications.freedesktop.org/secret-service/latest/description.html)
- **硬件签名——可行，需验证设备与配置。**可经 `tpm2-pkcs11` 或硬件 token 的 PKCS#11 接口，在硬件中生成签名密钥并验证敏感、不可导出属性；同时保护 token 数据库、PIN 和访问配置。仅使用 PKCS#11 接口不证明背后存在硬件。[tpm2-pkcs11 架构](https://github.com/tpm2-software/tpm2-pkcs11/blob/master/docs/ARCHITECTURE.md)、[OASIS PKCS#11](https://docs.oasis-open.org/pkcs11/pkcs11-spec/v3.1/os/pkcs11-spec-v3.1-os.html)

闸门和运行器分别配置权限；运行器可结合 `NoNewPrivileges`、只读挂载、独立临时目录、网络限制与 Landlock。具体支持取决于目标 systemd、内核和文件系统，安装时应探测能力。[systemd 执行隔离](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)、[Landlock](https://www.kernel.org/doc/html/latest/userspace-api/landlock.html)

**Windows 应使用服务身份、显式 DACL 与独立密钥提供者。**

- **服务与 IPC——已核实及建议。**由 SCM 启动独立服务，可使用 `NT SERVICE\DocaxiomsGate` 虚拟账号及 service SID。仓库、策略和状态目录的 DACL 只授予服务及管理身份；开发者只访问请求管道。Named pipe 必须设置显式 DACL，不能沿用默认描述符，并在业务层核验客户端身份。[CreateService](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-createservicea)、[service SID](https://learn.microsoft.com/en-us/windows/desktop/api/winsvc/ns-winsvc-service_sid_info)、[Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
- **软件密钥——已核实。**DPAPI 默认通常绑定同用户、同机器；`CRYPTPROTECT_LOCAL_MACHINE` 允许本机其他用户解密取得的 blob，不能单独作为服务隔离。建议使用服务账号作用域并验证其配置文件生命周期；若使用 machine scope，必须另有严格文件 DACL。DPAPI 解密后仍得到软件中的明文。[CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- **硬件签名——已核实能力，配置需验证。**CNG 的 `MS_PLATFORM_CRYPTO_PROVIDER` 是 TPM provider。创建持久密钥时限定签名用途、导出策略和服务 SID 访问权，并查询实际 provider 能力；不能把所有 CNG 密钥都称为 TPM 密钥。[NCrypt provider](https://learn.microsoft.com/en-us/windows/win32/api/ncrypt/nf-ncrypt-ncryptopenstorageprovider)、[CNG 密钥属性](https://learn.microsoft.com/en-us/windows/win32/seccng/key-storage-property-identifiers)、[Windows TPM](https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/how-windows-uses-the-tpm)

Windows 上同样建议将候选代码放入独立运行身份或虚拟机；需要验证原生 Windows 行为时，Linux 容器的通过不能代替它。[Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-overview)

**源码改造应集中在输入、策略、结果三个权威边界。**

| 当前源码事实 | 必要改造 |
|---|---|
| `project()` 直接使用磁盘读取、存在性与 Git 工作树列表。[check.mjs:69](src/check.mjs:69) | 引入统一快照读取接口：列路径、读取内容、查询类型、计算 B→C 差异。工作树模式用于开发；提交模式用于正式验收。 |
| 可达性检查仍直接调用 `lstatSync(p.at(...))`，仅替换 `read()` 不够。[check.mjs:459](src/check.mjs:459) | 所有检查通过快照接口访问对象类型，正式模式不再退回宿主磁盘。 |
| `runGit()` 把失败转换为 `undefined`；部分调用把它当作无差异。[check.mjs:35](src/check.mjs:35)、[check.mjs:548](src/check.mjs:548) | 区分成功空集与命令失败；正式验收要求显式 B、C，禁止自动退回 HEAD。 |
| profile 控制扫描范围、忽略项、扩展和基线。[check.mjs:69](src/check.mjs:69) | 增加 schema；将获批准的执行策略与候选内容分开传入，候选不能自行减少必需规则。 |
| `projectChecks` 从工作目录动态导入；不完整 outcome 可归一化为空。[check.mjs:659](src/check.mjs:659) | 从批准版本加载扩展，在隔离运行器执行；汇总器验证规则 ID、结果数量、终态与计数。 |
| core 校验比较版本、部分 checkout 身份及 profile 中的摘要。[check.mjs:258](src/check.mjs:258) | 正式验收额外绑定实际检查器制品、依赖和策略摘要；版本字符串不足以定义执行身份。 |
| pin 已有内容算法，写入功能最终直接修改文件。[pins.mjs:77](src/pins.mjs:77)、[pins.mjs:314](src/pins.mjs:314) | 复用只读验证与哈希逻辑；正式验收接口不暴露写入能力。保持现有 pin 换行语义，另行确定 core 字节合同。 |
| CLI 的 `--report` 会让发现不影响退出码。[docaxioms.mjs:37](bin/docaxioms.mjs:37) | 保留开发用 report；新增正式验收入口，输出完整机器结果，由闸门签发。不能仅凭 CLI 退出码签 PASS。 |
| `init/update` 负责模板与 core 写入；当前包只分发现有目录。[manage.mjs:85](src/manage.mjs:85)、[package.json:21](package.json:21) | 系统服务、密钥与权限安装使用独立配套程序；不让普通 `init` 隐式执行系统配置。 |

已有调研列出的 profile、路径越界、history 比较、空跑等问题仍属于前置修复；本地权限分离不能补偿检查器判断错误。[迭代参考](research/调研校验与迭代参考.md:33)

跨平台验收应以 Git blob 的原始内容定义输入，避免检出转换造成身份漂移；工作树换行规则仍需通过 `.gitattributes` 和既定合同处理。[Git 换行规则](https://git-scm.com/docs/gitattributes#_text)

**原方案需要作以下实质修改。**

| 位置 | 修改建议 |
|---|---|
| 第二节分层 | L0 文本、L1 Agent 钩子、L2 客户端 Git 钩子继续负责提前反馈；新增“跨用户本地接收门槛”和“受保护策略及签名授权”。远端成为可选的验签或复验层，删除“远端是可行上限”的判断。[原分层](research/全流程文档系统方案.md:40) |
| 验收器契约 | 保留基线策略、治理变更审批、凭据隔离；补上旧策略授权迁移、检查器制品摘要、明确接收对象、并发重验与接收／送达状态。[原合同](research/全流程文档系统方案.md:54) |
| G17 | 改为“必需验证有获授权本地运行器针对指定对象和环境的可信签名记录”。没有平台 API 不再天然 blocked；缺少所配置的可信运行器才 blocked。证据仍在被验收树之外。[原 G17](research/全流程文档系统方案.md:124) |
| G22 | 改为本地汇总：适用必需项通过、审批有效、策略获授权、基线未变，才签发本次引用转换许可。远端送达单独记录，不混进本地通过状态。[原 G22](research/全流程文档系统方案.md:90) |
| 审批与原 G12 | 不能继续规定“只认平台事件”。纯本地模式需要受信任的本地批准记录，绑定具体候选和治理变化；可并入 G04/G22，不必建设通用授权平台。[原审批合同](research/全流程文档系统方案.md:397) |
| 第三节恢复 | 保留启动时从 Git 和任务页重新核对。修改“任何本地日志都不能作为依据”：闸门监督运行并签名的检查记录可用于 G17；普通 Agent 日志、文件事件仍只是补充信息。[原恢复机制](research/全流程文档系统方案.md:151) |
| 第七节自发性 | 开机启动服务；变化触发缓存失效和快速检查；提交接收触发正式验收；重启、唤醒及事件缺口触发对账。服务停止时无法接收或发布，工作区仍可编辑。后台不自动改写语义散文。[原触发矩阵](research/全流程文档系统方案.md:410) |

本地审批建议使用独立的批准密钥或需要人工确认的界面，展示所批准的候选和策略变化。签名能记录批准事件，不能证明人认真阅读或正确理解了内容；单人仓库也不会因此产生第二位独立审查者。

**守护进程不能使文件事件完整到足以证明全部历史。**

| 平台 | 官方确认的边界 |
|---|---|
| macOS FSEvents | 事件会合并；Dropped／MustScanSubDirs 等状态要求重扫，历史记录只是辅助信息，需周期扫描。[Apple FSEvents](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/UsingtheFSEventsFramework/UsingtheFSEventsFramework.html) |
| Linux inotify | 队列溢出会丢事件；递归 watch 存在建立时机问题；部分修改和远端文件系统事件不被覆盖。[inotify(7)](https://man7.org/linux/man-pages/man7/inotify.7.html) |
| Windows ReadDirectoryChangesW | 溢出可丢弃整个缓冲区内容，要求重新枚举目录。[Microsoft API](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw) |
| Windows USN journal | 旧记录会被删除或截断，记录不包含完整内容，也不能重建每次中间状态。[Change Journal Records](https://learn.microsoft.com/en-us/windows/win32/fileio/change-journal-records)、[journal 身份与范围](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-usn_journal_data_v0) |

设计上，事件缺口应使工作区缓存失效；完整扫描恢复当前状态，正式验收重新读取不可变对象。**它不会使已经签名的旧提交证据失效，只会阻止把旧结果套用到未经确认的新对象。** 若要完整约束编辑历史，必须把所有写入置于受控代理之后，文件监听本身做不到。

**远端可以完全不要，也可以只承担薄验签。**

| 模式 | 适用范围与边界 |
|---|---|
| 完全本地 | 闸门仓库就是权威仓库，可离线完成确定性检查、审批和接收；备份与多人同步另行设计。 |
| 本地验收，远端镜像 | 闸门独占转发凭据，远端负责存储协作。只要另有网页、机器人或个人凭据能改权威分支，就不能声称发布路径封闭。 |
| 本地验收，远端薄验签 | 推荐多人、多机使用。远端验证签名、授权签发者、策略代次、对象绑定及消费条件，不重复运行文档检查。 |
| 本地验收，远端复验 | 适合需要独立环境或更高保障的发布；增加独立检查证据，但不能消除 owner 管理权限与语义判断边界。 |

自建 Git 服务或支持自定义接收钩子的服务，可以在实际接收边界核对签名中的 `(repo, ref, old, new)`。GitHub Enterprise Server 提供自定义 pre-receive 部署路径；GitHub.com 不能直接照搬该部署方式。[GHES 接收钩子](https://docs.github.com/en/enterprise-server%403.23/admin/enforcing-policies/enforcing-policy-with-pre-receive-hooks/about-pre-receive-hooks)

GitHub.com 的设计可采用：

```text
本地构造并验收最终 C
→ 签发凭据
→ 推送暂存分支使 C 可见
→ 独立 GitHub App 验签，为精确 C 报告检查结果
→ 闸门核对远端旧 OID，再发布权威引用
```

这是 API 能力组成的方案，仍须原型验证：

- required check 要固定预期 App 来源；不能仅依赖检查名称。[GitHub required checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)
- Check Run 绑定 `head_sha`，没有目标 ref／旧 OID 字段；自定义凭据的这些条件必须由发布流程核对。[Checks API](https://docs.github.com/en/rest/checks/runs#create-a-check-run)
- 普通 required-check 规则不能直接等同于“最终落地 commit 已被验收”。远端 merge、squash、rebase 产生 C′ 时，要本地重新验收 C′，或另行定义更弱的树等价合同。[检查行为](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)、[合并方式](https://docs.github.com/en/pull-requests/reference/pull-request-merges)
- 限制发布者的规则与必需验签规则应分层，避免给闸门 bypass 时连验签一并绕过；实际可用性取决于账号归属和套餐。[规则分层](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)、[分支限制](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#restrict-who-can-push-to-matching-branches)

**单人可以获得进程隔离，多人还需要共同的授权根。** 多台机器各自生成设备密钥，由共同授权根登记其仓库、策略和环境权限，不复制一把主私钥。批准新设备、撤销密钥与降低隔离等级都属于治理变更；“任何登记机器的签名都接受”意味着最弱的机器也能决定结果。

离线时可使用已缓存的工具链、依赖、策略和公钥完成本地验收；无法确认最新远端基线、撤销状态或在线审批时，只能声明本地通过／待同步。恢复连接后重新核对这些条件，不能把离线通过直接视为当前远端可发布。

**以下缺口不能由本地验签自动补齐。**

| 缺口 | 本地方案的上限 | 远端只验签能否补上 |
|---|---|---|
| 开发者与 Agent 共用用户 | 同用户文件权限和密钥容器不能提供所需隔离。 | 只有远端拒绝该用户自行伪造的凭据才有帮助；不修复本机边界。 |
| root／管理员 | 能控制服务程序、配置或执行环境；不等于一定能导出硬件私钥。相关权限见 [Linux capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)、[Windows 所有权取得](https://learn.microsoft.com/en-us/windows/win32/secauthz/taking-object-ownership-in-c--)。 | 有效签名若来自被控制的签发器，纯验签无法识别。 |
| owner 自己 | 可以改变信任根、规则或托管权限。 | owner 同时控制远端时不能补上。 |
| 密钥泄露或签名服务被滥用 | 可以伪造获授权声明。 | 撤销后可拒绝；撤销前通常无法仅靠验签区分。 |
| 直接修改托管平台 | 若存在其他写入者、bypass 或发布凭据，本地门槛未覆盖这条路径。 | 受保护的薄验签规则可以封住普通写入者；管理员仍是边界。 |
| 本地证据被删除、回滚 | 签名可发现内容伪造，不能保证证据仍存在或列表完整。 | 独立归档、消费状态与外部检查点可以补强。 |
| 文档语义、测试充分性、owner 原意 | 仍需人工判断；机器只持有所检查谓词。 | 不能补上。 |

**公理和既有决策不要求改变，但产品边界需要 owner 明确。**

- **A6：**通过声明必须列明对象、策略、环境、规则和审批范围；签名身份、运行记录、发布许可分别说明，不提供笼统的“全流程正确”标签。
- **A7：**文件监控缺口不阻止继续编辑；合法空集不制造失败；硬件不可用只阻断依赖它的正式验收。语义审计与 `codeToDocs` 继续作为 aid。[公理与方法](core/AXIOMS.lock.md)
- **AD-2：**系统服务、平台路径、Git 适配、密钥 API 全放在 `core/` 外；core 只保留通用合同。
- **AD-4：**其原文要求标准 npm CLI，并规定代码锚定使用纯 JS、避免原生 AST grammar；它没有明确决定“所有配套程序永远只能是 JS”。建议保留 npm CLI 与检查引擎的纯 JS 实现，新增独立、可选的系统闸门和平台签名 helper。该扩展是否属于正式产品，是新的 owner 决策，不能默认为既有授权。[AD-2、AD-4](docs/decisions.md:8)
- **AD-7：**不能因为增加闸门，就让本仓库所有 report 项变成阻断项。本仓库仍按现有阻断集合执行；其他检查逐项满足外部实证和 owner 升格条件。工程上“防止伪造执行结果”和“新增哪些文档阻断谓词”必须分开决定。[AD-7](docs/decisions.md:12)、[当前自身阻断集合](test/self.test.mjs:11)
- **AD-1、AD-6：**不改锁定公理；授权记录继续保留来源与摘要，只有公理变更按要求引用 owner 原话。[决策](docs/decisions.md)

**可行性评级及落地验收应采用以下范围。**

| 项目 | 评级 |
|---|---|
| 三平台跨用户 bare 闸门、受控入口、正式提交快照检查 | 可行；需要引擎改造和系统安装程序 |
| 独立服务身份的软件签名 | 可行；需验证启动、解锁、恢复与权限 |
| Linux／Windows TPM 或硬件 token 签名 | 有条件可行；按 provider、设备和权限实测 |
| macOS 用户上下文 Secure Enclave 签名 | 可行能力已核实；具体部署需实测 |
| macOS 无登录 daemon 的 Secure Enclave 签名 | 有条件；CryptoKit 路径及正式支持范围需验证 |
| 守护进程加速检查、恢复当前工作状态 | 可行 |
| 依靠文件事件证明全部操作历史 | 不可行 |
| 自建远端在接收边界只验签 | 可行 |
| GitHub.com 薄验签组合 | 有条件；精确对象、规则分层、发布竞态需原型验证 |
| 对本机管理员或 owner 不可绕过 | 本方案不提供该保证 |
| 自动证明文档语义正确 | 不可行 |

实施前需要 owner 决定的事项是：

1. 闸门保护权威分支、全部接收提交，还是同时保护发布制品；是否验收全部新引入历史。
2. 是否接受安装跨用户系统服务，以及独立的配套程序／平台 helper。
3. 首版使用软件密钥还是要求硬件密钥；哪些操作必须人工确认。
4. 纯本地审批的授权身份、候选绑定方式，以及治理升级规则。
5. 远端采用无远端、镜像、薄验签或复验；多机设备如何登记和撤销。
6. 换行、生成物、非 Markdown 落地点等既有待定合同，以及本仓库按 AD-7 启用的实际阻断集合。

建议依次完成“修复检查器输入与错误合同 → 提交快照接口 → 单机跨用户闸门 → 签名证据 → 平台适配 → 远端薄验签”。每阶段的完成条件必须包含实际拒绝见证：

| 验证场景 | 必须观察到的结果 |
|---|---|
| 坏提交使用 `--no-verify` 推送 | 接收端拒绝，权威引用不变 |
| 开发者直接改闸门引用、钩子、策略或读取密钥 | 操作系统拒绝 |
| 候选删规则、伪造 PASS、扩展提前退出、Git 出错 | 不签发通过凭据 |
| 候选程序访问凭据或签名接口 | 被隔离边界拒绝 |
| 工作树与 C 不同 | 结果只对应 C |
| 并发推送、审批后变更、策略更新 | 旧绑定不能被沿用 |
| 接收前后崩溃、转发失败、重启 | 不混淆检查通过、本地接收与远端送达 |
| notes 缺失、错误仓库／ref、撤销密钥、重放 | 消费端按合同拒绝 |
| 锁屏、重启、无登录、硬件缺失 | 无隐式密钥降级 |
| 文件监控溢出或历史断裂 | 缓存失效并重扫，正式验收仍读取固定对象 |

只有这些拒绝路径在目标平台被观察到，才能把相应能力从“机制可行”提升为“实现已验证”。