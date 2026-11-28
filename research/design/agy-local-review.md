# 《全流程文档系统方案》第二节“本地终审”独立复审（agy）

复审基线：独立核对 `research/全流程文档系统方案.md`（当前 578 行版）、`research/design/brief-local.md`、`core/AXIOMS.lock.md`、`docs/decisions.md`（AD-1..AD-7）及仓库源码，并对 7 项指定底层机制逐条联网核实官方文档，不沿用上一份 `agy-local.md` 的预设结论。

---

## 一、事实错误与技术偏差（联网核实，按严重度排序）

### 1. 【P0｜机制冲突】“专用系统用户，不能登录”与“首版用本机 SSH forced command”直接冲突，且在 macOS 上选反了入口
- **出处**：`research/全流程文档系统方案.md:70, 93-94, 133`
- **联网核实事实**：
  1. **非登录 Shell 无法运行 SSH forced command**：根据 OpenSSH `sshd(8)` 官方手册，`sshd` 执行任何远程命令或 `authorized_keys` 中的 `command="..."` 时，**一律调用目标账号的登录 Shell 并传入 `-c` 参数**（`<login-shell> -c "<command>"`）。若按常规“不能登录的系统用户”将登录 Shell 设为 `/usr/bin/false` 或 `/sbin/nologin`，`sshd` 执行 `/usr/bin/false -c "..."` 会立即返回非零退出码断开，强制命令根本无法启动（[OpenSSH `sshd(8)` Manual](https://man.openbsd.org/sshd.8#LOGIN_PROCESS)）。（注：另核实 `git-daemon` 完全无身份认证，开启 `--enable=receive-pack` 允许任意进程无认证改写引用，确实不能用，[Git `git-daemon` 文档](https://git-scm.com/docs/git-daemon)。）
  2. **macOS 上开启系统 `sshd` 比本机 Unix 套接字更重、更危险**：macOS 默认关闭“远程登录（`sshd`）”，开启它会暴露网络端口，且系统隐藏服务账号默认被 macOS 的 `com.apple.access_ssh` 访问控制组拦截；反过来，macOS `launchd.plist(5)` 原生支持 `Sockets`（`SockPathName` + `SockPathMode`）创建本机 Unix Domain Socket，并可通过 `getpeereid(3)` / `LOCAL_PEERCRED` 在内核层精确核验客户端 UID/GID，能力与 Linux `SO_PEERCRED` 完全等价（[`launchd.plist(5)`](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)、[macOS `getpeereid` / `unix` 机制](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man3/getpeereid.3.html)）。
- **修改建议**：① 删去 `L93, L133`“首版用本机 SSH forced command，以后换套接字”，macOS 与 Linux 首版统一采用**本机 Unix Domain Socket + Git 远程助手**（零触碰 `sshd`、零登录 Shell 冲突）；② 若保留 SSH 备选说明，必须注明该专用账号需配置支持 `-c` 的受限 Shell（如 `git-shell` 或专用包装器）并禁用密码登录，而非 `/usr/bin/false`。

### 2. 【P0｜平台事实错误】GitHub 个人仓库限制“只认闸门签名或部署密钥推送”存在三处事实错误/漏配陷阱
- **出处**：`research/全流程文档系统方案.md:25, 144-160, 165, 537`
- **联网核实事实**：
  1. **GitHub Free 个人私有仓库完全没有分支保护和 Rulesets**：GitHub 官方文档明确规定，个人免费账号（GitHub Free）仅**公开仓库**支持 Rulesets / 分支保护；**个人私有仓库必须付费升级 GitHub Pro** 才能启用这些规则（[GitHub Rulesets 可用性文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)）。`L25` 笼统称对个人仓库可配“远端薄验签”（`L150`）在免费个人私有仓上不成立。
  2. **GitHub 原生 `Require signed commits` 不认闸门签名，也不支持 Deploy Key 签名**：GitHub 内置提交验签只检查 commit 对象头的 GPG/SSH/S/MIME 签名，且公钥必须绑定在某个 GitHub **人类用户账号**名下（Deploy Key 仅用于仓库传输认证，不能作为账号签名密钥；且本方案 `L118-119` 明确将签名放在仓库外证据库与 `refs/notes` 而非 commit 内）（[GitHub Commit Signature Verification 文档](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)）。
  3. **个人仓库配置 Deploy Key 独占推送时，单条 Ruleset 会导致闸门同时绕过“薄验签”与“只允许快进”**：传统分支保护的 `Restrict who can push to matching branches` **仅对组织（Organization）仓库开放**，个人仓库不可用（[Protected Branches 文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#restrict-who-can-push-to-matching-branches)）。在个人公开仓（或 Pro 私有仓）只能改用 Rulesets 的 `Restrict updates` 并把闸门 Deploy Key 加入 Bypass list；但**同一条 Ruleset 的 Bypass list 会豁免该规则集内的全部规则**！若把 `Restrict updates`、`Require linear history` 和 `Require status checks` 放在同一条 Ruleset 里，闸门 Deploy Key 会连带绕过状态检查和快进限制——**必须拆成两条独立 Ruleset 叠加（Rule Layering）**：一条只管 `Restrict updates`（给 Deploy Key 开 Bypass），另一条管 `Require linear history` + `Require status checks`（Bypass 留空）（[GitHub Rule Layering 文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rule-layering)）。
- **修改建议**：在 `L144-160` 与 `L165` 修正上述三项条件：注明个人私有仓需付费套餐才支持远端规则；明确“远端认闸门签名”依赖自定义状态检查而非 GitHub 原生 `Require signed commits`；补上双层 Rulesets 配置要求。

### 3. 【P1｜关键事实错误】`pre-receive` 隔离期的新对象对“另一个低权限运行器用户/虚拟机”默认不可读
- **出处**：`research/全流程文档系统方案.md:71, 81, 97, 105`
- **联网核实事实**：`git-receive-pack` 在 `pre-receive` 期间将新推送对象写入 `$GIT_DIR/objects/tmp_objdir-incoming-XXXXXX` 临时隔离目录，并通过环境变量 `GIT_OBJECT_DIRECTORY` / `GIT_ALTERNATE_OBJECT_DIRECTORIES` 传给同用户的钩子进程（[Git Quarantine Environment 文档](https://git-scm.com/docs/git-receive-pack#_quarantine_environment)）。该目录归闸门系统用户所有（通常受 `0700` 父目录保护）；当闸门按 `L71` 切换到**另一个不同的低权限系统用户或虚拟机**运行检查时，运行器既没有闸门私有 `objects/` 目录的读权限，也无法直接对闸门裸仓执行 `git ls-tree` / `git cat-file`（`L97`）！
- **修改建议**：`L81, L97` 区分两步——闸门进程自身用 `ls-tree` / `cat-file` 读取 quarantine 对象做纯数据检查，若需交给低权限运行器/虚拟机跑 `projectChecks` 或 G17 测试，必须先由闸门导出无符号链接的干净归档快照（如 `git archive` 流）到运行器的只读输入目录。

### 4. 【P1｜事实不完整】FIDO2 `ed25519-sk` 并非天然强制物理触摸，漏写验签侧禁止 `no-touch-required`
- **出处**：`research/全流程文档系统方案.md:126`（“OpenSSH 的 `ed25519-sk`，每次签名都要物理触摸”）
- **联网核实事实**：OpenSSH `ssh-keygen -t ed25519-sk -O no-touch-required` 允许生成**无需物理触摸**即可静默签名的硬件密钥（签出的 FIDO User Presence `UP` 标志位为 `0`）。虽然 `ssh-keygen -Y verify` 默认要求 `UP=1`，但只要 `allowed_signers` 中写入了 `no-touch-required` 选项就会放行无触摸签名（[OpenSSH `ssh-keygen(1)` Manual](https://man.openbsd.org/ssh-keygen.1#FIDO_AUTHENTICATOR)）。
- **修改建议**：`L126, L393` 补上硬约束：由 `ownership.md` 生成 `allowed_signers` 及闸门验签时，**严禁接受 `no-touch-required` 选项，强制校验 FIDO User Presence（`UP=1`）标志位**。

### 5. 【P1｜关键平台约束遗漏】macOS 无登录后台守护进程用 Secure Enclave 受 Apple Provisioning Profile 与 Bundle 签名硬阻断
- **出处**：`research/全流程文档系统方案.md:133, 535`
- **联网核实事实**：Apple 官方技术规范 **TN3137** 明确指出两点：① Secure Enclave 所依赖的 Data Protection Keychain **仅在用户登录上下文（user context）可用**，不支持传统无登录系统 daemon；② 在 macOS 上使用 Data Protection Keychain / 受限硬件密钥能力必须具备受限 Entitlement，**必须嵌入 `.app` 形态的 Bundle 目录结构并绑定付费 Apple Developer 账号签发的 Provisioning Profile 代码签名**，裸 CLI/daemon 二进制或本地自签名开源包均被系统内核直接拒绝（[Apple TN3137: On Mac keychain APIs and implementations](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains)）。
- **修改建议**：`L133, L535` 点明这一开源分发硬门槛——对本地 npm/开源安装而言，macOS 后台闸门首版应明确固定用闸门账户私有目录软件密钥（或 PKCS#11 外部硬件 Token），不必在无 Apple 商业证书签名的后台 daemon 上耗费精力攻关内置 Secure Enclave。

### 6. 【P2｜安全细节不完整】Windows Named Pipe 仅设 DACL 不够，漏掉防远程 SMB 与防管道抢注标志
- **出处**：`research/全流程文档系统方案.md:135`
- **联网核实事实**：Node.js `node:net` 底层 `libuv`（`uv_pipe_bind`）调用 `CreateNamedPipeW` 时确实传入 `lpSecurityAttributes = NULL`（默认授予 `Everyone` 和匿名账户读权限，[libuv Pipe 文档](https://docs.libuv.org/en/v1.x/pipe.html)、[Microsoft Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)）。但在 Windows 上编写原生辅助程序调用 `CreateNamedPipeW` 时，仅设置显式 DACL 仍可能遭受局域网 SMB 管道连接或低权限进程同名管道抢注劫持，必须同时指定 `PIPE_REJECT_REMOTE_CLIENTS` 和 `FILE_FLAG_FIRST_PIPE_INSTANCE`（[`CreateNamedPipeW` 文档](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipew)）。
- **修改建议**：`L135` 补入上述两个必选标志位。

---

## 二、设计上的内部矛盾与公理 / AD-1..AD-7 冲突（按严重度排序）

### 1. 【P0｜流程死锁】生命周期表把“推送”排在“审查（触摸硬件密钥）”之前，但 `pre-receive` 推送时无批准必拒
- **出处**：`research/全流程文档系统方案.md:455-456` vs `L83-85, L100, L206`
- **矛盾**：`L83, L100, L206` 规定闸门在 `pre-receive` 阶段必须核验 Owner 批准（G12）有效才接收引用并签发 G22；但 `L455-456` 生命周期表却写成先“推送（闸门跑检查并签名 G22）”再“审查（人看闸门生成的影响报告，触摸硬件密钥 G12）”。若涉及 K2 / 治理变更，推送时还没有 G12 批准，会被 `pre-receive` 当场拒绝，永远走不到下一步！
- **修改建议**：明确两阶段动作——① 批准前先运行本地预审命令（或推向闸门的非权威待审引用 `refs/for/<branch>`）生成影响报告，Owner 审阅后触摸 FIDO2 签发绑定 `(B, C, policyDigest)` 的批准记录；② 再推送更新权威分支，由闸门一并核验通过并签发 G22。

### 2. 【P1｜违背 M2 / A7 且内部口径不一】G12 触发条件在第二节与第五节冲突，把“新需求/K4 任务”也绑上硬件触摸
- **出处**：`research/全流程文档系统方案.md:125` vs `L390` vs `L449-450`
- **矛盾**：`L125` 规定只有“治理变更、改公理、策略规定的 K2 变更”才需 Owner 批准；但 `L449` 生命周期表把“需求（在 `tasks/` 新建任务页，新意图等 owner 接受）”也标上了 `G12`。一方面，机器无法在自然语言任务页或 K2/K3 混写的 `architecture.md`（`L390`）里精确判定“算不算新意图”（违背 A6/M2）；另一方面，连建一个开放任务草稿（K4）都强制插硬件密钥触摸，会造成高频打扰（违背 A7）。
- **修改建议**：删除 `L449` 需求阶段的 `G12`；明确 G12 仅由**精确路径/语法谓词**触发（治理白名单、`core/AXIOMS.lock.md`、`docs/decisions/**`、`docs/ownership.md`、`docs/requirements.md`）。

### 3. 【P1｜多机与权限自相矛盾】权威证据库放“仓库外闸门私有目录”，导致用户态恢复与多机/远端薄验签拿不到凭据
- **出处**：`research/全流程文档系统方案.md:117-118` vs `L145, L153, L265, L274`
- **矛盾**：`L117-118` 将完整签名凭据存在闸门管理的仓库外目录，`refs/notes/docaxioms` 仅做索引且称“找不到证据就判 blocked”。这会导致：① 普通用户态启动核对命令（`L274`）无权直接读取 `_docaxioms` 私有目录；② 多机协作或远端薄验签（`L145, L153`）只收到 Git 对象与 notes，读不到发起者本机仓库外的证据库，必然触发 `blocked`！
- **修改建议**：将**签名后的 DSSE 凭据本体（仅数 KB 的纯文本 JSON）直接存入 `refs/notes/docaxioms`** 随 Git 同步（闸门本地仓库外目录仅存大体量测试原始日志，凭据内保存日志哈希），并为本机用户态 CLI 提供只读查询接口。

### 4. 【P2｜与 AD-4 轻量化原则存在张力】将 `full` 文档预设与“安装本地特权闸门”强绑定
- **出处**：`research/全流程文档系统方案.md:371` vs `docs/decisions.md:8-10`（AD-2、AD-4）
- **冲突**：`L371` 定义“`full`：下表全部，配合本地闸门”。但“采用多目录 `full` 文档体系”与“是否在本机安装跨系统用户守护进程”完全是两个维度：许多团队只用标准纯 JS CLI + 远端 CI 也需要 `full` 文档结构。绑死会违背 AD-2/AD-4 让消费项目零系统侵入接入的初衷。
- **修改建议**：`L371` 将“文档档位（`minimal` / `full`）”与“执行档位（标准 CLI / 跨用户本地闸门）”正交解耦。

---

## 三、过度设计与更简单的替代（按收益/复杂度比排序）

### 1. 【P1｜过度设计】单机拆成“三个系统权限域（含独立运行器账号/虚拟机）”+ 首版 SSH forced command
- **出处**：`research/全流程文档系统方案.md:67-73, 93-94, 532`
- **简化替代**：
  1. **三个系统身份减为两个（日常用户 + `_docaxioms` 闸门用户）**：纯文档检查（G01–G16、G19–G20）是确定性内存计算，直接在闸门进程内对 Git blob 运行即可；只有跑不可信 `projectChecks` 和 G17 测试命令时，由 `_docaxioms` 用系统现成无特权沙箱（macOS `sandbox-exec`、Linux `bwrap --unshare-net`）派生子进程，且**签名私钥与远端凭据不进入子进程可读路径或环境变量**。省去第 3 个系统账户和本机虚拟机管理。
  2. **一步到位用本机 Unix Socket + `git-remote-docaxioms`**，砍掉过渡性的本机 SSH forced command。

### 2. 【P1｜过度设计】在 GitHub.com 薄验签模式下要求“推暂存分支 + 运维独立常驻 GitHub App”
- **出处**：`research/全流程文档系统方案.md:150-156`
- **问题**：为了在本地做终审，反而要求用户去云端开发、部署并维护一个持有私钥的独立 GitHub App 服务，还要搞“推暂存分支 → 等 App 回写 → 再推主分支”的四步状态机，比直接跑远端 CI 还重。
- **简化替代**：
  - **单人仓库**：双层 Ruleset 设 `Restrict updates`（仅放行本地闸门的 Deploy Key）+ `Require linear history`，本机日常账户不留直推/管理凭据，**连远端验签 App 都不需要**——因为物理上只有本地闸门能推上去！
  - **多人仓库**：直接推分支与 `refs/notes/docaxioms`，用一个 **3 秒无状态 GitHub Actions 工作流**（调系统自带 `ssh-keygen -Y verify` 核验 note 签名，workflow 文件由 `CODEOWNERS` 或组织级 Required Workflow 锁死）充当必需检查，零外部服务器运维。

### 3. 【P2｜鸡肋分档】“轻量档（同一用户下的 bare 闸门仓库）”与远端“四选一”
- **出处**：`research/全流程文档系统方案.md:55, 140-147, 553-556`
- **问题与替代**：
  - **砍掉同用户 bare 闸门“轻量档”**：`L55` 已承认它“只防手滑，不防 Agent”，却逼用户在本机维护双仓库转发链路；防手滑直接用客户端 `pre-push`（检查待推提交快照）即可，真正需要防 Agent 绕过时直接装跨用户闸门。
  - **远端“四选一”合并为“三选一”**：“远端镜像”（`L144`）在校验逻辑上就是“完全本地 + `post-receive` 单向备份推送”，合并入“本地权威（含可选单向镜像）”即可，保留 **① 本地权威（含镜像） / ② 远端薄验签 / ③ 远端复验** 三档更清晰。

---

## 四、遗漏与高估（重点审查“共用用户补法”与“本地守不住的”清单）

### 1. 【P0｜严重高估】`L165` 声称“共用系统用户持有远端凭据”可用“远端只认闸门签名”或“Agent 沙箱网络白名单”补上——实测推演均漏水！
- **出处**：`research/全流程文档系统方案.md:165, 308`
- **逐条刺破**：
  1. **补法一（“远端只接受带闸门签名的提交”）漏水**：
     - 若闸门也在同一用户下，Agent 可直接调用闸门私钥自签自推；
     - 即使闸门在独立用户 `_docaxioms` 下，只要日常用户目录里留着 **Owner 的高权限凭据**（如默认 `gh auth` 登录态、含 `repo`/管理权限的经典 PAT、浏览器已登录 Cookie），同用户的 Agent 无需直推 Git，只需发一条 GitHub API 请求**临时删改/绕过远端 Ruleset → 强推代码 → 恢复 Ruleset**，远端验签规则瞬间失效！
     - 且在 GitHub Free 个人私有仓上，远端根本无法开启该规则。
  2. **补法二（“用 Agent 沙箱网络白名单挡住直连托管平台”）漏水**：
     - 仅 Claude Code、Codex CLI 等少数工具有内置网络沙箱（Cursor、Windsurf、Cline、Aider 及原生 Windows 均无统一强制拦截）；
     - 即便开启域名白名单，日常开发拉取依赖（`npm i github:...`、`cargo`/`go` 拉库、`gh` 查 issue）往往**必须放行 `github.com` / `api.github.com`**，域名级代理无法区分拉包与推代码；且 CLI 沙箱默认允许**读取** `~/.ssh`、`~/.config/gh` 等同用户凭据文件！
- **真正有效的唯一补法（修改建议）**：在 `L165` 明确——**日常开发用户环境必须实施“凭据降权”**：不在开发用户下存放含受保护分支直推权或仓库管理（Admin）权限的长效 Token/SSH Key（日常只留只读或仅限个人开发分支的细粒度凭据），将受保护分支推送权唯一交给 `_docaxioms` 持有的 Deploy Key。

### 2. 【P1｜关键遗漏】“本地方案守不住的”清单（`L161-173`）漏掉了四项真实攻击/失效面
- **出处**：`research/全流程文档系统方案.md:126, 161-173, 515`
- **应补入第 5 条表格的四项缺口**：
  1. **同用户下的前端掉包 /“所见非所签”（Confused Deputy）攻击**：即使闸门在独立用户下、FIDO2 需要人类触摸，只要“本地批准界面”（`L126`）或用户的 `~/.zshrc` / `$PATH` 在普通用户可写范围内，Agent 就能植入别名或篡改前端显示——屏幕上给 Owner 展示良性提交 `C_1` 的报告，底层却把恶意提交 `C_2` 送去请求 FIDO2 触摸签名！**缓解**：批准命令必须从管理员只读路径启动，并在硬件签名挑战或独立可信终端里回显提交短哈希供人工比对。
  2. **工作区 `.git/config` 远程地址欺骗**：Agent 可将工作区的 `remote.origin.url` 改指本机临时目录并谎报“已推送通过闸门”（虽未污染真权威分支，但会误导会话收尾判断）。**缓解**：启动核对与收尾检查强制校验 `origin` 指向受控闸门入口。
  3. **本机系统时钟回拨**：无外部可信时间戳（TSA）时，本地签名时间依赖系统时钟，时钟漂移或篡改会影响密钥有效期与 `L515` 的热修豁免时间窗。**缓解**：改用单调递增的治理代次/RSL 序号而非挂钟时间做安全判据。
  4. **整机备份恢复（Time Machine / 快照回滚）**：整盘恢复会把工作区、本地闸门裸仓和本地仓库外证据库一并回退到旧状态，单机自身无法察觉“已撤销的密钥或决策复活”。**缓解**：联网恢复后与远端引用状态链对账（`L174` 已提离线对账，需点明整机快照回滚场景）。

---

## 五、对第八节 12 项待 Owner 决定问题（`L553-570`）的逐条推荐

| # | 待决问题（`L553-570`） | 明确推荐 | 核心理由 |
|---|---|---|---|
| **1** | 闸门档位、保护对象、是否查全部中间提交 | **不设同用户轻量档，只做跨用户真闸门（配标准无闸门 CLI 模式）**；首期只保护权威分支与发布 tag 的**最终树 `T`**，不查中间历史提交 | 同用户裸仓防不住 Agent 纯属白折腾；允许中间草稿提交、只卡最终合入树符合 A7 |
| **2** | 打包边界（AD-4）与独立配套包 | **主包 `docaxioms` 保持 100% 纯 JS CLI；特权闸门拆为独立可选包（如 `@docaxioms/gate`），新增 `AD-8` 授权**，且与 `full` 文档档位解耦 | 守住 AD-2/AD-4 零特权开箱即用优势，不把系统守护进程强加给普通消费项目 |
| **3** | 闸门密钥、Owner 批准方式、必审范围 | **闸门首版用 `_docaxioms` `0600` 软件密钥**；Owner 批准优先用 **FIDO2 `ed25519-sk`（强制验 `UP=1`）**，无硬件时退回 **`sudo` 管理员口令/Touch ID**；仅治理白名单、`AXIOMS.lock.md`、`decisions/`、`ownership.md`、`requirements.md` 必审 | 避开 macOS 后台 daemon 调 Secure Enclave 的 Apple 商业签名死结；严控人工触摸频率（A7） |
| **4** | 远端模式与多机密钥管理 | 合并为三模式：**单人私有仓用“本地权威 + 远端纯备份镜像（日常账号去管理凭据）”**；**多人/公开仓用“本地验收 + 远端 3s Actions 薄验签（双层 Ruleset 锁快进）”**；设备公钥由 `ownership.md` 生成 `allowed_signers` | 省去自建常驻 GitHub App 的运维负担，同时绕开免费个人私有仓无 Ruleset 的限制 |
| **5** | 平台优先级 | **首期只做 macOS + Linux**（统一走 Unix Socket 远程助手）；Windows 首期走 WSL2，原生服务排第二期 | 砍掉首期 Win32 C++ Named Pipe DACL 与 CRLF/服务账户的系统兼容泥潭 |
| **6** | `full` 档结构、单份 `GUIDE` 兼容两档及旧记录迁移 | `GUIDE` 用抽象集合词（不写死表格行或目录），声明存储形态由 `docaxioms.json` 指定；`minimal → full` 切换日将旧 `decisions.md`/`log.md` **整文件移入 `history/` 封存** | 零膨胀保持单份简短 `GUIDE`（A3），零改写保留历史（A5） |
| **7** | 条目 ID 格式与引用匹配规则 | 格式定为 `<前缀><YYYYMMDD>-<slug>`（如 `D-20261127-gate-ipc`）；扫描正则匹配该格式并**同时向后兼容旧式 `<前缀>\d{1,4}`** | 兼顾并行免撞号、正文/源码精确词法扫描与旧项目平滑升级 |
| **8** | G16（受管契约路径变更处置） | **首期以 `aid` 上线观测，暂不做阻断 `gate`**；契约路径在 profile 显式登记 glob | 严守 M2 与 AD-7，先实测确认不会沦为机械填表再决定是否升格 |
| **9** | 适配器维护与 Tier 1 名单 | 正式维护 `adapters/`；首期 **Tier 1 精简为 4 个本地主力工具**（Claude Code、Codex CLI、Cursor、Gemini CLI），Copilot 云端 Agent 列入 Tier 2 | 云端 Agent 无法连本机闸门套接字，收缩 Tier 1 确保契约测试真正可维护 |
| **10** | 冷启动必读链 | **改为“公理 + `CURRENT.md` + `AGENTS.md` 底线”**；通过探测的产品将 `GUIDE` 改为技能按需加载 | 有实证支撑降低冷启动上下文税，且底线留在 `AGENTS.md` 不失守 |
| **11** | G21（审计义务到期） | **默认仅提醒/更新单一去重漂移 Issue；可选阻断档仅卡“正式发布”，绝不卡日常分支接收** | 防止紧急修复因审计到期被迫绕过闸门（A7） |
| **12** | 本仓库是否改用 `full` 档与闸门 | **本仓库保持现有轻量结构**；另建/选定一个外部真实试验项目落地 `full` 档 + 本地闸门原型，并采集 AD-7 升格实证 | 避免在本仓库开发期叠加结构大搬家，严格落实 AD-7 外部实证要求 |
