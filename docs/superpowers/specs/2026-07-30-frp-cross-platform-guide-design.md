# FRP 跨平台内网穿透文档设计

日期：2026-07-30

## 目标

将用户提供的 `CNFlyCat/UsefulTutorials` FRP 教程重写为一篇适合公开博客、能够长期维护的工程文档：

- Linux 公网服务器运行 `frps`；
- Linux 或 Windows 内网设备运行 `frpc`；
- 同时覆盖 TCP 端口映射和 HTTP 域名代理；
- 使用当前 FRP TOML 配置、Systemd、Windows 计划任务和配置校验；
- 默认采用最小暴露、强认证、TLS、私有 Dashboard 和受限远程端口。

本文不是原教程的改写副本。原教程只提供章节组织和常见使用场景；配置语法、版本、安全边界和运行方式以 FRP 官方资料为准，正文从零重写。

## 交付文件

新增文章：

`src/content/posts/frp-cross-platform-tunnel.md`

Frontmatter 固定为：

```yaml
---
title: FRP 内网穿透实战：Linux 服务端与 Linux/Windows 客户端
published: 2026-07-30
updated: 2026-07-30
description: 使用 FRP 将 Linux 或 Windows 内网服务安全映射到公网，覆盖 TCP、HTTP 域名代理、Systemd、计划任务、TLS 与排障。
tags: [Linux, FRP, 内网穿透, Systemd, Windows]
category: Linux
contentType: docs
docGroup: linux
docSection: 网络与远程访问
docOrder: 70
draft: false
---
```

不新增单篇 `author`，继续继承全站作者 `Henson`。

## 版本与兼容性

正文以 **FRP v0.69.0** 为固定示例版本。该版本是设计日期时官方 Release 页标记的 Latest 版本。

文章明确说明：

- 下载前应再次查看官方 Release 页；
- 示例命令固定版本，避免 `latest` URL 随时间变化；
- 下载后使用 Release 页提供的 SHA-256 校验值验证文件；
- 混合版本升级时先升级 `frps`，再升级 `frpc`；
- v0.69.0 引入了新的兼容性窗口与可选 Wire Protocol v2，但本文保持默认协议，不把实验性升级内容混入基础部署。

支持的示例包：

- Linux AMD64：`frp_0.69.0_linux_amd64.tar.gz`；
- Linux ARM64：`frp_0.69.0_linux_arm64.tar.gz`；
- Windows AMD64：`frp_0.69.0_windows_amd64.zip`。

## 文章结构

### 1. FRP 解决什么问题

用一张文本流向图解释：

```text
公网访问者
    ↓
公网 Linux 服务器：frps
    ↓ 加密控制连接 / 工作连接
内网 Linux 或 Windows：frpc
    ↓
本地 SSH、Web 或其他 TCP 服务
```

明确三个端口概念：

- `bindPort`：`frpc` 连接 `frps` 的控制端口；
- `remotePort`：公网用户访问 TCP 代理时使用的端口；
- `localPort`：内网真实服务监听的端口。

同时解释 FRP 不是 VPN，也不等于零信任访问控制。

### 2. 部署前检查

检查项包括：

- 一台具有公网地址的 Linux 服务器；
- 云安全组和本机防火墙能够精确开放所需端口；
- 内网设备可以主动访问公网服务器；
- HTTP 域名代理需要正确的 DNS 记录；
- 80/443 已被 Nginx 使用时，FRP VHost 改用内部端口；
- 不把数据库、Docker API、Kubernetes API、管理面板等高风险服务直接映射到公网。

### 3. 下载与校验

Linux 示例使用环境变量固定版本和架构：

```bash
FRP_VERSION=0.69.0
FRP_ARCH=linux_amd64
curl -fLO "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_${FRP_ARCH}.tar.gz"
sha256sum "frp_${FRP_VERSION}_${FRP_ARCH}.tar.gz"
```

文章要求读者把输出与 Release 页中对应资产的 SHA-256 对比，不在正文中复制一组容易过期或被误配到其他架构的哈希。

Windows 使用浏览器或 PowerShell 下载 ZIP，并通过：

```powershell
Get-FileHash .\frp_0.69.0_windows_amd64.zip -Algorithm SHA256
```

验证文件。

### 4. Linux 公网服务器部署 frps

目录和用户固定为：

```text
/usr/local/bin/frps
/etc/frp/frps.toml
/etc/frp/token
```

