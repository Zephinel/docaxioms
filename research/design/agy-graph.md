# 用图论组织 docaxioms 文档并沿依赖传播：设计答复

基于 `main` 当前实现（`src/check.mjs`、`src/pins.mjs`、`src/markdown.mjs`、`core/GUIDE.md`、`core/AXIOMS.lock.md`）与 `research/全流程文档系统方案.md` 逐项回答。

---

## 1. 技术可行性与“自动找文件 / 自动更新”的边界

**结论：可行，但图不是“单根文档树”，而是“多根、带边类型的有向无环图（multi-rooted typed DAG）”。**

首先要拆开 owner 设想里混在一起的一件事：按 `core/GUIDE.md:11-38`（M1、M3），项目里**不存在唯一一份“最基础的文档”**，事实至少有三类独立源头（图的根）：
1. **源码与测试**：拥有“软件现在怎么做”的事实（A0），向下游驱动 K3 描述与生成配置；
2. **Owner 决策（K2）**：拥有规范与取舍理由（A0、A8），驱动落地段落（`landing`）与决策索引；
3. **计划 / 任务项（K4）**：拥有工作状态（M1），驱动开放 `research/`、阶段卡 `CURRENT.md` 与 `history/` 归档（A5）。

因此，当“某个阶段或任务完成”时，如果只改 K4 任务页（或 `plan.md`），工具**不可能**单靠它推出哪些 K3 设计文档该怎么改——K3 依赖的是代码和决策变更，不是任务状态变更（A0）。但工具可以把同一批提交里的**代码 diff + 决策变更 + 任务关闭**同时作为起点，在同一张图上遍历。

### “自动找到相关文件”的程度与边界
- **精确命中（对已登记边零漏报）**：凡有显式依赖边（code pin、文档段落 pin、决策 `landing`、`research -> items`、生成器输入）或断链反向引用的下游文件与行号，可 100% 精确找到，并按拓扑序排列复核顺序。
- **启发式召回（有误报、有漏报）**：靠 `codeToDocs`（glob 映射）只能给出文件级候选提醒。
- **硬边界（不可行区，A0、A6）**：**未建边的隐式语义耦合**（例如改了某返回值的业务含义，另一篇文档用散文提过但既无 pin 也未配 `codeToDocs`），任何图算法都找不到；发现漏边仍需周期性 `garden` 只读审计（`core/GUIDE.md:48`）。

### “自动更新”的程度与边界（对齐 A0、A4、A5 与方案第七节第 3 条）
1. **全自动重算落盘（确定性生成物，A4、G20）**：索引（如 `decisions/README.md`）、各产品入口桥接与钩子配置、允许签名者名单、计数/状态表、内嵌生成块。源头一变即可重算覆盖，`check` 校验磁盘内容等于重算输出。
2. **显式触发的机械改写（脚手架命令，M1、A5）**：
   - 内容哈希未变时的行号/锚点平移（`docaxioms pin --relocate`，`src/pins.mjs:302-321`）；
   - 任务关闭或文档退役时的结构迁移：移入 `history/`、补齐过期横幅、批量重写仓内指向旧路径的链接目标（`src/check.mjs:645-678` 已允许 `history` 仅更新链接目标）。
3. **禁止自动改写并视为正确（散文与规范，A0、A6）**：K3 行为描述、K2 规范条文、`CURRENT.md` 的焦点判断**不能静默自动改写**。工具的边界是输出按拓扑序排列的“上游 diff + 下游待审段落”清单（可交给 Agent 起草候选补丁），但必须经人或 Agent 核对后通过显式动作（`pin --write` 或人工审批）确认。

---

## 2. 边的来源、精度与维护成本

注意方向：文档内写引用/pin 是“下游指向源头”，图引擎在内存中将其**反向索引**为 `源头 -> 下游` 的传播边。

