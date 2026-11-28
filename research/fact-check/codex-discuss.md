1. CRLF：core 选 `.gitattributes` 固定 LF，保留字节 pin；history 比较可统一 LF。不能拿 code pin 的先例直接放宽 core 身份校验，已有项目须说明迁移（A4/A5/A6）。

2. 支持 opt-in `--require-base`，仅约束已启用且需要基线的检查；默认保留 note，说明未比较范围。检查证据前提不违背 A6/A7，但不能借此绕过 AD-7 升级本仓库门禁（A1/A6/A7）。

3. 拆 GUIDE 值得但后置：配置字典按需可达，流程仍必读，新页纳入 core pin。不改公理，无需 `--accept-axioms`；收益实测（A3/A4/M4）。

4. profile 校验升 T0，init 显示名降级，SARIF 等集成需求。遗漏：B1 直接换 `descriptionDocs` 会排除 stage card；整文件 pin 无预览；AD-7 要求外部项目至少 10 次相关变更、3 条值得改文档的发现，再由 owner 逐项恢复门禁（A6/A7）。另外，自动生成 K3 不天然违反 A0，不能把 K2 随代码改写才是边界（A0/A4）。

“剔除错误”有两项过头：按 agy 引文，B 说“二手综述未报告 p 值”，初稿换成“Lulla 未报告”，不是同一断言；AD-5 的“快照无法知道为何”是证据边界，git 补足删除记录不等于原判断错误，更不证明 owner 授权。旧 ZIP 未提供，`index.mjs` 缺失也只能判当前不成立（A0/A1/A5）。