创建不可登录的系统用户 `frp`，配置和 Token 只允许 root 与服务读取。

`frps.toml` 的核心配置：

```toml
bindAddr = "0.0.0.0"
bindPort = 7000

transport.tls.force = true

auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "/etc/frp/token"

allowPorts = [
  { start = 6000, end = 6099 },
]
maxPortsPerClient = 10

vhostHTTPPort = 8080

webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "frp-admin"
webServer.password = "{{ .Envs.FRP_DASHBOARD_PASSWORD }}"

log.to = "console"
log.level = "info"
```

设计决定：

- Token 使用 `tokenSource` 文件，不写进 TOML；
- Dashboard 仅监听回环地址；
- Dashboard 密码由 Systemd 环境文件或凭据机制提供，不提交到仓库；
- TCP 远程端口只允许 6000–6099；
- VHost HTTP 使用 8080，为 Nginx 保留 80/443；
- 日志写到标准输出，由 journald 接管。

Dashboard 通过 SSH 本地转发访问：

```bash
ssh -L 7500:127.0.0.1:7500 admin@frp.example.com
```

浏览器再访问 `http://127.0.0.1:7500`。

### 5. Systemd 管理 frps

新增完整 Unit 示例，核心要求：

```ini
[Unit]
Description=FRP server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=frp
Group=frp
EnvironmentFile=-/etc/frp/frps.env
ExecStartPre=/usr/local/bin/frps verify -c /etc/frp/frps.toml
ExecStart=/usr/local/bin/frps -c /etc/frp/frps.toml
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict

[Install]
WantedBy=multi-user.target
```

文章包含：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frps
sudo systemctl status frps
sudo journalctl -u frps -f
```

不使用 `screen`、`nohup` 或手工保持终端窗口。

### 6. Linux 客户端部署 frpc

Linux 客户端使用：

```text
/usr/local/bin/frpc
/etc/frp/frpc.toml
/etc/frp/token
```

共享配置：

```toml
serverAddr = "frp.example.com"
serverPort = 7000
clientID = "linux-home-01"

transport.protocol = "tcp"
transport.tls.enable = true

auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "/etc/frp/token"

log.to = "console"
log.level = "info"
```

Linux `frpc.service` 与服务端采用相同的安全硬化方向，并在启动前运行：

```bash
/usr/local/bin/frpc verify -c /etc/frp/frpc.toml
```

### 7. TCP 端口映射

使用 SSH 作为示例，但强调优先使用密钥认证、禁用 root 密码登录、限制来源 IP。

```toml
[[proxies]]
name = "home-ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6001
transport.useEncryption = true
```

访问方式：

```bash
ssh -p 6001 user@frp.example.com
```

文章说明 `transport.useEncryption` 是代理数据层附加加密选项，不能替代 SSH 自身的身份验证和主机密钥校验。

### 8. HTTP 域名代理与 Nginx

`frpc.toml` 示例：

```toml
[[proxies]]
name = "home-web"
type = "http"
localIP = "127.0.0.1"
localPort = 8080
customDomains = ["app.example.com"]
```

公网 Nginx：

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

数据路径为：

```text
HTTPS 访问者
  ↓
Nginx :443 终止 TLS
  ↓ 保留 Host
FRPS vhostHTTPPort :8080
  ↓
FRPC
  ↓
内网 Web :8080
```

文章链接站内已有的 Nginx 反向代理与 acme.sh HTTPS 文档，不重复完整证书申请流程。

### 9. Windows 客户端部署 frpc

固定目录：

```text
C:\frp\frpc.exe
C:\frp\frpc.toml
C:\frp\token
C:\frp\logs\
```

先前台验证：

```powershell
Set-Location C:\frp
.\frpc.exe verify -c .\frpc.toml
.\frpc.exe -c .\frpc.toml
```

Windows 配置与 Linux 保持相同逻辑，Token 从文件读取：

```toml
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "C:/frp/token"
log.to = "C:/frp/logs/frpc.log"
```

使用 PowerShell ScheduledTasks 模块创建开机任务：

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\frp\frpc.exe' `
  -Argument '-c C:\frp\frpc.toml' `
  -WorkingDirectory 'C:\frp'
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask `
  -TaskName 'FRP Client' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -User 'SYSTEM' `
  -RunLevel Highest
```

文章同时给出：

```powershell
Start-ScheduledTask -TaskName 'FRP Client'
Get-ScheduledTaskInfo -TaskName 'FRP Client'
Stop-ScheduledTask -TaskName 'FRP Client'
```