| 边的来源 | 图中的语义 | 精度 | 维护成本 | 适用定位 |
|---|---|---|---|---|
| **显式文档 pin**<br>`<!-- pin: docs/a.md#sec@hash -->` | 段落级内容依赖（A2） | **高**（精确到锚点切片哈希） | **中**（建边手写一次，上游变后需 `pin --write`；滥用则高） | **硬门禁（gate）**；仅用于违反 M3 会带来高阅读成本、确需保留的摘要或派生规则 |
| **结构契约边**<br>决策 `landing`、`research -> items`、G20 输入 | 授权落点、生命周期绑定、生成依赖 | **高**（规则已定死） | **零增量**（现行规范已要求填写） | **硬门禁（gate）** + 关闭/推翻时的精确待办提取 |
| **代码 pin**<br>`<!-- pin: src/x.js#L1-L9@hash -->` | 代码片段 $\rightarrow$ 文档段落（A2） | **高**；共享重叠行段的文档还可推导“共变提示”（中） | **中**（无关行插入引发位移，已由 `--relocate` 吸收） | 直接边做 **gate**（已有）；共变推导做按需提示（且常提示违反了 M3） |
| **`codeToDocs` / G16**<br>代码 glob $\rightarrow$ 文档 | 粗粒度模块覆盖映射 | **低–中**（修注释、内部重构都会触发；现行 `check.mjs:713` 只要文档动过一字即消警） | **低**（配置一次，目录重组时改） | **审查辅助（aid）**；仅对显式受管契约路径配处置登记后才升为 G16 |
| **普通 Markdown 链接**<br>`[text](target#anchor)` | 可达性（A3）与存在性（A2） | 作断链/改名定位：**极高**；<br>作内容变脏推断：**极低** | **零增量** | **绝不能作内容变脏边**（按 M3，下游正是为了不复述才用链接；`README` 链全仓，拿链接传脏会淹没全图，违背 A7）；仅作可达性、断链门禁和路径迁移反向索引 |

---

## 3. 与现有机制及方案 G16 / G20 的合并（避免第二套平行机制）

核心做法：**不新增第二套配置文件、不造新注释语法、不拆平行检查器**，在 `project()`（`src/check.mjs:93`）之上构建单一带类型边表，所有旧检查与新传播共用同一底座：

1. **文档 pin 直接并入 `src/pins.mjs`（合并到 G09）**：
   - 代码核实：`src/pins.mjs:20,31` 当前实际上已经能整文件或按 `#L` 行号 pin `.md` 文件，只是第 31 行 `if (rawPath.includes("#")) return { ... malformed: true }` 拦截了非 `#L` 的标题锚点。
   - 合并方式：把 `PIN_PATTERN` 扩充为支持 `.md` 目标的 `#<anchor>`（直接调用 `src/markdown.mjs:150` 现成的 `p.passage(file, anchor)` 取章节或 `<a id>` 块），把检查名从 `"code pins match the current source"` 泛化为 `"pins match their source"`，CLI 继续用 `docaxioms pin [--write | --relocate]`。一套代码同时管住“代码 $\rightarrow$ 文档”与“文档 $\rightarrow$ 文档”。
2. **导航图与依赖图同源异边，互不串味**：
   - `link` 边（来自 `p.links(file)`）只喂给 `links and anchors resolve`、`reachability`（`src/check.mjs:549`）及退役改链工具；
   - `pin` 边 + `decision` 落点边 + `research` 任务边 + `generator` 边构成**有向依赖子图**，负责阻断门禁与拓扑序影响分析。
3. **`codeToDocs` 与方案 G16 合并为同一配置项的两档**：
   - 不另起炉灶建 G16 表。`codeToDocs` 即粗粒度覆盖边：默认 `level: "aid"`；若某条映射代表对外契约面（方案 `research/全流程文档系统方案.md:508,621`），在该条目上声明需处置登记（更新对应文档，或在候选说明/记录中显式标记“行为未变无需改文档”），即为 G16。
