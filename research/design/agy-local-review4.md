# 《全流程文档系统方案》本地终审第四轮独立复审（agy-local-review4）

**总体结论：已无 P0 或 P1 级问题。** 第三轮两份复审（`agy-local-review3.md`、`codex-local-review3.md`）提出的核心修改均已落地，与 `core/AXIOMS.lock.md` 及 `docs/decisions.md`（AD-1..AD-7）无冲突。以下仅列出 4 项指定事实核实结论，以及改写后新露出的 **3 项 P2 与 1 项 P3** 细节收口建议；已正确吸收且无问题的部分不再复述。

---

## 一、本轮 4 项新写入事实与源码相容性核实

| 核实项 | 定稿位置 | 核实结论 | 出处与关键核验点 |
|---|---|---|---|
| 1. 单条 note 两段承载 + `ssh-keygen -Y verify` 调用方式 | `L124-125, L188` | **属实（切分边界可再收紧，见问题 4）** | `ssh-keygen -Y verify -f <allowed_signers> -I <principal> -n <namespace> -s <sig_file>` 从标准输入读取原始被签字节，完全无需重规范化 JSON；自定义 Statement 结构不声称兼容 in-toto Envelope 的定性也准确（[OpenBSD `ssh-keygen(1)`](https://man.openbsd.org/ssh-keygen.1#VERIFY)、[in-toto `envelope.md`](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md)） |
| 2. macOS `launch_activate_socket` 与目录权限退路 | `L98, L158, L583` | **完全属实** | `launch_activate_socket(name, &fds, &cnt)` 是 `<launch.h>` 领取 `launchd.plist` `Sockets` 预建描述符的官方 C 接口（调用后须 `free(fds)`）；不用原生代码时改由常驻进程自建套接字并靠父目录执行位守住组边界在 XNU 上成立（[Apple `launch_activate_socket` 文档](https://developer.apple.com/documentation/xpc/launch_activate_socket)） |
| 3. Windows 客户端最小权限 `CreateFile` + 随机挑战认证服务端 | `L160, L584` | **底层事实属实，但引入两处缺口（见问题 1）** | `libuv` 在 `src/win/pipe.c` 默认用 `GENERIC_READ \| GENERIC_WRITE` 调 `CreateFileW`，服务端去掉 `FILE_GENERIC_WRITE`（含 `0x0004` 创建管道实例权）后普通 Node 客户端确实无法建立双向连接，须原生辅助程序以 `FILE_READ_DATA \| FILE_WRITE_DATA \| SYNCHRONIZE` 打开（[libuv `src/win/pipe.c`](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c)、[Microsoft Named Pipe Security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)）。但挑战签名需加域分离，且漏了首实例标志限制 |
| 4. 旧决策表冻结为 `decisions/` 下 `legacy` 文件，是否与 `src/check.mjs` 和 `core/GUIDE.md` 相容 | `L612` | **与规范原则相容，引擎侧有 3 个待补接口（见问题 2）** | 不进 `history/` 避开了 `src/check.mjs:448-452` 强制加过期横幅的检查，契合 `core/GUIDE.md:25`（仍为权威的旧文档不标过时）与 `A5`；但放进 `decisions/` 后与 `L462` 单条目结构校验及 `src/check.mjs:485-507` 存在接口碰撞，需显式写明兼容规则 |

---

## 二、剩余问题清单（仅 P2–P3，按严重度排序）

### 1. 【P2｜新内部冲突 + 漏吸收】`L160` 闸门用自身密钥签“客户端随机挑战”未规定域分离（撞上 `L138` 签名预言机禁令），且漏写 `FILE_FLAG_FIRST_PIPE_INSTANCE` 仅限首实例
- **出处**：`research/全流程文档系统方案.md:160` vs `L124, L138`；`codex-local-review3.md:13`
- **问题**：
  1. **与 `L138` 冲突**：`L138` 规定闸门密钥绝不提供“签任意字节”，否则沦为签名工具；但 `L160` 写“连接后由闸门用它的密钥签一个客户端给出的随机挑战”。若与验收凭据共用同一把密钥且未做严格域分离，本机恶意客户端可把伪造的 Statement 字节当作“挑战”发进管道骗取合法凭据签名。
  2. **第三轮漏吸收**：`codex-local-review3.md:13` 指出 `FILE_FLAG_FIRST_PIPE_INSTANCE` 须限定只用于首个实例；Windows 命名管道每实例仅服务单连接，若闸门创建后续连接实例时仍传该标志，服务自身会报 `ERROR_ACCESS_DENIED`（[`CreateNamedPipeW`](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew)）。
- **修改建议**：① `L160` 明确握手签名必须绑定**独立专用 namespace**（如 `docaxioms-ipc-handshake@v1` ≠ `docaxioms-gate@v1`）并混入服务端固定前缀与服务端随机数（或使用独立传输密钥）；② 补上“`FILE_FLAG_FIRST_PIPE_INSTANCE` 仅在创建首个管道实例时使用”。

### 2. 【P2｜引擎与规范衔接缺口】`L612` 将旧决策表放进 `decisions/` 冻结，需补齐状态覆盖、目录校验豁免与旧 ID 兼容三条规则
- **出处**：`research/全流程文档系统方案.md:612` vs `L245, L451, L455, L462`、`src/check.mjs:150, 238-256, 311, 485-507`、`core/GUIDE.md:14`
- **问题**：
  1. **旧行被推翻后的状态冲突**：`legacy` 表被 G13 锁死原文后，表内旧决策的 `Status` 格永远写着 `active`。日后它在 `full` 模式下被新决策文件推翻、现行落地点移除了旧 ID 时，若沿用 `src/check.mjs:492-505` 读取表内 `active` 列，会误判落地点缺失报错；人类直读 `legacy` 表也会误以为它仍有效（M1）。
  2. **撞上 `L462` 条目目录校验**：`L462` 要求条目目录下“每个文件都要通过条目结构校验”，而多行表格 `legacy` 文件和生成的 `decisions/README.md` 均非单条决策结构。
  3. **旧 ID 与 `descriptionDocs` 隔离**：`L451` 改为 `<前缀><日期>-<slug>`，且现有 `descriptionDocs`（`src/check.mjs:238`）只跳过单一 `decisions.file`。
- **修改建议**：`L612`（及 `L462`）补明：① 切换日在 `legacy` 表头固定注明“表内状态仅为切换日快照，现行状态以 `decisions/README.md` 为准”，G11 以新决策记录的替代关系覆盖表内旧状态；② `decisions/` 目录校验显式接纳 `README.md` 与登记的 `legacy` 表，并将整个 `decisions/` 排除出 `descriptionDocs`；③ 引用解析同时识别新 ID 格式与 `legacy` 已登记的存量旧 ID。

### 3. 【P2｜信任根表述歧义】`L133`“凭据里带上验证它所需的授权材料”易被误实现为采信候选自带的公钥
- **出处**：`research/全流程文档系统方案.md:133` vs `L109, L188, L209`
- **问题**：若远端验签脚本直接使用候选 note 凭据内附带的公钥作为“验证所需的授权材料”，被攻破的单机即可自填公钥伪造 Owner 或其他成员批准。
- **修改建议**：将 `L133` 中“以及验证它所需的授权材料”改为“以及批准者身份标识（principal）；**远端验签所用的允许签名者公钥名单必须取自目标分支当前基线 `B`（或受保护的远端配置），绝不采信候选凭据自带的公钥**”。

### 4. 【P3｜两处细微措辞收紧】note 两段切分边界与 `L145` 预审复用条件
- **出处**：`research/全流程文档系统方案.md:125, 145`
- **修改建议**：
  1. **`L125`**：将“固定边界”具体化为“首行固定为单行无换行的规范化 UTF-8 JSON，首个 `\n` 之后为 SSHSIG 装甲块”（避免 JSON 字符串字面量内含签名头文本引发切分歧义），并校验 `-I` 身份不含前导 `-` 且属于允许名单。
  2. **`L145`**：前半句已把 `B` 列入预审复用相等条件（`B` 与 `T` 都不变时树差异本身未变），后半句“依赖 B→C 差异的规则按正式验收时的基线重新判定”在 `B` 必相等前提下形同虚设；若允许无 G12 批准的候选在 `B` 前进、`T` 未变时仅复用纯 `T` 检查与 G17 测试，宜将 `B` 从前半句的复用键移出，仅对 `B→C` 规则重算。
