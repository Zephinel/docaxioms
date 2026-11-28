# 《全流程文档系统方案》本地终审第三轮独立复审（agy-local-review3）

复审基线：独立核对 `research/全流程文档系统方案.md`（当前 622 行版）、第二轮两份复审（`agy-local-review2.md`、`codex-local-review2.md`）、`core/AXIOMS.lock.md`、`core/GUIDE.md`、`docs/decisions.md`（AD-1..AD-7）及 `src/check.mjs`，并逐条联网核实本轮新写入的技术事实。

**总体结论：已无 P0 或 P1 级问题。** 第二轮两份复审指出的核心漏洞（`git archive` 过滤绕过、DSSE 与 `ssh-keygen -Y` 不兼容、`refs/for/*` 待审合同、治理文件误伤业务锁文件、OpenSSH `sk` 标志行为、细粒度 PAT 边界等）均已被准确吸收，且与公理 A0–A8、M1–M4 及 AD-1..AD-7 无冲突。以下仅列出核实结果及剩余 5 项 **P2–P3 级**接口与边界收尾项，无问题部分不再复述。

---

## 一、本轮 6 项新写入事实的联网核实结论

| 核实项 | 定稿位置 | 核实结论 | 官方出处与核验要点 |
|---|---|---|---|
| 1. in-toto Statement 用固定 namespace 的 SSHSIG 分离签名替代 DSSE；`ssh-keygen -Y verify` 直接验 notes | `L124, L131, L186` | **规范兼容；单 note 验签需补拆分细节（见问题 2）** | in-toto ITE-5 明确允许非 DSSE 封装，只要具备域分离（SSHSIG `-n` namespace 等价于 `payloadType`）且**验签端不重做 JSON 规范化**（[in-toto `envelope.md`](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md)、[`statement.md`](https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md)）；但 `ssh-keygen -Y verify` 只支持分离签名（需 `-s` 签名文件 + stdin 原始字节 + `-I` 身份），单 blob note 读取后需先切分（[OpenBSD `ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1#VERIFY)、[Git `git-notes`](https://git-scm.com/docs/git-notes)） |
| 2. `ls-tree -r -z` 加 `cat-file --batch` 逐对象导出 | `L105` | **属实（需补 `100755` 权限位，见问题 4）** | 完全绕开 `.gitattributes` 过滤与符号链接还原；注意区分 `100644`、`100755`（可执行脚本）、`120000`（symlink）与 `160000`（submodule commit）（[Git `git-ls-tree`](https://git-scm.com/docs/git-ls-tree)、[`git-cat-file`](https://git-scm.com/docs/git-cat-file)） |
| 3. Node `node:net` 不暴露 `SO_PEERCRED` / `getpeereid`，及 macOS 目录权限退路 | `L98, L156, L579` | **属实（但与 `launchd` `Sockets` 互斥，见问题 3）** | Node `node:net` 未暴露对端凭证与 `launch_activate_socket`（[Node.js `net` 文档](https://nodejs.org/api/net.html)）；macOS（XNU/BSD）对 `0750` 父目录在 `connect(2)` 路径解析阶段强制校验搜索位 `+x`，非组成员直接 `EACCES`（[BSD/macOS `unix(4)`](https://man.freebsd.org/cgi/man.cgi?query=unix&sektion=4)） |
| 4. `FILE_FLAG_FIRST_PIPE_INSTANCE` 仅使后启动服务失败 + 客户端认证服务端 | `L158` | **属实（建议点明握手验签，见问题 5）** | 攻击者抢先建同名管道时该标志只让闸门创建失败，挡不住客户端连上假管道；Windows 下靠 PID 验服务端有竞态与权限限制，宜用应用层公钥挑战签名（[`CreateNamedPipeW`](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew)、[Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)） |
| 5. GitHub fine-grained PAT 没有分支范围 | `L195` | **完全属实** | 细粒度 PAT 的 `Contents: Read and write` 最小粒度为仓库级，无分支过滤项（[GitHub Fine-grained PAT 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)） |
| 6. 顺带核实：OpenSSH `10.6p2` 版本与 `sk` 验签行为 | `L148` | **属实** | OpenSSH `10.6p2` 已于 2026-11-05 发布（[OpenSSH Releases](https://www.openssh.com/releasenotes.html)），其 `ssh-keygen -Y verify` 确实仅记录 `sk_flags` 而不拒绝 `UP=0` |

---

## 二、剩余待收口问题（仅 P2–P3，按严重度排序）

### 1. 【P2｜跨节接口矛盾】`L127, L131` 凭据只存“批准记录摘要”，导致 `L186` 远端薄验签与 `L207` 多人验签拿不到批准签名本体
- **出处**：`research/全流程文档系统方案.md:127, 131` vs `L156, L186, L207`
- **问题**：写进 `refs/notes/docaxioms` 的验收凭据由闸门密钥签发（首版为软件密钥，`L156`，无硬件 `UP` 标志）；真正带 `ed25519-sk` 用户在场标志的是 Owner 的 G12 批准签名（`L144`）。但 `L127` 在凭据里只放了“批准记录摘要”（原文留在闸门本地证据库，`L132`），导致 `L186` 第 3 步“远端核验 notes 里的凭据，再检查批准签名的用户在场标志”以及 `L207`“要求治理变更有多个不同成员的签名”在远端/他机因缺少批准原文与签名本体而无法执行。
- **修改建议**：`L127, L131` 明确——凡触发 G12（或多成员批准）的提交，将**批准载荷原文及其 `ed25519-sk` 签名本体**（仅约 1 KB）一并内嵌进同步凭据（或同步 `refs/notes/docaxioms-approvals`），而非仅存摘要。

### 2. 【P2｜协议落地细节】单 blob `git notes` 需约定字节切分方式才能喂给 `ssh-keygen -Y verify`，且验签端严禁重做 JSON 规范化
- **出处**：`research/全流程文档系统方案.md:124, 131, 186`
- **问题**：① 单个 Git note 是一个 blob，而 `ssh-keygen -Y verify` 没有内嵌签名模式，必须分别传入 `-s <签名文件>`、`-I <白名单内的身份>` 和标准输入上的原始载荷字节；② `L124` 写“JSON 规范化后用 SSHSIG 做分离签名”，须防实现者在验签端误写成“先解析 JSON 再重新规范化后验签”（违背 in-toto ITE-5 与 `L124` 后半句“消费被签的那份字节”）。
- **修改建议**：`L124` 补充说明：JSON 规范化仅在**签发前**执行一次；note 内容按固定边界封装“原始被签 UTF-8 字节 + 分离的 `SSHSIG` 装甲块”（或分存两个 notes ref），验签脚本直接切出原始字节流送入 `ssh-keygen -Y verify` 标准输入并校验 `-I` 身份。

### 3. 【P2｜平台配置互斥】macOS 的“无原生代码目录权限退路”（`L98`）不能与 `launchd` `Sockets`（`L156`）同时使用；`L579` 漏标原生桥接前提
- **出处**：`research/全流程文档系统方案.md:98` vs `L156, L579`
- **问题**：在 macOS `launchd.plist` 中配置 `Sockets`（`L156`）后，套接字由 `launchd` 预创建，守护进程必须调 C API `launch_activate_socket()` 领取句柄；若走 `L98` 不带原生代码的纯 JS 退路，Node 既拿不到该句柄，自行 `listen()` 同路径还会报 `EADDRINUSE`。同时 `L579` 可行性表未像 `L580`（Windows）那样注明主方案（`getpeereid` / `SO_PEERCRED`）需要极薄原生桥接。
- **修改建议**：① `L98/L156` 注明：纯 JS 退路下，macOS 守护进程改用常驻自建受 `0750` 目录保护的套接字，不配 `launchd` `Sockets`；② `L579` 条件栏补上“核验对端 UID 需极薄原生桥接（或退回目录组权限）”。

### 4. 【P2｜导出权限与旧表归档冲突】`cat-file --batch` 漏提保留 `100755` 可执行位；旧决策表整表转 `history` 会触发过时横幅冲突
- **出处**：`research/全流程文档系统方案.md:105`；`L608` vs `core/GUIDE.md:25`、`src/check.mjs:448-452`
- **问题**：
  1. **`L105`**：若把所有普通文件统一按无执行权限写出，候选仓库内 mode `100755` 的测试脚本在运行器里会因 `Permission denied` 失败；须按 `100644 → 0o444`、`100755 → 0o555` 保留可执行位。
  2. **`L608`**：现有引擎 `src/check.mjs:449` 强制要求 `history/` 下所有文件（除 `README.md`）顶部必须带 `Out of date` 横幅。把仍含生效（`active`）决策的旧 `decisions.md` 移入 `history/`，要么改旧文件加“已过时”横幅（违背 `L608`“旧内容不改写”且误标现行有效规范，撞上 `core/GUIDE.md:25`），要么门禁直接报错。
- **修改建议**：① `L105` 补上保留 `100755` 只读可执行位；② `L608` 改为将旧决策表冻结在 `docs/decisions/legacy.md`（由 G13 锁死原文，不放进 `history/`），或为迁入 `history/` 的封存决策账本显式豁免过时横幅。

### 5. 【P3｜两处小收尾】Windows 客户端认证服务端的具体机制与第五节生命周期表的无闸门说明
- **出处**：`research/全流程文档系统方案.md:158`；`L416` vs `L500-503`
- **修改建议**：
  1. **`L158`**：点明客户端认证服务端无需依赖不可靠的服务端 PID 查询，直接利用系统只读目录下的闸门公钥做连接握手签名验证（或核验返回的签名凭据）即可。
  2. **`L490-503`**：在第五节第 4 条生命周期表前补半句“未配本地闸门的项目，预审、审查与推送阶段退回本地 `check` 加远端 PR 流程”，与 `L416` 的解耦声明完全对齐。