4. **方案 G20 并入图的“确定性计算节点”**：
   - 在 `docaxioms.json` 中登记生成物（或内联生成块）及其生成器/输入源。图遍历到此类节点时，`docaxioms generate`（或构建步）按拓扑序直接重算写入，`docaxioms check` 只做纯对比（重算结果 === 现存字节），并统一把纯生成文件从散文类检查与 `garden` 中排除（修补方案第 396 行指出的现存缺口）。

---

## 4. 失败模式、误报来源（A7）与控制手段

1. **【最隐蔽的缺陷】提前截断（early cutoff）被 pin 注释自身破坏，引发级联雪崩**
   - **复现**：设 `A -> B -> C`（`B` 的小节内含 `<!-- pin: A#x@h1 -->`，`C` 含 `<!-- pin: B#y@h2 -->`）。`A#x` 改动后，作者复核 `B#y` 认为散文仍准确、无需改字，于是运行 `pin --write --file B` 把 `h1` 更新为 `h1'`。若照搬 `src/pins.mjs:77` 对原始切片做哈希，**刷新 `B` 里的注释哈希 `h1 -> h1'` 本身就改变了 `B#y` 的字节，导致 `h2` 立即失配，强迫级联刷新 `C` 乃至全图**，early cutoff 彻底失效。
   - **控制**：计算 Markdown 锚点切片哈希时，**先剔除其中的 `<!-- pin: ... -->` 注释区间**（直接复用 `src/markdown.mjs:93` 已解析出的 `htmlComments` 偏移），并归一化 `\r\n` 与首尾空行。这样只要 `B#y` 的可见内容没改，刷新它自己的上游 pin 绝不改变它对外的哈希，`C` 天然静默截断，连额外缓存状态都不需要。
2. **章节嵌套过粗导致无关子节改动误报**
   - **来源**：`src/markdown.mjs:46` 中 `## 父节` 的 `section.text` 一直延伸到下一个同级或更高标题，包含底下所有 `### 子节`。pin 在大节上会被无关子节改动频繁打断。
   - **控制**：① 规范要求 pin 尽量指向叶子小节；② 充分利用 `src/markdown.mjs:68-82` **已支持**的 `<a id="...">` 块级锚点——它只截取最近的封闭段落、列表项或表格行，粒度可精细到单段或单行表格。
3. **标题改名导致的锚点断裂与静默漂移**
   - **来源**：Markdown 标题微调措辞就会改变 GitHub slug；同名小节增删会让 `#notes-1` 漂移到别的段落。
   - **控制**：① 对长期被下游依赖的段落推荐加 `<a id="stable-id"></a>`；② 当 `#old-slug` 找不到或失配，但同文件内有**唯一**一个 `section` 的去注释哈希等于原 `@hash` 时，复用 `pins.mjs` 的 `moved` 机制，由 `docaxioms pin --relocate` 安全改写为新 `#slug`。
4. **依赖成环（Cycle）**
   - **来源**：`A#x` 与 `B#y` 直接或经 `C` 互相 pin（或生成器把自身输出又当输入），导致拓扑序不存在，也违背 M3“一事一主”。
   - **控制**：普通 `link` 边允许有环（BFS 已用 `seen` 去重）；对**依赖子图（pins + generators）**在 `check` 中做三色 DFS 环检测，发现环立即作为门禁错误报出完整环路径 `A -> B -> ... -> A`。
5. **边的漂移（漏建边、死边、碎改噪音）**
   - **死边**：`codeToDocs` 的 `code` glob 在目录迁移后匹配不到任何文件却静默 `ok`——应在 `codeToDocs` 检查中对零匹配模式输出 `note` 或告警（A6）。
   - **微改噪音**：不做模糊/语义哈希（否则删掉一个 `not` 或改掉阈值数字会漏报，违背 A6）；控噪的根本手段是 **M3 减边**——凡能用链接或 G20 生成解决的，一律不建文档间散文 pin。

---

## 5. 业界先例与可借鉴之处（均已核实出处）

