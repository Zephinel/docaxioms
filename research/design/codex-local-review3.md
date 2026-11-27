复审对象为 `research/全流程文档系统方案.md` 当前 622 行稿，基线 HEAD `a56e5c0`；已逐条核对两份第二轮意见。**仍有 1 项 P1**。以下只列未闭合处和新增问题；未发现新增的现行 AD 决策冲突。平台部署未实测。

1. **P1｜新增的预审复用条件弱于正式验收合同。**  
   [方案：143](research/全流程文档系统方案.md:143)规定只要 T 和策略不变就复用，漏了 B、检查器、环境和外部输入，与[方案：226](research/全流程文档系统方案.md:226)及[公理 A1、A2](core/AXIOMS.lock.md:10)冲突。等待批准期间，基线或工具链变化，旧结果仍可能被套到新验收上；正式事务内重新核对旧 OID，不能补回预审缺失的绑定。建议复用键采用完整输入身份；依赖 B→C 的规则按正式基线重新判定。

2. **P2｜远端要检查 owner 的 UP，但凭据只规定携带批准摘要。**  
   [方案：127](research/全流程文档系统方案.md:127)、[131](research/全流程文档系统方案.md:131)没有要求同步批准载荷和硬件签名，[186](research/全流程文档系统方案.md:186)却要求远端检查批准签名的用户在场标志。闸门的软件签名及批准摘要不能替代这份签名。建议明确携带批准原文、SSHSIG 和必要授权材料；否则应明确远端只信闸门对批准有效性的声明，删除独立检查 UP 的承诺。[OpenSSH 验签与 SK 详情处理](https://github.com/openssh/openssh-portable/blob/V_10_6_P2/ssh-keygen.c#L2663)。

3. **P2｜SSHSIG 替代后的承载格式仍未定义。**  
   [方案：124](research/全流程文档系统方案.md:124)的密码学方向成立：本轮无落盘探针观察到正常载荷通过，篡改载荷和错误 namespace 被拒绝。但命令需要分别取得原始载荷和分离签名，不会解包 notes，仍须定义提取规则。[ssh-keygen 接口](https://man.openbsd.org/ssh-keygen.1#Y~5)。本轮找到的[现成先例 speccoder](https://hupe1980.github.io/speccoder/docs/attestations/#without-speccoder)采用 **DSSE 的 PAE 加 SSHSIG**，不能作为去掉 DSSE 的兼容先例。采用 Statement JSON 本身无冲突，但完整 in-toto Envelope 还要求多签能力和签入 payloadType。建议明确称为“采用 Statement 结构的自定义凭据”，或补齐兼容合同。[in-toto Envelope 规范](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md)。

4. **P2｜Windows 原生辅助只写了服务端，客户端配套仍缺。**  
   [方案：158](research/全流程文档系统方案.md:158)、[580](research/全流程文档系统方案.md:580)：首实例标志的纠正成立，但须限定只用于首个实例。[Win32 定义](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew)。撤掉客户端的 FILE_GENERIC_WRITE 后，普通 Node/libuv 客户端仍请求 GENERIC_WRITE，双向连接会失败，或退成只读。建议把辅助程序范围扩到客户端，以最小权限调用 CreateFile，并落实服务端认证；可从管道句柄取得服务端 PID，与 SCM 中运行服务的身份核对，处理重启和 PID 复用，失败即拒绝。[libuv 源码](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c)、[服务端 PID](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeserverprocessid)、[SCM 状态边界](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-queryservicestatusex)。

5. **P2｜纯 JS 退路没有贯通 macOS 入口，agy 第 6 项只吸收了一部分。**  
   [方案：98](research/全流程文档系统方案.md:98)的两项事实成立：Node net 没有公开 peer credentials 接口，macOS 目录搜索权限也能限制 pathname socket 的访问。[Node API](https://nodejs.org/api/net.html)、[Apple connect 文档](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/connect.2.html)。但[156](research/全流程文档系统方案.md:156)仍固定采用 launchd Sockets，取回描述符还需要原生 launch_activate_socket。[Apple 接口](https://developer.apple.com/documentation/xpc/launch_activate_socket)。建议桥接同时承担激活和身份核验；纯 JS 退路则明确改为常驻服务自建 socket，目录由服务或管理员持有、授权组无写权限。[579](research/全流程文档系统方案.md:579)同步补上依赖。

6. **P2｜无闸门模式仍未贯通，codex 第 5 项未完全吸收。**  
   [方案：416](research/全流程文档系统方案.md:416)允许 full 不配闸门，但[生命周期：500](research/全流程文档系统方案.md:500)、[影响报告：509](research/全流程文档系统方案.md:509)、[脚手架：569](research/全流程文档系统方案.md:569)仍无条件要求闸门。建议统一加适用条件；无闸门时走普通验证和报告，明确没有 G17/G22 的强制保证。预审也应限于需批准或显式请求的情况，避免普通变更一律推送两次。

7. **P3｜Secure Enclave 的限定仍漏写，但不宜照抄旧意见。**  
   [方案：156](research/全流程文档系统方案.md:156)尚未补上 agy 表中第 2 项要求的“绕过 Data Protection Keychain”边界。建议注明原型走 CryptoKit 直接创建及恢复密钥的路线；不要照搬“禁止 SecItem”，因为 SecItem 也能访问文件型钥匙串，真正不可用于无登录 daemon 的是 Data Protection Keychain。[Apple DTS 原答](https://developer.apple.com/forums/thread/804612)、[TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)。

另外两项指定事实核验无异议：[方案：105](research/全流程文档系统方案.md:105)的对象导出路线成立，实施时按 NUL 解析路径、按 OID 请求 blob、按返回长度读取内容；本轮已在内存中核对 201 个 blob。[ls-tree](https://git-scm.com/docs/git-ls-tree)、[cat-file](https://git-scm.com/docs/git-cat-file#_batch_output)。[方案：195](research/全流程文档系统方案.md:195)所写 fine-grained PAT 无原生分支范围也成立。[GitHub 授权范围](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#fine-grained-personal-access-tokens)。