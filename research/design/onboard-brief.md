# 复审：迭代方案新增的“接入链”

仓库副本（分支 research-merge，提交 3dd7cbe）在 /private/tmp/claude-501/-Users-rexxin-Development-docaxioms/3a9c974b-71b6-4f84-b1d6-945733e7b1e3/scratchpad/rm 。这次改动是 `git -C /private/tmp/claude-501/-Users-rexxin-Development-docaxioms/3a9c974b-71b6-4f84-b1d6-945733e7b1e3/scratchpad/rm diff 545b7a5 3dd7cbe`，主体是 research/迭代方案.md 的第七节第 5 条“接入：由 agent 迁移，由检查收口”，另外改了：开头来源第 5 项、第一节一条结论、第二节缺陷 19 和 20、第六节第 2 条“接入与升级”、第九节触发矩阵“接入、升级”一行、第十节新增“第零批”和第三批第 6 项、第十一节一行、第十二节第 21 至 23 项和“owner 已定的方向”。

背景：owner 定下的方向（不用再议方向本身）：
- 接入（新项目和已有项目）后文档主要由 agent 维护，所以接入也交给 agent：给 agent 一份指南去迁移，再做机械检查，不符合预设结构就列出问题让 agent 继续改，直到通过；
- 文档超出预算时，优先让 agent 精简，细节移到专门的文档，入口只留链接；
- 已有项目原有的 AGENTS.md：另存为单独的文档，复制模板的 AGENTS.md，再把另存的文档作为链接加进新的 AGENTS.md；文件名 `<名字>.project.md` owner 已同意。

请只审这一部分，对照当前源码（src/manage.mjs、src/check.mjs、src/profile.mjs、templates/、core/GUIDE.md、core/AXIOMS.lock.md、docs/decisions.md 里的 AD-1 至 AD-7）：
1. 设计有没有漏洞或做不到的地方：替换规则、过渡文件的退役、onboard 的三部分判据、边界。特别是 agent 能不能不做迁移就让 onboard 通过；判据会不会误报或漏报；与 A0–A8、M1–M4、AD-2、AD-7 是否冲突。
2. 漏掉的边界情况（例如符号链接、嵌套入口、history 目录里撞名、Windows 或大小写不敏感的文件系统、已有 docaxioms 文件夹等）。
3. 写错的事实、与源码不符的说法、交叉引用指错、和文档其他章节矛盾的地方。
4. 第十二节第 21 至 23 项的建议是否合理，有没有该列却没列的待定问题。

按严重程度 P0–P3 列出，每条给行号和改法；没问题的部分一句带过。中文，简洁。只读，不要修改任何文件。
