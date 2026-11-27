# 把最终门槛留在本地：可行性与程序架构方案（agy）

> **说明**：本文独立针对 [brief-local.md](brief-local.md) 撰写，不沿用前几轮“最终验收必须放远端”的预设结论。只读核对仓库文件（`HEAD a56e5c0`、`research/全流程文档系统方案.md` 现行 485 行版、`core/`、`docs/decisions.md`、`src/`、`bin/`）并联网核实底层机制，全文严格区分 **【已核实事实】**（附源码行号或官方文档出处）与 **【设计/推导】**。

---

## 核心结论速览

1. **最终门槛完全可以留在本地，但“同用户下的钩子或裸仓”做不到硬门槛，真正的分水岭是“跨操作系统用户的特权隔离闸门服务 + 独占远端凭据 + 硬件签名”。**
2. **对单人仓库（如本仓库 `Zephinel/docaxioms`），本地跨用户闸门不仅可行，甚至比免费版 GitHub 远端更硬**：GitHub 个人账号没有合并队列与组织级必需 workflow，也防不住 Agent 借用本机 Owner 凭据自提自合；而本地跨用户闸门配合硬件触摸签名（Touch ID / FIDO2），第一次在物理上把“终端里的 Agent”和“键盘前的 Owner”隔离开来。
3. **最优形态是“本地终审 + 远端极薄验签（且受保护分支强制线性 Fast-forward）”**：99% 的重型检查、测试运行（G17）和治理判定在本地离线完成并签入 `refs/notes/docaxioms`；托管平台（若使用）退化为一个零业务依赖、3 秒跑完的公钥验签器与多机汇合点。
4. **常驻文件监听守护进程只能做“性能热缓存”，不能让会话事件记录完整到充当验收依据**（内核事件在三端均可能合并或溢出丢包，且观测不到命令语义与退出码）。

---

## 一、本地能做到多硬：六种机制逐项评估（A6）

