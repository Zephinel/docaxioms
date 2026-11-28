# 接入链第三轮复核（1aa537f）

**结论：已无 P0、P1 问题；新项目 `init` 后 `onboard` 可直接通过。第二轮两份快速复核的主体改动均已到位，仅余 1 处未改完的尾句及 2 处与当前源码交互的 P2 细节。**

行号均指仓库副本 `rm/research/迭代方案.md`（提交 `1aa537f`）。

---

## 1. 第二轮（两份 quick 意见）落实核对

- **`codex-onboard-quick.md`**：
  - 1（P1，仅在产生 `CLAUDE.project.md` 时追加第二行导入）：**已落实**（第 724 行）。
  - 2（P2，封住经现行文档中转链向/导入过渡文件或归档的路径）：**已落实**（第 753 行）。
  - 3（P2，删改替换记录的可见性）：**部分落实**——第 761 行已补开头固定打印替换记录摘要，但第 770 行尾句未同步（见下 P2-3）。
- **`agy-onboard-quick.md`**：
  - P2-1（第 761、770 行矛盾与 `profile.mjs` schema）：**部分落实**——第 761、850 行已落实，第 770 行尾句未同步（见下 P2-3）。
  - P2-2（第 726 行嵌套入口去掉“可达”）：**已落实**（第 726 行）。
  - P3-1（第 724 行条件限定与第 753 行封住跳板）：**已落实**（第 724、753 行）。

---

## 2. 整体重读发现的剩余问题（仅 P2，共 3 项）

- **P2-1｜归档路径写成 `<原相对路径>` 会让 `docs/README.project.md` 还原成 `/README.md` 结尾，意外跳过横幅与历史不可改写两道门禁**
  - **出处**：第 `744, 752` 行（对照 `src/check.mjs:538, 663`）。
  - **问题**：`src/check.mjs:538`（过期横幅门禁）和第 `663` 行（history 正文防篡改门禁）都对所有以 `/README.md` 结尾的历史文件直接豁免。第 744 行写移进 `<history 目录>/onboarding/<原相对路径>`，若把由 `docs/README.md` 改名来的过渡文件存回 `docs/history/onboarding/docs/README.md`，两道门禁都会静默跳过它，且第 752 行核对归档路径时也会出现带不带 `.project` 的歧义。
  - **改法**：第 744 行改为 `<history 目录>/onboarding/<过渡文件相对路径>`（保留 `.project.md` 后缀，例如 `docs/history/onboarding/docs/README.project.md`）。

- **P2-2｜替换记录写入 `docaxioms.json` 需防 `update` 覆盖，并同步 `core/GUIDE.md` 键表**
  - **出处**：第 `734, 850` 行（对照 `src/manage.mjs:74-82`、`README.md:48`、`core/GUIDE.md:68-86`）。
  - **问题**：① 第 734 行写替换记录“和 `core` 一样由 docaxioms 写”，若挂在 `profile.core` 下，运行 `docaxioms update` 时 `putCore`（`src/manage.mjs:81` `profile.core = coreMeta`）会整块重写 `core` 冲掉替换记录；② 若作为独立顶层键加进 `src/profile.mjs`（第 850 行），`README.md:48` 承诺“Every key is in the profile (`core/GUIDE.md#the-profile`)”，漏补 `core/GUIDE.md` 会造成说明失步（用通用措辞描述“初始化时改名的文件记录”即可遵守 AD-2）。
  - **改法**：第 734、850 行写明该记录为独立顶层键且 `update` 原样保留，并在第 850 行补上同步 `core/GUIDE.md` 的 profile 键表。

- **P2-3｜第 770 行与第 852 行残留拆分前的旧表述**
  - **出处**：第 `770, 852` 行（对照第 `760-761` 行）。
  - **问题**：第 761 行已规定“待 owner 确认”不比较替换记录，改靠输出开头的替换记录摘要与 Git 差异发现删改；但第 770 行仍写“删掉替换记录。‘待 owner 确认’只能让这些被看见”，自相矛盾。同时第 852 行第零批写“先做‘未通过’和‘待 owner 确认’”，漏列了从“待 owner 确认”拆出的“开头替换记录摘要”和“已启用的项目配置”。
  - **改法**：第 770 行改为“‘待 owner 确认’、开头的替换记录摘要和 Git 差异审阅只能让这些被看见”；第 852 行补上“开头的替换记录摘要与已启用的项目配置”。