不要求第三方 NSSM，也不依赖保持命令窗口打开。

### 10. 防火墙与最小暴露

公网服务器只开放：

- `7000/tcp`：仅允许 FRPC 客户端来源地址时优先限制来源；
- `6000-6099/tcp`：仅开放实际使用的 TCP 映射端口；
- `80/443`：由 Nginx 对公网提供 Web 服务；
- `7500` 不对公网开放。

说明云安全组与主机防火墙是两层独立控制，二者都需要检查。

### 11. 验证与排障

正文提供从内到外的检查顺序：

1. 本地服务是否监听 `localIP:localPort`；
2. `frpc verify` / `frps verify` 是否通过；
3. Systemd 或 Windows 任务是否运行；
4. `frpc` 能否连接 `serverAddr:serverPort`；
5. Token、TLS 和版本是否匹配；
6. `allowPorts` 是否允许请求的 `remotePort`；
7. 云安全组和本机防火墙是否放行；
8. HTTP 场景的 DNS、Host 与 Nginx 代理是否正确；
9. 端口是否被 Nginx、其他 FRP 实例或系统服务占用。

常用命令：

```bash
ss -lntp
systemctl status frps frpc
journalctl -u frps -u frpc --since "10 minutes ago"
curl -H 'Host: app.example.com' http://127.0.0.1:8080/
```

Windows 使用：

```powershell
Get-NetTCPConnection
Test-NetConnection frp.example.com -Port 7000
Get-Content C:\frp\logs\frpc.log -Tail 100
```

## 安全边界

文章明确说明：

- Token 认证只验证 FRPC 是否可以连接 FRPS，不是业务级用户授权；
- 默认 FRP TLS 会加密连接，但没有配置受信 CA 时，客户端不会验证服务器身份；高风险环境应配置证书和 `trustedCaFile`；
- Dashboard 不能直接暴露公网；
- HTTP 暴露仍需要应用自身认证、限流、日志与漏洞修复；
- TCP 映射后的 SSH/RDP 仍会遭受公网扫描和口令攻击；
- `allowPorts`、云安全组、主机防火墙和应用权限需要共同生效；
- 不公开数据库、Redis、Docker API、Kubernetes API、NAS 管理后台等管理接口；
- FRP 不替代企业 VPN、零信任网关或细粒度访问代理。

## 来源与著作处理

正文底部包含“参考资料”：

- FRP 官方仓库与 Release 页；
- FRP 官方安装、配置、认证、TLS 和配置参考；
- 用户提供的 CNFlyCat 教程，标注为场景和章节组织参考。

不复制原教程中的：

- 段落表达和口语化提示；
- 图片与上传附件；
- 弱 Token、示例密码和真实地址；
- `screen` 常驻方式；
- Dashboard 监听 `0.0.0.0`；
- 直接让 FRPS 占用 80/443 且不处理 Nginx 冲突的设计。

## 测试与验收

新增 `tests/frp-doc.test.mjs`，并从 `tests/docs-core.test.mjs` 引入。

测试验证：

- 文件存在；
- Frontmatter 的 `linux / 网络与远程访问 / 70` 正确；
- 不存在单篇 `author`；
- 使用 v0.69.0、TOML、`tokenSource`、`transport.tls.force`、`allowPorts`；
- 包含 `frps verify`、`frpc verify`、Systemd 和 Windows ScheduledTasks；
- Dashboard 只绑定 `127.0.0.1`；
- 包含 TCP 与 HTTP 两类代理；
- 包含 Nginx 反向代理和 Host 透传；
- 不包含 `screen -S`、`nohup`、弱 Token、默认 Dashboard 密码、私有 IPv4 地址或真实凭据；
- 包含来源说明和 FRP 官方参考链接。

完整 CI：

- Biome Code Quality；
- 文档回归测试，Node.js 22 / 23；
- 现有 UI、活动、个人化和专业化测试；
- Astro Check，Node.js 22 / 23；
- Astro 生产构建，Node.js 22 / 23。

## 非目标

本文不覆盖：

- XTCP、STCP、SUDP、P2P 打洞；
- OIDC 服务搭建；
- 双向 mTLS 证书签发教程；
- FRPS 集群与高可用；
- Kubernetes 部署；
- Windows 运行 FRPS；
- 自动安装脚本或一键部署脚本；
- 将 Dashboard 公开到互联网；
- 完整 Nginx 与 ACME 证书申请教程。