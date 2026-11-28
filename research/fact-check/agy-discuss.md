# AGY 批评意见

## 1. 四个讨论问题
1. T0-4 选归一化：CRLF 误报违背 A7，pins.mjs 已有先例；.gitattributes 不覆宿主、非 Git 无效且越界（AD-2）。须按 A6 明示锁 LF 文本。
2. T1-10 不冲突（opt-in）：本地退 note 保 A7，CI PR 显式升失败兑现 A6；但须注记 A6 边界：push 主干 base==HEAD 仍不检历史。
3. T1-11 不拆 GUIDE（降 T2）：缺省 2KB 的收益实证（A1），改 core/ 增 update 成本；按 A3/M4 先改模板 AGENTS.md 取消全读。
4. 排序与遗漏/高估见下。

## 2. 排序、遗漏与高估
- 调序：T1-8（profile 校验）升 T0——拼错键致 gate 静默通过破 A6，重于 T0-7（降 T1）。T0-6 仅 ?query 是 bug；非 .md 与前导 / 契约未定（A0/A6），先定规范。
- 遗漏：① 按需 SKILL.md（~100 tokens），比拆 GUIDE 更合 A3/M4 且不动 core/；② AD-7 外部实证采集（10 变更/3 findings，A1/M2）；③ B7 空文件计 1 行。
- 高估：T1-9 全量 line 与 SARIF（全局检查无单行，SARIF 挪 T2）；T2-13 目录式 ADR 难避索引/landing 冲突，后于薄 Action。

## 3. “剔除错误”自身的错误
1. “两者共同”错：2610.27381 漏相对增幅、把 DocGuard 当主流，均仅出自报告 A。
2. 术语归属错：OpenAI 仅提报错注入修复指令，未用“Self-Healing Error Messages”。
3. 误判报告 B：Lulla 写“二手综述未报 p 值”（错在靠二手源，且输入 token 增幅不显著）；AD-5 写“快照无法核实”，无 .git 本不可知，git 历史属补证非纠错。
4. 旧快照过满：src/index.mjs 与 workflow 仅证伪当前 HEAD，未见原 ZIP 不能判旧快照为假。