### 1. Git 客户端钩子（`pre-commit` / `pre-push`）
- **【已核实事实】**：Git 客户端钩子可被 `--no-verify`（`-n`）直接跳过，新 clone 默认不带 `.git/hooks`（[Git `githooks` 文档](https://git-scm.com/docs/githooks)）。当前引擎 `src/check.mjs:70-108` 读工作树（`README.md:56`），即使升级为读 `HEAD` 提交树，钩子本身仍运行在调用者进程内。
- **守住**：善意开发者和守规矩的 Agent 在提交/推送前尽早暴露断链、pin 漂移和超预算。
- **没守住（A6）**：`--no-verify`；删除或改写 `.git/hooks` / `core.hooksPath`；底层 `git commit-tree` + `git update-ref`；直接推向远端 URL。

### 2. 同 OS 用户下的本地“闸门裸仓库”（Local Bare Repo + `pre-receive` / `update`）
- **【已核实事实】**：
  - `git push` 触发接收端 `git-receive-pack`，先将传入对象放入临时**隔离环境（quarantine directory）**，再运行服务端钩子 `pre-receive`（整次推送一次）和 `update`（逐引用一次）；`--no-verify` **只对客户端钩子有效，无法跳过 `pre-receive` / `update`**；钩子非零退出时 Git 自动销毁隔离目录且不更新任何引用（[Git `git-receive-pack` 文档](https://git-scm.com/docs/git-receive-pack)、[`githooks` 文档](https://git-scm.com/docs/githooks)）。
  - `pre-receive` 从标准输入接收 `<old-oid> <new-oid> <ref-name>`，天然针对不可变提交树 `T` 与基线提交 `B` 验收，彻底消除工作树脏态干扰。
- **守住**：彻底防住 `--no-verify` 误跳过；强制检查已提交的不可变树 `T`；可从基线 `<old-oid>` 读取旧策略。
- **没守住（A6，致命盲区）**：只要闸门裸仓与工作区属于**同一操作系统用户（UID）**，拥有 shell 权限的 Agent 或脚本可以直接 `chmod -x gate.git/hooks/pre-receive`、直接修改 `gate.git/refs/`，或者读取当前用户的 `~/.ssh` / 凭据管理器**绕过本地裸仓直接 `git push` 到 GitHub**。

### 3. 跨 OS 用户的特权隔离闸门服务（独立系统账户 `_docaxioms` + IPC + 独占推送凭据）
- **【已核实事实（关键工程陷阱）】**：
  - **不能让用户直接 `git push /var/lib/docaxioms/gate.git` 文件路径来跨用户！** 本地文件路径 push 是在**推送者自己的 UID 下**直接启动 `git-receive-pack`：若 `_docaxioms` 的裸仓对开发者不可写，推送直接报 `Permission denied`，且 Git 2.35.2+（修复 CVE-2022-24765）会因仓库所有者与当前 UID 不一致直接报错 `fatal: detected dubious ownership in repository`（[Git `safe.directory` 文档](https://git-scm.com/docs/git-config#Documentation/git-config.txt-safedirectory)）；若放开目录写权限，开发者/Agent 又能直接篡改钩子和引用。
  - **正确做法**：通过 Git 原生远程助手协议 `gitremote-helpers`（`origin = docaxioms::<repo>`，[Git `gitremote-helpers` 文档](https://git-scm.com/docs/gitremote-helpers)）或本地 SSH/HTTP，经 Unix Domain Socket / Named Pipe 连接运行在独立低特权用户 `_docaxioms` 下的守护进程，由守护进程在 `_docaxioms` 身份下调用 `git-receive-pack` 并独占持有远端 Deploy Key / Token。
- **守住**：同机非特权进程（包括放开 shell 的各类编程 Agent）**改不了闸门钩子、改不了基线策略、读不到签名私钥、也拿不到直推托管平台的凭据**——在单机普通权限边界内实现真正的硬阻断。
- **没守住（A6）**：本机 `root` / `sudo` / Windows Administrator 提权；以及若不在闸门内区分“普通推送”与“Owner 物理确认”，Agent 仍可通过合法推送通道请求修改治理白名单文件（需第 4 项硬件交互签名补齐）。

### 4. 本地密码学签名 Attestation（硬件保护密钥 + `refs/notes` / 链式日志）
- **【已核实事实】**：
  - **系统/硬件级密钥防导出**：
    - **macOS**：Apple Silicon / T2 的 Secure Enclave 支持生成不可导出的 P-256 私钥（私钥永不离开硬件；注意无图形界面的 `launchd` 系统守护进程不能绑定生物识别 `.biometryCurrentSet`，否则触发 `errSecInteractionNotAllowed / -25308`，后台自动签名须用 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，人类审批签名则走用户 GUI 会话 Touch ID 或外部硬件密钥，[Apple CryptoKit `SecureEnclave` 文档](https://developer.apple.com/documentation/cryptokit/secureenclave)）。
    - **Linux**：`systemd-creds` + `LoadCredentialEncrypted=` 支持将私钥经 TPM 2.0 绑定加密，仅在服务激活时解密到内核隔离的内存 `tmpfs/ramfs`（`$CREDENTIALS_DIRECTORY`），不进环境变量（[systemd Credentials 文档](https://systemd.io/CREDENTIALS/)）。
    - **Windows**：CNG（Cryptography Next Generation）支持生成不带 `NCRYPT_ALLOW_EXPORT_FLAG` 的不可导出私钥（绑定 TPM Platform Crypto Provider 或服务账户 DPAPI，`NCryptExportKey` 会被系统直接拒绝，[Microsoft CNG Key Storage 文档](https://learn.microsoft.com/en-us/windows/win32/seccng/key-storage-and-retrieval)）。
    - **跨平台物理在场证明（FIDO2）**：OpenSSH 8.2+ 与 Git 2.34+ 原生支持 `ed25519-sk` 硬件密钥（如 YubiKey）及 `ssh-keygen -Y sign / verify` + `allowed_signers`，每次签名强制要求人类手指物理触摸硬件密钥（[Git `gpg.format` 文档](https://git-scm.com/docs/git-config#Documentation/git-config.txt-gpgformat)）。
  - **元数据载体与隔离区陷阱**：
    - **不能用 Commit Trailer 存当前提交自身的验收签名**：追加 trailer 会改变 commit SHA 本身，破坏提交历史且无法对最终 commit SHA 签名。
    - **不能在 `pre-receive` 内直接写 `refs/notes/*`**：`pre-receive` 运行在 quarantine 隔离期，Git 明文禁止在 `pre-receive` 中更新任何引用指向隔离区对象（[Git `git-receive-pack` Quarantine 文档](https://git-scm.com/docs/git-receive-pack#_quarantine_environment)）。必须在 `pre-receive` 验过并生成签名后暂存，在紧随其后的 `post-receive`（或守护进程持有仓库锁的后置步骤）写入 `refs/notes/docaxioms`。
    - **同类成熟先例**：Google `git-appraise` 将代码审查与批准记录以行级 JSON 存入 `refs/notes/*` 随 Git 同步（[`google/git-appraise`](https://github.com/google/git-appraise)）；OpenSSF `gittuf` 将分支每次合法演进签入哈希链 `refs/gittuf/reference-state-log`（RSL），支持全离线 `gittuf verify-ref` 防篡改与防回滚（[`gittuf.dev`](https://gittuf.dev/)）；载荷格式可采用标准 in-toto Statement + DSSE 信封（[`in-toto.io`](https://in-toto.io/)）。
- **守住**：证据留在源码树 `T` 之外（解决 $T_1/T_2$ 循环），可随 Git 分发，断网可验；远端无需重跑 Node 检查，几毫秒验签即可确认该提交经过受信任闸门验收。
- **没守住（A6）**：单独使用 Git Notes 防不住分支被强推回滚到某个“历史上曾验过签的旧提交”（需配合远端禁强推或本地 `gittuf` 式链式 RSL ref）；若守护进程本身被攻破，攻击者虽导不出硬件私钥，但可驱动守护进程充当“签名预言机（signing oracle）”。

### 5. 常驻文件监听守护进程（File Watcher + 内存热引擎）
- **【已核实事实】**：Node.js v22 的 `fs.watch(dir, { recursive: true })` 已覆盖 macOS（`FSEvents`）、Windows（`ReadDirectoryChangesW`）和 Linux（v19.1+ 基于 `inotify` 封装）（[Node.js v22 `fs.watch` 文档](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)）。但三端底层均**不具备不丢包保证**：macOS `FSEvents` 会合并短时多次写入；Linux `inotify` 受 `max_user_watches` 限制且快速建多层目录有挂载竞态；Windows `ReadDirectoryChangesW` 在大批量文件变动（如切分支、装依赖）时内核缓冲区溢出直接丢弃事件；网络挂载盘不可靠。
- **守住**：将 Markdown AST 与 pin 索引常驻内存，使 Agent 钩子查询从数百毫秒降至 **<5ms**；文件改动后即时计算脏集合。
- **没守住（A6）**：无法保证事件 100% 不漏，完全观测不到未改文件的测试命令运行与退出码，进程重启期间存在盲窗——**不能作为合规证据或写入锁依据**。

### 6. 本地沙箱 / 容器运行 Agent（只读挂载 + 受控写入代理）
- **【已核实事实】**：Claude Code（macOS `Seatbelt`、Linux/WSL2 `bubblewrap`，[Claude Code Security 文档](https://code.claude.com/docs/en/security)）与 Codex CLI（Seatbelt / Linux Landlock）已内置进程级沙箱，原生 Windows 尚缺同等轻量 CLI 沙箱。
- **守住**：用只读 bind-mount 锁死 `docaxioms/`、`docaxioms.json`、`.git/`，可阻止沙箱内 Agent 直接篡改受保护文件。
- **没守住 / 代价**：若把全部源码设为只读、强制一切写入走代理 RPC，会瘫痪现有 IDE（Cursor/VS Code）与编译器/格式化器工具链；且无法约束沙箱外的人类终端或 GUI 客户端。**因此沙箱适合作为外围加固（锁 `.git` 与 `docaxioms/`），而把最终硬闸门放在 Git 接收端（机制 3 + 4）性价比高得多。**

### 六种机制横向对比总表

| 本地机制 | 防 `--no-verify` | 防同机 Agent Shell 篡改 | 读不可变提交 `T` | 离线可用 | 对开发体验摩擦 | 综合定位 |
|---|---|---|---|---|---|---|
| 客户端 `pre-commit`/`pre-push` | 否 | 否 | 可（`--commit`） | 是 | 极低 | 前置快速提醒 |
| 同用户裸仓 `pre-receive` | **是** | 否（同 UID 可改钩子/直推） | **是** | 是 | 低 | 单人防误操作 |
| **跨用户闸门服务 `_docaxioms`** | **是** | **是（0 文件权限 + 独占凭据）** | **是** | **是** | 低（透明 `git push`） | **本地终审核心边界** |
| **硬件密钥签名 + `refs/notes`** | —（配合闸门） | **是（FIDO2 强制物理触摸）** | **是** | **是** | 仅改治理时触摸一次 | **可移植防伪证据 + Owner 授权** |
| 常驻文件监听 `fs.watch` | 否 | 否 | 否（读工作树） | 是 | 零 | 钩子亚 5ms 加速缓存 |
| 源码只读挂载 + 写入代理 | 是 | 视宿主而定（Windows 弱） | 否 | 是 | **极高（破坏工具链）** | 不推荐管全量源码 |

---

## 二、推荐的本地程序架构：`docaxioms-gated`

### 1. 架构拓扑与权限边界（“工作区自由读写，出境口特权隔离”）

```text
┌─────────────────────────── 用户空间 (UID: dev — 人类编辑器 & 各类 AI Agent) ───────────────────────────┐
│ 工作仓库 /path/to/repo                                                                               │
│  ├─ origin = docaxioms::my-repo   （工作区不存 GitHub 推送凭据）                                      │
│  ├─ git-remote-docaxioms          （薄转发器，仅通过本地 Socket 通信）                                │
│  ├─ docaxioms-watch (可选用户态)  （缓存 AST/pin，供 Agent 钩子 <5ms 快查，无安全特权）               │
│  └─ docaxioms approve (人类交互)  （变更治理/K2 时，唤起 Touch ID / YubiKey 物理触摸签发批准票据）    │
└──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                   │ Unix Domain Socket (/var/run/docaxioms/gate.sock)
                                                   │ 或 Windows Named Pipe (严格 SDDL DACL + 禁远程)
┌────────────────────────── 隔离服务空间 (UID: _docaxioms — 无交互登录系统账户) ─────────────────────────┐
│ docaxioms-gated 守护进程  [目录 /var/lib/docaxioms 权限 0700，dev/Agent 零读写权限]                   │
│  ├─ repos/my-repo.git             （权威闸门 bare 仓库，持有真实 upstream URL）                       │
│  ├─ verifier sandbox              （无网络、只读检出候选树 T，用基线策略跑 check + G17 必需测试）      │
│  ├─ Gate Signing Key (不可导出)   （macOS SE / Linux TPM2 systemd-creds / Windows CNG）               │
│  ├─ trust/owners.allowed_signers  （Owner 的 FIDO2 / Touch ID 公钥名册）                              │
│  └─ Upstream Deploy Key / Token   （唯一有权限推送到远端受保护分支的凭据）                            │
└──────────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                                   │ (可选：联网时自动同步分支 + refs/notes/docaxioms)
                                                   ▼
                            [远端托管平台：极薄验签 Action (3s) + 禁强推 + Fast-forward]
```

### 2. 一次 `git push` 的完整数据流

1. **推送进入隔离区**：人或 Agent 执行 `git push`（加 `--no-verify` 结果完全相同）→ `git-remote-docaxioms` 将 pack 流发往 `docaxioms-gated` → 守护进程以 `_docaxioms` 身份在 `repos/my-repo.git` 运行 `git-receive-pack`，对象进入 quarantine 隔离区。
2. **`pre-receive` 不可变快照与治理判定**：
   - 读取 `<old-oid>`（基线 `B`）和 `<new-oid>`（候选提交 `C`、树 `T`）。首次接入无 `B` 时，强制要求附带 Owner 初始引导签名。
   - 计算 `Δ(B, T)` 是否触碰**治理白名单**（`docaxioms.json`、`docaxioms/**`、依赖锁、`owners.allowed_signers`、远端验签 workflow）：
     - **未触碰治理文件**：直接从基线 `B` 提取策略与受信任的 `projectChecks`；
     - **触碰了治理文件**：强制核验是否已提交针对 `(B, C, T)` 的 **Owner 物理硬件签名**（由人类此前在终端运行 `docaxioms approve` 触摸 YubiKey / Touch ID 写入 `refs/notes/docaxioms-approvals`），无合法 Owner 签名立即拒绝！通过后采用候选策略验收全树 `T`。
3. **沙箱化执行全套门禁与必需测试（G01–G22）**：
   - 将树 `T` 导出到 `/var/lib/docaxioms/work/<run-id>`（只读源码 + 隔离临时目录，Linux 下配 `bwrap --unshare-net`，macOS 下配 `sandbox-exec` 禁网），运行 `docaxioms check` 及策略登记的必需测试命令（G17）。任一必需项非 `pass`，`pre-receive` 非零退出，Git 自动清空 quarantine。
4. **后置原子签发本地 Attestation**：
   - `git-receive-pack` 退出 0（引用更新落盘）后，守护进程在释放仓库互斥锁前，用本机不可导出的闸门私钥对 DSSE/in-toto 声明 `(repo, B, C, T, policyDigest, checkerVersion, envDigest, checksSummary, timestamp)` 签名，写入 `refs/notes/docaxioms`（并追加一条哈希链记录到 `refs/docaxioms/rsl` 绑定前序分支头，防回滚）。
5. **转发或离线入队**：若配了远端且当前在线，用 `_docaxioms` 独占的 Deploy Key 将分支与 `refs/notes/docaxioms`、`refs/docaxioms/rsl` 一并推送至远端；离线则记入本地同步队列，恢复网络后自动重放。

### 3. 跨平台、单/多人、离线与远端关系

- **三大操作系统可行性**：
  - **macOS（高）**：`dscl` 创建 `_docaxioms` 隐藏服务用户 + `/Library/LaunchDaemons` 管理守护进程与 Unix Socket + System Keychain/Secure Enclave 存闸门密钥 + 用户会话 Touch ID / YubiKey 做 Owner 审批。
  - **Linux（高）**：`systemd`（`User=_docaxioms`、`ProtectSystem=strict`、`ProtectHome=true`）+ Unix Socket + `systemd-creds`（TPM2 密封密钥）+ OpenSSH `ed25519-sk` 审批。
  - **Windows（中，需原生辅助）**：Windows Service（`NT SERVICE\DocaxiomsGate`）+ CNG 不可导出密钥可行；**关键坑点**在于 Node.js `node:net` 创建 Named Pipe 时使用系统默认安全描述符（会向 Everyone/匿名或远程客户端暴露连接面，[Microsoft Named Pipe Security 文档](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)），必须通过小型原生辅助程序或 FFI 显式调用 `CreateNamedPipeW` 设置严格 SDDL DACL、`PIPE_REJECT_REMOTE_CLIENTS` 与 `FILE_FLAG_FIRST_PIPE_INSTANCE`。
- **离线可用性**：**完全离线可用**。断网飞机/内网环境下，所有门禁、G17 测试、Owner 硬件签名和分支保护均在本机生效。
- **单人 vs 多人仓库**：
  - **单人仓库**：本地闸门直接补齐了 GitHub 免费个人仓缺失的“独立执行 workflow”和“防 Agent 自批”两块短板。
  - **多人仓库**：每名成员本机运行闸门，项目在受治理保护的 `owners.allowed_signers` 与 `gates.allowed_signers` 中维护合法的 Owner 公钥与团队设备闸门公钥；多人并发汇合依赖远端仓库。
- **与远端的三种组合关系**：
  1. **纯本地无远端**：适合单机/内网项目，本地闸门 bare 仓即最终主干（配合定时异机备份）。
  2. **本地终审 + 远端“只验签”（强烈推荐）**：远端开启分支保护，**强制线性历史（Require linear history / Fast-forward only，禁止网页端生成无签名的 Merge Commit）**，CI 只跑一个 3 秒脚本：调用 `git notes --ref=docaxioms show $COMMIT` + `ssh-keygen -Y verify` 校验闸门签名、树哈希一致性及（若触碰治理白名单）Owner 签名。远端无需装 Node、无需跑业务测试，最终裁决权 100% 在本地！
  3. **本地终审 + 远端重跑兜底**：跨 OS 矩阵测试项目（如开发用 Mac、生产跑 Linux 内核特性），本地闸门守住文档与本机测试（A1），远端补充跨平台矩阵验证。

---

## 三、对现行《全流程文档系统方案》（485 行版）的逐节修改清单

| 现方案章节 | 现方案写法（远端中心） | 本地终审架构下的修改方案 |
|---|---|---|
| **第二节第 2 条：执行强度分层**（`L40-53`） | L1 Agent 钩子 → L2 `pre-push` → L3 远端必需检查 → L4 平台治理；本地被定性为“只能提前暴露问题” | 重排为：**L0 文本** → **L1 Agent 钩子 + `docaxioms-watch` 热缓存**（<5ms 提示）→ **L2 客户端 `pre-push --commit HEAD`** → **L3 本地跨用户闸门 `docaxioms-gated`**（`pre-receive` 读不可变树 + 隔离跑检 + 硬件密钥签发 `refs/notes` + 独占推送凭据，**新的主硬边界**）→ **L4 Owner 物理硬件签名 +（可选）远端极薄验签** |
| **第二节第 3 条：验收器契约**（`L68-85`） | 靠平台 Required Workflow 或 CODEOWNERS 防候选篡改 `.github/workflows/`；个人仓只能靠人工盯 diff（`L79-80`） | **结构性简化并消除了 GitHub `pull_request` 跑候选 workflow 的漏洞**：闸门 `pre-receive` 直接从 `<old-oid>` 读基线策略与受信任扩展；触碰治理白名单时，改为在闸门内强制校验 **Owner 离线硬件签名**（YubiKey / Touch ID）+ 候选策略验全树 `T`；推送凭据锁在 `_docaxioms` 内，候选代码与 Agent 进程完全接触不到 |
| **第二节第 4 条：G17 证据载体**（`L94, L124-128`） | 托管平台 Check Runs 或仓外 attestation；本地模式直接返回 `blocked` 或 `not-applicable`（`L127`） | 改为**由本地 `_docaxioms` 闸门在隔离环境中针对候选树 `T` 实跑验证，签发 in-toto/DSSE 证据存入 `refs/notes/docaxioms`**。既不改变候选树 `T` 的哈希，又随 Git 原生迁移和永久保存（消除平台日志 90/400 天过期问题），本地离线直接 `pass`/`fail` |
| **第二节第 4 条：G22 最终验收**（`L96, L102`） | 绑定托管平台 Ruleset 与 PR 审批事件 | **本地闸门即为 G22 终审器**：核验 G01–G21 适用项全绿 + 必需的离线签名授权（治理变更需 Owner 签名，多人互审可核验 `git-appraise` 式审查签名 note）；远端（若有）退化为 G22 签名的只读验签器 |
| **第三节：会话重启与中断恢复**（`L151-213`） | 每次启动从 Git 与任务页无状态核对，事件日志仅作可选简报参考 | **核心机制保持不变！** 明确写入：引入 `docaxioms-watch` 文件监听守护进程**不能**推翻“无状态核对”——因内核文件监听会合并/溢出丢事件且无命令退出码，绝不能升格为 G17 证据或写入阻断锁。守护进程只给钩子提供热缓存，而跨会话可信验证复用直接查 `refs/notes/docaxioms` 中已签名的提交证据 |
| **第七节：检查的自发性**（`L410-444`） | 强依赖远端 PR 触发与平台 Cron（受公共仓 60 天无活动停用困扰，`L423`） | ① 提交出境自发性由本地闸门 `pre-receive` 100% 强制拦截；② 定期审计提醒改为**本机 `launchd` / `systemd.timer` / 计划任务 + 每次经过闸门推送时顺带核算契约面累计变更量**，离线可用且彻底摆脱 GitHub 60 天停用 Cron 陷阱 |

---

## 四、本地方案根本守不住的，以及“本地门禁 + 远端只验签”能否补上（A6）

按严重度与物理边界如实声明：

1. **本机 `root` / `sudo` / Windows Administrator 提权**
   - **纯本地**：**守不住**。拥有最高系统权限的主体可以停止 `docaxioms-gated`、替换检查器代码、读取软件密钥或直接取出 `_docaxioms` 里的远端 Deploy Key。
   - **加“远端只验签”能否补上？** **只能补一半**：若闸门密钥在系统盘/TPM，root 可直接操纵闸门签发假通过证明骗过远端；**唯一能挡住静默伪造的是将关键签名绑定外部 FIDO2 硬件密钥（物理触摸）**——即便如此，恶意 root 仍可在人类触摸瞬间实施“所见非所签”掉包。因此**本机内核与管理员可信是所有本地方案的绝对信任根**。
2. **Owner 本人蓄意绕过或闭眼按指纹（橡皮图章）**
   - **纯本地**：**守不住**。Owner 握有 `sudo` 与硬件密钥。
   - **加“远端只验签”能否补上？** **单人仓库补不上**（按 A0，Owner 即最高权威，工具防的是 Agent 越权与人类手滑，防不了唯一所有者蓄意作弊）；**多人仓库能补上**——远端验签脚本可要求治理变更或合入同时具备 **≥2 个不同成员公钥的离线签名**（`gittuf` 阈值策略），任何单人（哪怕本机 root）无法伪造他人私钥签名。
3. **同一 OS 用户下运行闸门（未启用跨用户隔离的降级部署）**
   - **纯本地**：**完全守不住恶意或失控的 Agent Shell**。
   - **加“远端只验签”能否补上？** **同样补不上**——若签名私钥也在同一用户态且无需硬件触摸，Agent 可直接调用签名命令自签自推。因此必须明示：**同用户模式只防手滑，不防 Agent 越权**。
4. **直接通过托管平台网页编辑器 / API 修改远端分支**
   - **纯本地**：**完全感知不到、也拦不住**。
   - **加“远端只验签”能否补上？** **能补上（托管平台管理员强行关闭保护除外）**：远端将“验证 `refs/notes/docaxioms` 签名”设为分支保护必需检查后，网页端直接提交因没有本地闸门签名会被直接拒合；同时本地闸门在 `git fetch` 时可反向校验远端 `refs/docaxioms/rsl` 哈希链，一旦发现远端被管理员篡改或回滚立即本地报警（`gittuf` 双向校验机制）。
5. **多台开发机互信、密钥吊销与并发合并产生“未验新树”**
   - **纯本地**：机器 A 无法凭空知道机器 B 上的闸门是否运行了被篡改的旧版检查器（除非依赖硬件远程证明，工程成本极高）；更关键的是，**A 验过了提交 $C_A$，B 验过了提交 $C_B$，若远端直接将二者 Merge 成新树 $T_{AB}$，这棵合并树从未跑过任何检查（pin、断链、测试可能当场破裂）！**
   - **加“远端只验签”能否补上？** **只验签本身补不上合并语义冲突，必须配套“远端强制 Fast-forward only（线性历史）”**！即落后于远端的分支必须在开发者本地 `git fetch && git rebase`（或在本地完成 merge），在本地闸门对最终组合树 $T_{AB}$ **重新跑完检查并签发新签名**后，才能快进推上远端。密钥泄露则通过受 Owner 签名保护的 `allowed_signers` 轮换与吊销时间戳解决。

---

## 五、与公理（`AXIOMS.lock.md`）及既有决策（`AD-1..AD-7`）的合规核对

1. **锁定公理 A0–A8、M1–M4（AD-1）——零修改，且保障力增强**
   - **A0（权威与行为分离）**：用独立 `_docaxioms` 进程跑真实测试验证行为，用 Owner 硬件触摸签名确认规范意图，首次在单机把“Agent 的声称”与“Owner 的决定 + 代码实跑”做成了物理隔离。
   - **A1（证据有作用域）**：本地签发的 `refs/notes/docaxioms` 明确写入本机 `envDigest`（OS/架构/Node 版本/锁文件哈希），诚实声明“仅证明在该本地环境跑通”，不谎称覆盖其他 OS。
   - **A6 / A7（精确边界与注意力成本）**：常规推送由后台守护进程自动验收签名（0 次弹窗打扰），仅在修改治理白名单或 K2 授权时才要求 Owner 触摸一次硬件密钥，严守 A7。
2. **AD-2（`core/` 纯净可移植，`docs/decisions.md:8`、`test/check.test.mjs:353-356`）——完全合规**
   - 守护进程、IPC 协议、远程助手、密钥管理与平台配置全部位于 `core/` 之外；`core/` 的三份纯文本规范文件不出现任何守护进程、操作系统、Git 引用路径或硬件工具名称。
3. **AD-3 & AD-4（npm CLI 形态与纯 JS 轻量依赖，`docs/decisions.md:9-10`）——核心兼容，系统级组件需新增决策明确边界**
   - **纯 JS 可覆盖的部分**：闸门核心调度、Unix Domain Socket（`node:net`）、Ed25519/ECDSA 软签名与验签（`node:crypto`）、调用系统 `git`（`cat-file` / `receive-pack` / `notes`）和 `ssh-keygen -Y sign/verify`（支持 FIDO2 `ed25519-sk`）以及 `fs.watch` 热缓存，**100% 可用 Node >= 22 标准库纯 JS 实现，零原生编译依赖**。
   - **超出纯开发依赖 npm 包体验的部分**：① 创建系统账户 `_docaxioms` 并注册 `launchd`/`systemd`/Windows Service 需要一次性的管理员安装步骤（`sudo`）；② 若要在 macOS 直调 Secure Enclave CryptoKit（不经外部 FIDO2 key）或在 Windows 上给 Named Pipe 设置自定义 SDDL DACL，需要极薄的平台原生辅助程序（Swift 小工具 / Win32 小程序）。
   - **建议处理**：保持主包 `docaxioms` 严格遵守 AD-4（纯 JS、无特权即可跑 `check`/`pin`/`garden`）；把特权闸门拆为可选伴侣包（如 `@docaxioms/gate`），并由 Owner 新增一条决策（`AD-8`）授权该可选原生辅助层。
4. **AD-7（本仓库门禁升格条件，`docs/decisions.md:12`）——完全正交且互促**
   - 本地闸门加固的是“执行与防绕过通道”，不改变单条检查谓词的精度。本仓库自身仍只让满足 AD-7 条件的门禁在闸门中阻断（其余继续输出 report）；而在外部试验项目部署本地闸门后，`refs/notes/docaxioms` 自动沉淀每一次真实推送的审计记录，直接为 AD-7（≥10 次相关变更 + ≥3 条有效发现）提供防篡改实证。

---

## 六、可行性评级与待 Owner 决定的问题

### 1. 分项可行性评级

| 方案模块 | 评级 | 前提条件与主要风险 |
|---|---|---|
| 本地裸仓 `pre-receive` 验收不可变提交树 + 基线策略读取 | **完全可行** | 纯 Git 原生机制 + 引擎快照抽象重构 |
| `refs/notes/docaxioms` 离线签名证据（取代云端 G17/G22） | **完全可行** | 注意在 `post-receive` 落盘 note 以遵守 Git quarantine 限制；支持 OpenSSH `allowed_signers` |
| macOS / Linux 跨用户闸门（`_docaxioms` + Unix Socket + 独占推送凭据） | **可行（推荐）** | 首次接入需执行一次管理员级 `gate install` 配置系统服务与目录权限 |
| Windows 跨用户闸门（Windows Service + Named Pipe + CNG） | **有条件可行** | 需附带薄原生辅助程序设置 Named Pipe 严格 SDDL DACL，避免默认权限暴露本地签名接口 |
| FIDO2 硬件密钥（`ed25519-sk`）或 Touch ID 做治理变更物理审批 | **可行** | OpenSSH 8.2+ 原生支持 FIDO2；无硬件密钥时可退化为 `sudo` 交互授权口令 |
| 本地终审 + 远端 3 秒极薄验签 | **可行（最优组合）** | 远端受保护分支**必须开启线性历史（Fast-forward only）**，防止网页端产生未验签的合并提交 |
| `docaxioms-watch` 内存热缓存加速 Agent 钩子 | **完全可行** | 仅作缓存加速，不承担安全拦截与权威事件账本职责 |
| 用文件监听守护进程充当完整不可伪造的会话恢复/测试证据 | **不可行** | 三端内核文件监听均有合并/溢出丢包与语义盲区 |
| 同 OS 用户无特权隔离下防住带 Shell 的 Agent 绕过 | **不可行** | 同 UID 进程可改钩子、改引用、读用户态远端凭据 |

### 2. 需要 Owner 决定的问题清单

1. **本地隔离档位选择**：
   - **重装档（真硬门槛，推荐作目标形态）**：接受一次性的 `sudo` 系统服务安装，建立独立 `_docaxioms` 系统用户、本地 IPC 闸门与独占远端推送凭据；
   - **轻量档（防误操作，不防 Agent Shell 蓄意绕过）**：同用户下的本地闸门裸仓 + `pre-receive`（免 `sudo`，防 `--no-verify`，但同 UID 可绕过）。是否两档都提供？
2. **Owner 物理审批的认证方式**：修改治理白名单（`docaxioms.json`、`docaxioms/`、公钥名册）与公理时，优先采用 **FIDO2 硬件密钥（如 YubiKey `ed25519-sk`，跨平台最干净）**、**macOS Touch ID 原生小助手**，还是允许无硬件时退化为 **`sudo docaxioms approve`（靠系统管理员密码确认在场）**？
3. **远端的去留与职责**：采用**“本地终审 + 远端极薄验签（强制 Fast-forward 线性历史）”**，还是**“纯本地无远端”**，或是保留远端跨平台测试兜底？
4. **打包与 AD-4 边界（是否立项 AD-8）**：是否同意保持 `docaxioms` 主包为 100% 纯 JS CLI，将跨用户守护进程与（macOS SE / Windows Pipe ACL 所需的）微型系统桥接拆入独立的 `@docaxioms/gate` 包？
5. **跨平台支持优先级**：首期是否先做 **macOS + Linux（纯 Node `node:net` Unix Socket + OpenSSH/systemd/launchd 即可闭环）**，将需要额外 Win32 安全描述符处理的原生 Windows 服务列为第二阶段（Windows 用户首期走 WSL2）？

---

## 附：联网与仓库核实出处汇总

- **仓库源码与文档**：`README.md:50-66`、`core/AXIOMS.lock.md:9-30`、`core/GUIDE.md:29-69`、`docs/decisions.md:7-14`、`src/check.mjs:48-108, 258-678`、`src/manage.mjs:57-130`、`test/check.test.mjs:353-356`、`research/全流程文档系统方案.md:40-213, 410-485`。
- **Git 服务端钩子、隔离环境与远程助手**：[git-scm.com/docs/githooks](https://git-scm.com/docs/githooks) · [git-scm.com/docs/git-receive-pack](https://git-scm.com/docs/git-receive-pack) · [git-scm.com/docs/gitremote-helpers](https://git-scm.com/docs/gitremote-helpers) · [git-scm.com/docs/git-config (`safe.directory` / `gpg.format`)](https://git-scm.com/docs/git-config)
- **OS 服务隔离与硬件密钥存储**：[Apple CryptoKit `SecureEnclave`](https://developer.apple.com/documentation/cryptokit/secureenclave) · [systemd Credentials (`systemd-creds` / TPM2)](https://systemd.io/CREDENTIALS/) · [Microsoft CNG Key Storage](https://learn.microsoft.com/en-us/windows/win32/seccng/key-storage-and-retrieval) · [Microsoft Named Pipe Security & ACL](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)
- **文件监听与 Agent 沙箱边界**：[Node.js v22 `fs.watch` 文档](https://nodejs.org/api/fs.html#fswatchfilename-options-listener) · [Claude Code Security / Sandboxing](https://code.claude.com/docs/en/security)
- **同类去中心化闸门、审查与证明标准**：[OpenSSF `gittuf` (RSL & Local Verification)](https://gittuf.dev/) · [Google `git-appraise` (`refs/notes` 分布式审查)](https://github.com/google/git-appraise) · [in-toto Attestation Framework / DSSE](https://in-toto.io/)
