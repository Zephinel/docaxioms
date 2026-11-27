# 《全流程文档系统方案》本地终审第二轮独立复审（agy-local-review2）

复审基线：独立对照 `research/全流程文档系统方案.md`（当前 617 行版）、`research/design/agy-local-review.md`、`research/design/codex-local-review.md`、`core/AXIOMS.lock.md` 与 `docs/decisions.md`（AD-1..AD-7），并逐项联网核实新写入的平台与协议事实。已正确吸收且无问题的部分不再复述。

---

## 一、采信项表态与 7 项新增事实联网核实速查

| 核实对象 | 定稿位置 | 核实结论 | 官方出处与关键说明 |
|---|---|---|---|
| **采信 1**：`DeployKey` bypass 只能放行整类（`actor_id: null`） | `L176` | **属实（同意采信 codex）** | GitHub REST API 规定 `actor_type: "DeployKey"` 时 `actor_id` 置空，放行该仓全部写权限部署密钥（[GitHub Rulesets API](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)） |
| **采信 2**：macOS 无登录 daemon 经 CryptoKit 用 Secure Enclave 可用但未正式支持 | `L153` | **属实（同意采信 codex，需补半句边界）** | Apple DTS 确认 CryptoKit `SecureEnclave.P256` 绕过 Data Protection Keychain 直接生成 `dataRepresentation` blob 可在 daemon 工作但未承诺官方支持（[Apple Forums #804612](https://developer.apple.com/forums/thread/804612)）；须注明**不能走 `SecItem` Keychain 存储**，否则仍触发 TN3137 的用户上下文与 Provisioning Profile 阻断（[Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)） |
| **核实 1**：GitHub rulesets 套餐与传统分支限制范围 | `L174-175` | **属实** | Free 仅公开仓可用 rulesets，个人私有仓需 Pro；传统“限制谁能推送”仅限组织仓（[About Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)、[Protected Branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#restrict-who-can-push-to-matching-branches)） |
| **核实 2**：Ruleset bypass 豁免整条规则集，需拆双规则集 | `L177` | **属实** | 多条 ruleset 按最严叠加（Rule Layering），单条内的 bypass 会豁免该条全部规则（[Rule Layering](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)） |
| **核实 3**：`--force-with-lease=<ref>:<旧值>` 加只允许快进 | `L171` | **部分有坑（见问题 5）** | 该参数仅校验远端当前值等于 `<旧值>`，本身**允许非快进强推**；在无远端保护的镜像仓会覆写历史（[Git `git-push`](https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-leaseltrefnamegtltexpectgt)） |
| **核实 4**：`launchd` `Sockets` 与 `getpeereid` | `L97, L153` | **OS 层属实，Node 层有遗漏（见问题 6）** | macOS 原生支持 `Sockets` + `launch_activate_socket` 与 `getpeereid(3)`，但 Node `node:net` 均未暴露，需微型原生桥接（[`launchd.plist(5)`](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)、[`getpeereid(3)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/getpeereid.3.html)） |
| **核实 5**：Windows Named Pipe 标志与 `FILE_GENERIC_WRITE` 陷阱 | `L155` | **完全属实** | 命名管道上 `FILE_APPEND_DATA` 与 `FILE_CREATE_PIPE_INSTANCE` 共用 `0x0004` 位，授 `FILE_GENERIC_WRITE` 会允许客户端创建同名管道实例劫持（[Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)、[`CreateNamedPipeW`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipew)） |
| **核实 6**：`ssh-keygen -Y verify` 对 `sk` 用户在场标志的处理与 `allowed_signers` | `L145` | **有两处事实错误（见问题 2）** | `allowed_signers` **根本不支持** `no-touch-required` 选项；且 `ssh-keygen -Y verify` 确实不强制检查 `UP (0x01)` 位（[OpenBSD `ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1#ALLOWED_SIGNERS)、[OpenSSH `ssh-keygen.c`](https://github.com/openssh/openssh-portable/blob/V_9_9_P2/ssh-keygen.c#L2679)） |
| **核实 7**：Actions 必需检查能否被同名工作流冒充 | `L186` | **属实（治理范围漏半步，见问题 7）** | 同仓所有 workflow 共享内置 `GitHub Actions` App 来源，同仓其他 workflow 定义同名 job 可造成冒充或冲突（[Required Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging)） |

---

## 二、发现的问题清单（按严重度 P0 → P2 排序）

### 1. 【P0｜吸收错导致高危绕过】`L104` 推荐用 `git archive` 导出运行器快照，会保留符号链接并被候选 `.gitattributes` 静默删改测试文件
- **出处**：`research/全流程文档系统方案.md:103-104`（“导出一份不含符号链接的快照（例如 `git archive` 的流）”）
- **问题**：
  1. **事实错误**：`git archive` 不会剥离符号链接，而是将 Git mode `120000` 编码为 tar 符号链接条目（`SYMTYPE`），标准解包会在运行器目录还原出真实符号链接（[Git `git-archive` 文档](https://git-scm.com/docs/git-archive)）。
  2. **安全绕过**：`git archive <C>` 默认读取**候选树 `<C>` 内部的 `.gitattributes`**，自动执行 `export-ignore`（从归档中静默删掉匹配的文件或测试目录）和 `export-subst`（展开格式占位符篡改文件内容）（[Git `gitattributes` `export-ignore` 文档](https://git-scm.com/docs/gitattributes#_creating_an_archive)）。候选提交只需在 `.gitattributes` 加一行 `test/broken.test.mjs export-ignore`，就能让失败测试在运行器快照中消失并骗取 G17 绿灯，直接击穿 `L103`“不经过过滤器”的原则！
- **修改建议**：删去“（例如 `git archive` 的流）”，改为“由闸门直接遍历 `ls-tree -r -z` 并以 `cat-file --batch` 物化普通文件（忽略候选 `.gitattributes`，遇到 mode `120000` 按策略拒绝或跳过）”。

### 2. 【P1｜事实错误】`L145` 混淆了 `allowed_signers` 与 `authorized_keys` 语法，且将已知不检查 `UP` 位的 `ssh-keygen -Y verify` 写成待测
- **出处**：`research/全流程文档系统方案.md:145`
- **问题**：
  1. OpenSSH `ssh-keygen(1)` 的 `ALLOWED SIGNERS` 格式只接受 `cert-authority`、`namespaces`、`valid-after`、`valid-before` 四个选项，**根本不存在 `no-touch-required` 选项**（该选项仅属于 `sshd(8)` 的 `authorized_keys`）（[OpenBSD `ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1#ALLOWED_SIGNERS)）。
  2. `ssh-keygen -Y verify` 底层只将 `sk_flags` 填入 `sig_details` 供调试输出，**不拒绝** `UP (0x01) == 0` 的无触摸签名（[OpenSSH `ssh-keygen.c`](https://github.com/openssh/openssh-portable/blob/V_9_9_P2/ssh-keygen.c#L2679)）。
- **修改建议**：删除 `L145`“生成允许签名者名单时，不得带 `no-touch-required`”及“是否强制要在原型里实测”，明确写为：“`ssh-keygen -Y verify` 不强制检查 FIDO 用户在场标志；闸门（及任何远端验签脚本）必须在密码学验签通过后，自行解析签名体中的 `sk_flags` 字节并强制断言 `UP (0x01)` 位为 1”。

### 3. 【P1｜新内部矛盾】`L121`（DSSE 封装）与 `L183`（直接用 `ssh-keygen -Y verify` 验 notes 凭据）格式不兼容
- **出处**：`research/全流程文档系统方案.md:121` vs `L183`
- **矛盾**：`L121` 规定凭据采用 in-toto Statement 加 **DSSE JSON 封装**（签的是 `PAE(payloadType, payload)`）；而 `L183` 远端薄验签却写“`ssh-keygen -Y verify` 核验 notes 里的凭据”。`ssh-keygen -Y verify` 只识别 OpenSSH 专有的 `-----BEGIN SSH SIGNATURE-----`（`SSHSIG` 协议头封装），直接喂 DSSE JSON 必然解析失败；且若凭据内嵌了 Owner 的 `ed25519-sk` 批准签名，裸调 `ssh-keygen -Y verify` 同样漏检 `UP=1`。
- **修改建议**：二选一统一接口——**更简方案（推荐）**：直接对规范化 JSON 载荷使用单层 `SSHSIG` detached 签名（附上固定 `-n docaxioms-gate@v1` namespace），省掉 DSSE 外壳，这样远端只需几行脚本调 `ssh-keygen -Y verify` 加检查 `sk_flags`；若坚持保留 DSSE 外壳，`L183` 须改为运行专用薄验签脚本解包 PAE 后再验签。

### 4. 【P1｜改过头违反 A7】`L106` 把候选仓库的整份“依赖锁、命令定义”划入治理文件，导致日常装包或加 npm script 全要触摸硬件密钥
- **出处**：`research/全流程文档系统方案.md:106, 138`
- **问题**：`codex` 原意是保护“闸门自身运行的检查器及其依赖闭包”（这已在 `L71` 由系统目录权限守住）。但 `L106` 将候选仓库内的“依赖锁、命令定义”一并列为治理文件，叠加 `L138`“治理文件变更即触发 Owner 硬件密钥批准（G12）”，意味着业务开发每次 `npm install` 更新 `package-lock.json` 或在 `package.json` 加一条普通脚本，都得走“推 `refs/for` → 弹批准界面 → 插 FIDO2 触摸 → 再推主分支”！高频误伤严重违背 **A7**。
- **修改建议**：切分两套闭包——① **闸门自身执行闭包**（检查器、Node 运行时、闸门依赖）由系统只读目录保护；② **候选仓库内触发 G12 的治理文件**仅限 `docaxioms.json`、`docaxioms/**`、允许签名者名单、`.github/workflows/**`（当启用 Actions 验签时），以及策略里显式锁定的验证入口定义，不无差别拦截整份业务 `package-lock.json`。

### 5. 【P1｜新内部矛盾与过度限制】待审引用 `refs/for/<分支>` 与接收契约冲突，且“全局只允许一个待签请求”会造成自锁
- **出处**：`research/全流程文档系统方案.md:86-87, 100, 140-143, 286, 496-498`
- **问题**：
  1. **状态机未闭合**：`L100` 规定默认拒绝非快进更新且只更受保护引用，`L86` 规定在 `pre-receive` 里就把“签好的凭据”写进证据库。但推待审引用 `refs/for/<分支>`（`L140`）时：① 尚未获得 G12 批准，**不能签发通过凭据**，只能写入未签名的待审检查记录；② 开发者修正问题重推 `refs/for/<分支>` 必然是非快进覆写，必须明确 `refs/for/*` 允许覆写与过期清理，且不触发转发队列。
  2. **并发锁改过头**：`L143, L286` 规定“同一时间只允许一个待签的批准请求 / 第二个批准请求被拒”。若前一个 `refs/for/foo` 搁置未签，后续请求全被拒会直接锁死审批流（违背 A7）。防“签错对象”只需保证**本地批准 UI 每次模态交互只展示并签署当前选定的单个请求**，无需限制闸门里待审引用的个数。
- **修改建议**：区分受保护权威引用与可覆写的 `refs/for/*` 待审暂存引用；将 `L143, L286` 改为“批准界面一次只交互签署一个明确指定的候选请求，禁止批量盲签”。

### 6. 【P2｜边界不完整】`--force-with-lease=<ref>:<旧值>` 未加本地快进前置断言；macOS/Linux 原生桥接需求漏标
- **出处**：`research/全流程文档系统方案.md:97, 153-154, 165, 171, 574-575`
- **问题**：
  1. **`--force-with-lease` 风险（`L171`）**：在首版推荐的“单向镜像”模式（`L165`，如免费个人私有仓无远端禁强推规则）下，`--force-with-lease=<ref>:<旧值>` 只要远端等于 `<旧值>` 就会放行**非快进强推**。必须在 `L171` 补上：“闸门转发前必须**先在本地核验 `<远端旧值>` 是 `C` 的祖先**，再带 `--force-with-lease=<ref>:<旧值>` 推送，兼顾快进与精确 CAS”。
  2. **原生辅助程序范围漏标（`L574-575`）**：Node.js `node:net` 同样没有暴露 macOS 的 `launch_activate_socket` / `getpeereid` 和 Linux 的 `SO_PEERCRED`。若 `L97, L153-154` 要求内核级对端 UID 核验与 `launchd` `Sockets` 激活，`L574` 应如实注明配套包在 macOS/Linux 上也包含极薄的 C/N-API 套接字桥接（或改为由常驻守护进程自建受目录组权限 `0750` 保护的套接字以保持纯 JS）。

### 7. 【P2｜三处局部遗漏与前后不一致】
1. **Actions 治理范围漏锁目录（`L106, L186`）**：既然同名工作流可冒充必需检查，仅把“远端验签配置文件”列为治理文件不够，候选新增 `.github/workflows/other.yml` 即可冒充；须将**整个 `.github/workflows/**` 目录**列入治理白名单。
2. **`L129` 跨机不可达裁决**：`L129` 写“notes 与证据库冲突时，以证据库为准”，但 `L128` 刚说其他机器和远端不访问本机证据库。应改为：“本机对账与补写以本地证据库为准；跨机与远端只认验签通过且匹配目标 `(repo, ref, C)` 与最新治理代次的凭据”。
3. **未配闸门时的 `AGENTS.md` 文案、Copilot Tier 1 与 G16 表内标注（`L241, L394, L397, L412, L427`）**：
   - `L412` 已将文档档位与闸门解耦，但 `L394, L427` 的 `AGENTS.md` 仍写死“只经闸门推送”，应改为“仅在启用闸门时写入该条”；
   - `L397` Tier 1 仍含 `Copilot`，须注明仅限本地 IDE/CLI 形态（Copilot 云端 Agent 无法连接本机闸门套接字）；
   - `L241` 表内的 `G16` 漏标“（首期仅报告，同 `L255, L605`）”。