1. **Doorstop（纯文本需求 DAG + 父指纹盖章与 `suspect` 复核流）**
   - **出处**：Doorstop 文档 *Validating Requirements*（<https://doorstop.readthedocs.io/en/latest/validation.html>）；源码（<https://github.com/doorstop-dev/doorstop>）。
   - **可借鉴与取舍**：子条目链接父条目时把父条目的哈希盖章（fingerprint/stamp）存下来；父变则子标为 `suspect`，人工复核后跑 `doorstop clear <UID>` 重新盖章。这证明“静态存父哈希 + 失配标脏 + CLI 显式清除”在纯 Git 工作流里完全可行，无需后台数据库。取舍：不学它把所有文档强制拆成一页一条的 YAML，保留在普通 Markdown 内按需加注释 pin。
2. **构建系统的依赖追踪与提前截断（*Build Systems à la Carte* 与 Ninja `restat`）**
   - **出处**：Mokhov, Mitchell, Peyton Jones, *Build Systems à la Carte*, PACMPL 2(ICFP), 2018（<https://doi.org/10.1145/3236774>）；Ninja Manual `restat`（<https://ninja-build.org/manual.html#ref_rule>）。
   - **可借鉴**：论文形式化了 **verifying traces（存上游输出哈希）**与 **early cutoff（重算后输出哈希未变即截断下游传播）**；Ninja 的 `restat = 1` 则让代码生成器在内容未变时不更新输出时间戳以阻断下游重编。直接对应两点设计：① 文档段落哈希必须剥离下游自身的 pin 注释才能截断；② G20 生成器在输出无变化时不要重写文件。
3. **OASIS DITA 1.3（`conref` 内容转引 vs `xref` 链接，`keyref` 间接寻址）**
   - **出处**：OASIS DITA 1.3 Specification — *Using keys for addressing*（<https://docs.oasis-open.org/dita/dita/v1.3/os/part1-base/archSpec/base/using-keys-for-addressing.html>）与 *The `@conkeyref` attribute*（<https://docs.oasis-open.org/dita/dita/v1.3/os/part1-base/langRef/attributes/conkeyref.html>）。
   - **可借鉴**：DITA 严格区分普通交叉链接（`xref`）与内容复用（`conref`），需要两处呈现同一事实时直接拉取源元素而非手抄两份；并用 `keyref`/`conkeyref` 解耦易变的物理路径与逻辑标识。对应 docaxioms：优先链接或生成（M3/A4），被依赖段落用稳定 `<a id>` 解耦标题文案变化。
4. **Sphinx 交叉引用与 `nitpicky` 模式**
   - **出处**：Sphinx 文档 *`:ref:` role*（<https://www.sphinx-doc.org/en/master/usage/restructuredtext/roles.html#role-ref>）与 *`nitpicky` 配置*（<https://www.sphinx-doc.org/en/master/usage/configuration.html#confval-nitpicky>）。
   - **可借鉴**：显式标签 `.. _label:` 支持跨文件重排而不断链，`:ref:` 自动拉取目标最新标题，`nitpicky = True` 将悬空引用变成精确门禁；但它**只保证目标存在、不保证引用处的叙述未过时**，印证了链接边与内容依赖边必须分治（A6）。
5. **内联生成校验与命名片段包含（Ned Batchelder `cogapp --check` 与 `mdBook {{#include}}`）**
   - **出处**：Cog 文档（<https://cog.readthedocs.io/>）；Rust `mdBook` 文档 *Including portions of a file*（<https://rust-lang.github.io/mdBook/format/mdbook.html#including-portions-of-a-file>）。
   - **可借鉴**：`cog` 用成对注释在普通 Markdown 中界定生成块，平时直接入库以便网页端裸读，CI 用 `cog --check` 校验生成块与源数据一致——完全契合方案 G20 与第六节“无 CLI 也能在网页看全”的要求；`mdBook` 的 `ANCHOR` 则展示了比行号更稳的命名切片。
