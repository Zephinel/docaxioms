# 迭代方案“接入链”（3dd7cbe）复审

行号均指仓库副本 `rm/research/迭代方案.md`（提交 `3dd7cbe`）。将指南拆出 `core/` 由 `onboard --guide` 输出（遵守 AD-2）、不自动静默改写决策（遵守 A0）、把此改动定性为 `init` 契约变更并立新决策（第 726 行）及不扩大本仓库 AD-7 阻断面等部分均成立，以下只列查出的问题（按严重度 P0–P3 排序）。

---

## P0：开箱即败或可被零迁移绕过

### P0-1. 新项目 `init` 后跑 `onboard` 必然失败，第 743、746 行判据与第 758 行承诺及现行 `templates/` 直接冲突
- **出处**：第 `743, 746, 758` 行；连带第 `47, 88, 835-841` 行（对照 `templates/docaxioms.json:2-3, 11-13`、`src/check.mjs:145-154, 568`）。
- **问题**：第 758 行写“`init` 之后 `onboard` 应当直接通过，只剩建议”，但对照当前模板，新项目 `init` 后跑 `onboard` 至少会触发两项“未通过（退出 1）”：
  1. **第 746 行必败**：要求“名为 `AGENTS.md` 或 `CLAUDE.md` 的文件在预算范围内”，但 `templates/docaxioms.json:11-13` 的 `budgets` 只配了 `"AGENTS.md"`，**根本没配 `CLAUDE.md`**，所有新项目开箱即败；且 `"AGENTS.md"` 不匹配 `frontend/AGENTS.md`，若不改模板本身，接入完成后日常 `docaxioms check` 依然漏检子目录（缺陷 20 在日常 `check` 中并未修好）。
  2. **第 743 行必败**：要求“文件清单里不在 history、不在 ignore、也不在 `reachable` 范围内的 `.md`”判未通过。而 `templates/docaxioms.json:3` 的 `reachable` 是 `"^docs/"`，文件清单 `p.all`（`src/check.mjs:145`）里的**根目录 `AGENTS.md`、`CLAUDE.md`、`CURRENT.md`、`README.md` 以及 `docaxioms/*.md`（core 副本不在 `ignore` 里）全部不匹配 `^docs/`**；若把 `CLAUDE.md` 划进 `reachable`，`check` 的可达性门禁又会立即失败（没有任何入口用 Markdown 链接指向 `CLAUDE.md`）。此外已有项目常见的 `CHANGELOG.md`、`CONTRIBUTING.md`、`.github/*.md` 也会全数阻塞接入。
- **改法**：① 在第十节“第零批”明确同步修改 `templates/docaxioms.json`：`reachable` 改为 `"(^|/)docs/"`，`budgets` 默认覆盖 `["**/AGENTS.md", "**/CLAUDE.md"]`；② 第 743 行改为只检查“排除了 `core`、`entries`、`card.file`、入口桥接文件（如 `CLAUDE.md`）及白名单社区顶层文档之后，既不在 `reachable` 内也无法从 `entries` 到达的 `.md`”。

### P0-2. Agent 可不提取任何内容直接把 `*.project.md` 塞进 `history/` 并从入口链过去（或直接 `rm` 删除），让 `onboard` 零配置差异通过
- **出处**：第 `722, 733, 739-746, 750` 行（对照 `src/check.mjs:358, 549-570`、`src/markdown.mjs:52-63`、同文第 `332` 行）。
- **问题**：按当前判据，偷懒的 agent 不碰 `docaxioms.json`（“待 owner 确认”为空）就能走两条捷径在几秒内让 `onboard` 退出 0：
  1. **整包塞进 `history/` 并保留入口引用**：给 `AGENTS.project.md`、`CLAUDE.project.md` 头部加一行 `> Out of date` 直接移入 `docs/history/`，再照字面执行第 733 行“修好指向它的链接”，把 `AGENTS.md` 第一条必读改链到 `docs/history/AGENTS.project.md`，把 `CLAUDE.md` 留着悬空的 `@CLAUDE.project.md` 或改成 `@docs/history/CLAUDE.project.md`。因为 G07“必读路径不经过已退役文档”尚未实现（第 332 行），且 `check` 完全不解析 `CLAUDE.md` 的 `@...` 导入语法，`check` 与 `onboard` 全部绿灯，后续每次会话照旧把 `history` 里的旧全文当现行指令加载（违背 A3、M4 与 `core/GUIDE.md:55`）。
  2. **直接删除 `*.project.md`**：`onboard` 无状态（第 737 行），第 741 行只查“还有 `*.project.md` 不在 history 里”；若 agent 直接 `rm *.project.md`，磁盘上同样没有未归档的 `*.project.md`，原文被静默销毁而 `onboard` 照样通过（违背 A5）。
