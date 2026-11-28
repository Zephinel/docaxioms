**已无 P1 及以上问题。** 已逐条核对第三轮两份意见与当前 626 行稿；未发现新增的公理或现行 AD 决策冲突。以下仅列未闭合处，平台部署未实测。

1. **P2｜Windows 新增挑战签名，与签名接口合同冲突。**  
   [方案：160](research/全流程文档系统方案.md:160)允许闸门密钥签客户端提供的挑战，[方案：138](research/全流程文档系统方案.md:138)却只允许“验收候选”请求。服务端无法保证恶意客户端提交的真是随机数；若复用验收凭据的格式和 namespace，就重新开放了任意载荷签名入口。  
   **建议**：新增受限的认证请求类型，由服务端构造固定结构、限制挑战长度，使用独立 namespace，并同步修改第 138 行的合同。[SSHSIG 规范](https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.sshsig)明确用 namespace 防止跨用途签名混淆。

2. **P2｜Windows“最小权限 CreateFile”漏了模拟级别。**  
   [方案：160](research/全流程文档系统方案.md:160)只限制访问掩码，但客户端必须先向尚未认证的管道发送挑战。默认级别为 `SecurityImpersonation`；满足 Windows 模拟权限条件的假服务，可在验签失败前获得模拟客户端的能力。  
   **建议**：客户端同时指定 `SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION`。这允许服务端核验身份，同时限制其代客户端执行的能力。[Microsoft 默认行为](https://learn.microsoft.com/en-us/windows/win32/ipc/impersonating-a-named-pipe-client)、[模拟级别边界](https://learn.microsoft.com/en-us/windows/win32/secauthz/impersonation-levels)。

3. **P3｜note 两段承载已补结构，尚缺可互通的字节约定。**  
   [方案：125](research/全流程文档系统方案.md:125)仍只说“固定边界”，没有具体边界、长度规则和分隔换行归属。不同实现可能切出不同载荷；普通 notes 写入还可能清理空白。  
   **建议**：固定长度前缀或明确分隔语法，规定逐字节保存、读取，并补完整调用：

   ```sh
   ssh-keygen -Y verify -f allowed_signers -I gate \
     -n docaxioms-gate@v1 -s payload.sig < payload
   ```

   `-f`、`-n` 同样必需。本轮无落盘探针观察到原文通过，篡改和错误 namespace 被拒绝。[OpenSSH 接口](https://man.openbsd.org/ssh-keygen.1)、[Git notes 原样写入要求](https://git-scm.com/docs/git-notes#_examples)。

4. **P3｜Windows 两处 API 限定仍不准确。**  
   [方案：160](research/全流程文档系统方案.md:160)仍漏了第三轮 codex 第 4 项要求的“仅首实例使用”。重复携带 `FILE_FLAG_FIRST_PIPE_INSTANCE` 会使后续实例报 `ERROR_ACCESS_DENIED`。同段“Node 客户端连不上”也过于绝对：libuv 会尝试降为只读连接，是否成功取决于 DACL。  
   **建议**：明确首实例才带该标志；后一句改为“不能建立所需的双向连接，可能退成只读”。[Microsoft 定义](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew)、[libuv 客户端实现](https://github.com/libuv/libuv/blob/v1.x/src/win/pipe.c)。

5. **P3｜无闸门模式还有一处无条件合同。**  
   生命周期表、影响报告和脚手架已修正，但[方案：342](research/全流程文档系统方案.md:342)仍规定关闭任务必须让闸门验收，与[方案：418](research/全流程文档系统方案.md:418)允许 full 不配闸门不一致。  
   **建议**：保留“关闭改动与代码属于同一最终候选”，再分别规定有闸门时正式验收、无闸门时对最终候选运行普通验证。

其余指定事实核验未见问题：`launch_activate_socket` 确实领取 launchd 配置的套接字描述符，见 [Apple 接口](https://developer.apple.com/documentation/xpc/launch_activate_socket)；legacy 决策留在决策目录不会触发 history 横幅要求，也保留了现行决策的权威，与 [src/check.mjs:448](src/check.mjs:448)及 [core/GUIDE.md:25](core/GUIDE.md:25)相容。