6. **电子表格的依赖树与计算链（Excel Recalculation）**
   - **出处**：Microsoft Learn, *Excel Recalculation*（<https://learn.microsoft.com/en-us/office/client-developer/excel/excel-recalculation>）。
   - **可借鉴与边界**：Excel 沿依赖树标 dirty 并按计算链拓扑重算，全自动的前提是**下游都是确定性公式**；对应到文档图，只有 G20 生成节点是“公式单元格”，散文节点只能走“拓扑标脏 + 人工/Agent 复核确认”。

---

## 6. 对 Claude 初步看法的评议与第一版（最小可行）设计

### 对 Claude 初步看法的同意与反对

- **同意**：
  - **看法 1、3、4、5**：图必须是 DAG 而非树；链接只表可达、不表内容依赖；自动改写只限确定性生成物（A4/G20），散文必须经显式确认（A0/A6）；最根本的是靠 M3 少建需要传播的边。
- **反对与修正（4 处）**：
  1. **未点破 owner 设想里的“单根错觉”**：Claude 没指出“任务完成改任务页（K4）”并不能沿内容依赖图自动推出 K3 设计文档的改动——必须把代码 diff、决策变更、任务变更三类根合流进同一个影响分析入口，否则解决不了 owner 说的“阶段/任务完成时找相关文件”。
  2. **看法 2c 的“提前截断”漏了哈希自激陷阱**：若不从被 pin 的 Markdown 切片哈希里剥离下游自己的 `<!-- pin: ... -->` 注释，刷新中游 pin 必定改变中游字节并击穿下游，根本无法提前截断；反过来，一旦剥离了 pin 注释，静态门禁本身就天然具备 early cutoff，只有“影响预览”才需要展示传递闭包。
  3. **反对看法 6 把“显式文档 pin”做成 `aid`**：按 M2，启发式推断（`codeToDocs`、共变提示、传递待定提示）才该做 `aid`；作者显式写下的 `<!-- pin: docs/design.md#cache@hash -->` 谓词完全精确，且与 `code pin` 同构，若降为不阻断的 `aid` 反而造成“同样写 `<!-- pin -->`，钉代码阻断、钉文档不阻断”的契约分裂。**显式 pin 应直接作为 `gate`（随项目自身按 AD-7 升格节奏启用），推断边做 `aid`**。
  4. **漏了依赖子图的环检测门禁**：一旦允许文档间 pin，必须在门禁里拦截环依赖。

### 我会怎么设计第一版（MVP）

只做三件小而闭环的事，全部长在现有引擎上：

1. **在 `src/pins.mjs` 中把 pin 扩充到 Markdown 锚点（精确边 + early cutoff + 环检测）**
   - 支持 `<!-- pin: path/to/doc.md#anchor@hash -->`（兼容标题 slug 与 `<a id="...">` 块锚点）；
   - 计算 Markdown 锚点哈希时剥离 `<!-- pin: ... -->` 注释并归一换行，天然实现 early cutoff；
   - 支持同文件内唯一同哈希锚点改名的 `moved` 检测与 `docaxioms pin --relocate`；
   - 对所有文档间 pin 跑 DFS 环检测，成环即报错。
2. **新增只读命令 `docaxioms impact [--base <ref>]`（统一图遍历，零阻断，直接服务方案第六节“文档影响报告”）**
   - 以相对 `base` 的源码变更、决策行变更、开放项/文档章节变更为起点，在统一图上按**拓扑序**输出两级清单：
     - **精确待处理**：失配的 code/doc pins、状态变更决策的 `landing`、失去开放项挂载的 `research/`、因删改产生的反向断链；对传递下游标为 `pending upstream`（提示先审上游，上游正文不变则自动免审）；
     - **启发式建议（aid）**：`codeToDocs` 命中的未更新文档。
3. **打通最小 G20 生成校验（只管纯机械派生内容）**
   - 在 `docaxioms.json` 支持声明生成文件/块与纯函数生成脚本：`docaxioms generate` 按拓扑序重算写入（内容未变不写盘），`docaxioms check` 校验磁盘内容与重算结果一致，并自动将纯生成文件排除出散文规则与 `garden`。