- **改法**：① 第 733 行改写明确：迁移完成后，**必须删掉** `AGENTS.md` 和 `CLAUDE.md` 中指向 `*.project.md` 的临时必读行/导入行，严禁改指 `history/`；② 第 741/745 行增加判据：任何现行文档及 `CLAUDE.md` 的 `@` 导入均不得指向 `*.project.md` 或 `history/` 下的文件（仅允许索引页链向 `history/README.md`），且 `CLAUDE.md` 中的每个 `@path` 必须指向存在的现行文件；③ 在 Git 仓库中对照 `HEAD` 校验：凡 `HEAD` 中存在而被模板替换的同名文件，`history/` 下必须存在对应的归档记录，防止直接删除。

---

## P1：真实场景下报错、撞名覆盖、判据自相矛盾或破坏原子性

### P1-1. 将 `docs/history/README.md` 原地改名为 `docs/history/README.project.md` 会同时绕过 `onboard`、打爆 `check`，并与退役后的 `docs/README.project.md` 路径撞名
- **出处**：第 `721, 733, 741` 行（对照 `src/check.mjs:538-541, 663-675`）。
- **问题**：第 721 行把 `history/README.md` 列入原地改名的 8 个文件：
  1. 它改名后为 `docs/history/README.project.md`，**本来就在 `history` 目录内**，第 741 行“还有 `*.project.md` 不在 history 里”完全漏检；
  2. 改名后文件名不再以 `/README.md` 结尾，立刻失去 `src/check.mjs:538` 的横幅豁免而报错；
  3. 当项目的 `docs/README.project.md` 退役移入 `docs/history/` 时，落点也是 **`docs/history/README.project.md`**，直接撞名覆盖！若项目 `docs/history/` 原先在基线分支上已有同名文件（如 `plan.md`），移入覆盖还会触发 G13 历史不可改写门禁失败。
- **改法**：① `history/README.md` 不做原地改名（已有时保留原文件，或移到 `docs/history-README.project.md`）；② 规定 `*.project.md` 移入 `history/` 时保留原相对目录（如 `docs/history/onboarding/docs/README.project.md`）或遇同名加前缀，禁止覆盖 `history/` 中已有文件。

### P1-2. `codeExtensions` 同时出现在“未通过”和“建议”，且“待 owner 确认”把收紧配置与放宽规则混为一谈
- **出处**：第 `744, 748, 750` 行。
- **问题**：
  1. 第 744 行把“仓库里有某种扩展名的代码而 `codeExtensions` 和 `ignore` 里都没有”设为**未通过（退出 1）**，第 748 行又把推断 `codeExtensions` 列在**建议（不影响退出码）**，前后矛盾；且引擎没有内置“哪些扩展名算代码”的精确集合，遇到 `.sh`、`.sql`、`.css` 或单文件辅助脚本会逼 agent 乱加 `ignore`（违反 A7、M2）。
  2. 第 750 行输出“当前 profile 与模板 profile 的**全部差异**”，导致 agent 按要求补全 `codeExtensions`、`commands`、`pathPrefixes`（收紧检查）时，也会跟删预算、加 `ignore`、加 `*Exempt`（放宽检查）混在同一栏里刷屏，稀释真正的防放水信号（A7）。
- **改法**：① 删掉第 744 行的未通过项，统一归入第 748 行“建议”（仅当用户配了 `codeExtensions` 却匹配 0 个源码文件时按缺陷 11 打 `note`）；② 第 750 行按方向拆成两栏：只把**相对模板放宽或豁免**的差异（删/调大 `budgets` 或 `card`、收窄 `reachable`、新增 `ignore` / `*Exempt`）列进“待 owner 确认”，把新增 `codeExtensions`/`commands`/`pathPrefixes` 列为“已启用的项目配置”。

