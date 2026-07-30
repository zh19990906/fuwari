# FRP 跨平台内网穿透文档实施计划

日期：2026-07-30

目标：依据已确认的设计规范，新增一篇从零重写的 FRP 跨平台教程，覆盖 Linux `frps`、Linux/Windows `frpc`、TCP 与 HTTP 代理、Nginx、Systemd、Windows 计划任务、安全边界和排障，并通过现有文档体系与 CI。

## Task 1：建立回归测试（RED）

修改：

- `tests/docs-core.test.mjs`
- 新增 `tests/frp-doc.test.mjs`

步骤：

1. 在文档测试入口引入 `frp-doc.test.mjs`。
2. 新测试要求 `src/content/posts/frp-cross-platform-tunnel.md` 存在。
3. 验证 Frontmatter：`contentType: docs`、`docGroup: linux`、`docSection: 网络与远程访问`、`docOrder: 70`、`updated: 2026-07-30`，且没有单篇 `author`。
4. 验证正文包含：FRP v0.69.0、TOML、`tokenSource`、`transport.tls.force`、`allowPorts`、`frps verify`、`frpc verify`、Systemd、ScheduledTasks、TCP 代理、HTTP 代理、Nginx Host 透传和安全检查清单。
5. 验证正文不包含：`screen -S`、`nohup`、默认/弱凭据、Dashboard 公网监听、私有 IPv4、语雀导出语法或原教程图片引用。
6. 创建 Draft PR 触发 CI，确认 `pnpm test:docs` 因目标文章缺失而失败。

## Task 2：编写文章主体（GREEN）

新增：

- `src/content/posts/frp-cross-platform-tunnel.md`

文章结构：

1. FRP 架构和三个端口概念。
2. 部署前检查与不应公开的高风险服务。
3. 固定版本下载、架构选择和 SHA-256 校验。
4. Linux `frps` 安装目录、系统用户、Token 文件和 `frps.toml`。
5. `frps.service`，包含启动前 `verify`、自动重启和基础 Systemd 加固。
6. Linux `frpc` 公共配置与 `frpc.service`。
7. TCP SSH 映射，解释 SSH 自身认证仍然必需。
8. HTTP 自定义域名代理与 Nginx 终止 HTTPS。
9. Windows `frpc` 配置、前台验证和 PowerShell ScheduledTasks 开机任务。
10. 云安全组、主机防火墙、`allowPorts`、Dashboard SSH 转发。
11. 从内到外的排障流程。
12. 安全边界、升级顺序和生产检查清单。
13. 参考资料与来源说明。

技术要求：

- 示例版本固定为 v0.69.0，但提醒发布前再次查看 Release 页。
- 客户端显式保留 `transport.tls.enable = true`，服务端设置 `transport.tls.force = true`。
- Token 使用 `auth.tokenSource.type = "file"`；不在正文提供可复用弱密码。
- Dashboard 绑定 `127.0.0.1`，仅通过 SSH 本地转发访问。
- FRPS VHost HTTP 使用 8080，Nginx 独占 80/443 并保留 Host。
- Windows 使用官方 ScheduledTasks PowerShell cmdlet，不依赖 NSSM。
- 明确 Token、TLS 和 FRP 本身都不能替代业务授权、SSH 密钥、应用认证或零信任访问。

## Task 3：静态复核与最小修正

1. 读取新文章 Frontmatter 与关键配置段，检查标题、顺序和路径。
2. 检查所有代码块闭合、TOML 字段拼写、Systemd 路径和 PowerShell 参数。
3. 检查正文没有真实 IP、域名、凭据或原教程附件。
4. 检查参考资料只指向 FRP 官方仓库/文档、Microsoft ScheduledTasks 文档和用户提供的教程。
5. 根据 Biome、Node 测试或 Astro 内容 Schema 日志做最小修正。

## Task 4：完整验证与交付

GitHub Actions 必须提供以下成功证据：

- Code Quality；
- 文档测试，Node.js 22 / 23；
- 现有 UI、活动、个人化和专业化测试；
- Astro Check，Node.js 22 / 23；
- Astro Production Build，Node.js 22 / 23。

完成后：

1. 更新 Draft PR 描述，列出来源、安全修正和验证结果。
2. 核对 PR 目标为 `main`、可合并、无冲突。
3. 保持 Draft，不自动合并。