### P1-3. 已有项目“只有 `CLAUDE.md` 无 `AGENTS.md`”、“`CLAUDE.md` 已是 `@AGENTS.md`”或“不用 Claude Code”三类常见场景出错
- **出处**：第 `721-722, 745` 行（对照第 `584` 行）。
- **问题**：
  1. 许多已有项目只有长篇 `CLAUDE.md` 而无 `AGENTS.md`。按第 722 行，`init` 只在新 `CLAUDE.md` 里写 `@CLAUDE.project.md`，新 `AGENTS.md` 里不提 `CLAUDE.project.md`——若用 Codex CLI、Cursor、Gemini CLI 等只读 `AGENTS.md` 的工具跑接入，入口根本读不到 `CLAUDE.project.md` 的原有约束。
  2. 若项目原有的 `CLAUDE.md` 本就只有一行 `@AGENTS.md`，仍改名为 `CLAUDE.project.md` 会造成重复导入和无意义的归档噪音。
  3. 不用 Claude Code 的项目若删掉 `CLAUDE.md`，会被第 745 行“`CLAUDE.md` 没有导入 `AGENTS.md`”判未通过，与第六节第 2 条（第 584 行：按所用产品决定是否保留桥接）冲突。
- **改法**：① 只要产生了 `CLAUDE.project.md`，也在新 `AGENTS.md` 的临时必读项里一并列出；② 原 `CLAUDE.md` 去除空白后已是 `@AGENTS.md` 时直接保留，不生成 `CLAUDE.project.md`；③ 第 745 行改为“**若仓库存在** `CLAUDE.md`，则必须导入 `AGENTS.md`”。

### P1-4. `init` 预检漏掉悬空符号链接、父目录软链、目录撞名与大小写不敏感文件系统
- **出处**：第 `721, 724, 837` 行（对照 `src/manage.mjs:85-103`、`src/check.mjs:56`）。
- **问题**：
  1. `src/manage.mjs:94` 现用 `existsSync` 边遍历边写盘：而**悬空符号链接**的 `existsSync` 为 `false`，`init` 识别不出它是软链；若 `docs` 或 `docs/history` 父目录本身是软链（可指向仓外），或某个同名路径是目录（如 `CURRENT.md/`），边改边写会在半途抛错留下半成品工作树。
  2. 在 macOS（默认 APFS）和 Windows（NTFS）大小写不敏感文件系统上，若项目原有 `agents.md` 或 `frontend/agents.md`：`existsSync("AGENTS.md")` 返回 `true`，但 Git 索引与默认区分大小写的 `picomatch("**/AGENTS.md")`（`src/check.mjs:56`）按大小写匹配，会导致改名与 Git 跟踪错位，或 `frontend/agents.md` 漏过第 746 行的预算检查。
- **改法**：规定 `init` 先用 `lstatSync` + `readdirSync` 做全量只读预检（检查 `docaxioms/`、`docaxioms.json`、`docs`、`docs/history` 及全部模板目标：含悬空软链在内的任意软链、父路径非真实目录、目标为目录、`*.project.md` 已存在、大小写不同但同名的文件一律整批拒绝，未通过前零写入）；`onboard` 第 745–746 行对 `AGENTS.md` / `CLAUDE.md` 按大小写不敏感匹配文件名。

---

## P2：跨章节矛盾、源码契约冲突与漏列待决项

### P2-1. 第十二节第 23 项建议“记在决策表，引用检查能核对编号”与现行决策落点门禁（缺陷 9）冲突
- **出处**：第 `955` 行（对照第 `77` 行、`src/check.mjs:589, 596`、`core/GUIDE.md:54`）。
- **问题**：第一批修复已锁死 active 决策必须有 `landing`、落点**必须是 Markdown 文档**且该段落提及决策编号；放宽 `docaxioms.json` 时不能把 `docaxioms.json` 填成落点，JSON 也无法写注释引用编号；且即便在某篇 `.md` 提了编号，`onboard` 也无法机械判断 `docaxioms.json` 里是否又多塞了未授权的新豁免。
- **改法**：第 955 行补明：若记入决策表，落点须指向说明该豁免边界的 Markdown 段落（如 `AGENTS.md` 或 `docs/README.md`），同时 `onboard` 仍照常列出全部放宽项供人比对（或在 `x-onboard` 记录已确认的放宽摘要）。

### P2-2. 第 733 行过渡文件退役漏写“改写自身相对出链”，与第四节第 7 条不一致
- **出处**：第 `733` 行（对照第 `496, 708` 行、`src/check.mjs:361`）。
- **问题**：根目录的 `AGENTS.project.md` 原地改名时相对链接不断（第 721 行），但第 733 行移入 `docs/history/` 后目录深度变了两层，其内部原有的相对链接（如 `docs/arch.md`）全部失效，而 `check` 不扫描 `history/` 内文档的出链。第 733 行只写“修好指向它的链接”，漏掉了第 496 行要求的“迁移文件自身的相对链接和相对 pin 一起改写”。
- **改法**：第 733 行改为“改写它自身的相对出链与相对 pin，删掉入口文件里指向它的临时链接/导入，其余入链按第四节第 7 条处理”。

### P2-3. 第十节“缩短必读链”在第零批与第二批重复排期，且需写明保留 GUIDE 链接以免撞第 745 行
- **出处**：第 `840` 行 vs 第 `862` 行；连带第 `745, 933` 行。
- **问题**：第 840 行已将“第二批第 6 项（缩短必读链）”提前到第零批，但第 862 行仍保留了“先改模板……”的原完整条目（未像第 875 行那样改写剩余范围）；另外若将来按第 862/933 行把 GUIDE 完全移入按需 `SKILL.md` 而从 `AGENTS.md` 拿掉链接，会直接撞上第 745 行“`AGENTS.md` 没有链到规范副本里的 GUIDE”。
- **改法**：第 840 行写明“改 `templates/AGENTS.md` 为按需读 GUIDE，但保留指向 `AXIOMS.lock.md` 和 `GUIDE.md` 的链接”；第 862 行收窄为“可选按需 `SKILL.md` 与拆字典的 A/B 实测”。

### P2-4. 第 87、725 行对“接入基线”的表述易误导，且第 723 行漏了嵌套 `CLAUDE.md`
- **出处**：第 `87, 716, 723, 725` 行（对照 `src/check.mjs:298-316, 549-570`）。
- **问题**：
  1. 已有项目若有 `docs/README.md`、`docs/plan.md` 等，`init` 改名产生的 `docs/*.project.md` 因无入口链接且不被 `descriptionDocs` 排除，紧接着跑 `check` 仍会报 `reachable` 失败及路径/决策号失败，并非“`init` 完 `check` 即通过”；应写明基线指的是“入口已切到模板且不丢原文”，`check` 要等 `*.project.md` 退役后才通过。
  2. 第 723 行只规定了嵌套 `frontend/AGENTS.md` 不动，漏了已有项目里的嵌套 `frontend/CLAUDE.md`（若不处理，第 745 行是否要求它也导入 `frontend/AGENTS.md` 未定义）。
- **改法**：第 725 行澄清 `docs/*.project.md` 在退役前仍会被 `check` 报未可达；第 723 行补上嵌套 `CLAUDE.md` 的规则。

### P2-5. 第十二节漏列的 2 项待 owner 决定问题
- **出处**：第 `953-956` 行之后。
- **问题与改法**：建议补入两项待决：
  1. **顶层非 `docs/` 文档的默认归属**：已有仓库普遍存在的 `README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`.github/*.md` 在 `onboard` 覆盖缺口（第 743 行）中是默认豁免、要求从 `entries` 可达，还是只管 `docs/` 与入口文件；
  2. **不用 Claude Code 的项目是否允许 `init` 不生成或事后删除 `CLAUDE.md`**（衔接第六节适配器与第 745–746 行判据）。

---

## P3：措辞与可用性小修

### P3-1. `<名字>.project.md` 命名规则建议写清去后缀方式
- **出处**：第 `47, 721, 959` 行。
- **问题与改法**：`<名字>.project.md` 字面易被误读成 `AGENTS.md.project.md`；建议在第 721 行首次定义处写为“把 `.md` 后缀换成 `.project.md`（如 `AGENTS.md` → `AGENTS.project.md`）”。

### P3-2. 已有项目自带 `docaxioms/` 业务目录时无法 `init`
- **出处**：第 `721, 724` 行（对照 `src/manage.mjs:12, 87`）。
- **问题与改法**：`check` 和 `update` 均支持自定义 `core.dir`，唯独 `init` 写死 `docaxioms/` 并在撞名时拒绝；建议 `init` 支持 `--core-dir <dir>` 或在第 724 行写明该边界。
