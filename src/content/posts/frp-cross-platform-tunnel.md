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

FRP（Fast Reverse Proxy）可以把位于 NAT 或防火墙之后的服务，通过一台具有公网地址的服务器转发到互联网。公网服务器运行 `frps`，内网 Linux 或 Windows 设备运行 `frpc`。

本文覆盖两种常见场景：

- 使用 TCP 远程端口访问内网 SSH 或其他 TCP 服务；
- 使用域名访问内网 Web 服务，并由公网 Nginx 统一处理 HTTPS。

FRP 解决的是网络可达性，不是业务授权系统，也不是 VPN 或零信任网关。映射出去的 SSH、Web 和其他服务仍然需要自己的身份验证、权限控制、更新和审计。

## FRP 的数据路径

```text
公网访问者
    ↓
公网 Linux 服务器：frps
    ↓ TLS 控制连接与工作连接
内网 Linux / Windows：frpc
    ↓
本地 SSH、Web 或其他 TCP 服务
```

先区分三个容易混淆的端口：

| 配置 | 含义 | 示例 |
|---|---|---|
| `bindPort` | `frpc` 连接 `frps` 的控制端口 | `7000` |
| `remotePort` | 公网用户访问 TCP 代理的端口 | `6001` |
| `localPort` | 内网真实服务监听的端口 | `22` 或 `8080` |

HTTP 代理稍有不同。公网请求先进入 `vhostHTTPPort`，`frps` 再根据请求的 Host 找到对应代理，不需要为每个站点分配独立公网端口。

## 部署前检查

开始前确认：

1. 有一台公网 Linux 服务器，并拥有管理员权限；
2. 内网设备能够主动连接公网服务器的 `bindPort`；
3. 云安全组与主机防火墙可以分别配置；
4. HTTP 域名代理使用的 DNS 记录已经指向公网服务器；
5. 如果 Nginx 已经占用 80/443，FRP 的 HTTP VHost 使用内部端口；
6. 内网服务只监听必要接口，并有自己的认证机制；
7. 不把数据库、Redis、Docker API、Kubernetes API、NAS 管理后台等高风险管理接口直接映射到公网。

文中的域名均为示例。部署时替换为自己的域名，不要把真实 Token、密码和服务器地址提交到代码仓库。

## 固定版本并校验下载文件

本文以 FRP v0.69.0 为示例。发布前应重新查看官方 Release 页；命令固定版本号是为了让安装过程可复现，而不是建议永远停留在这个版本。

### Linux AMD64 或 ARM64

先确认架构：

```bash
uname -m
```

常见对应关系：

- `x86_64`：使用 `linux_amd64`；
- `aarch64`：使用 `linux_arm64`。

AMD64 示例：

```bash
FRP_VERSION=0.69.0
FRP_ARCH=linux_amd64

curl -fLO "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_${FRP_ARCH}.tar.gz"
sha256sum "frp_${FRP_VERSION}_${FRP_ARCH}.tar.gz"
tar -xzf "frp_${FRP_VERSION}_${FRP_ARCH}.tar.gz"
cd "frp_${FRP_VERSION}_${FRP_ARCH}"
```

ARM64 只需改为：

```bash
FRP_ARCH=linux_arm64
```

把 `sha256sum` 输出与 Release 页面对应资产的 SHA-256 对比。不要只因为压缩包能够解压就跳过完整性检查。

### Windows AMD64

使用浏览器或 PowerShell 下载 `frp_0.69.0_windows_amd64.zip`，然后校验：

```powershell
Get-FileHash .\frp_0.69.0_windows_amd64.zip -Algorithm SHA256
```

校验值同样以官方 Release 页面为准。

### 版本兼容与升级顺序

从 v0.69.0 开始，FRP 公布了明确的版本兼容窗口。混合版本升级时应先升级 `frps`，再升级 `frpc`，让服务端先具备处理新客户端行为的能力。

v0.69.0 还提供可选 Wire Protocol v2，但默认仍是 v1。基础部署不需要主动开启 v2；只有确认两端版本与变更影响后再单独升级协议。

## Linux 公网服务器部署 frps

### 创建系统用户和目录

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin frp
sudo install -d -o root -g frp -m 0750 /etc/frp
sudo install -m 0755 ./frps /usr/local/bin/frps
```

生成强随机 Token：

```bash
sudo sh -c 'umask 027; openssl rand -hex 32 > /etc/frp/token'
sudo chown root:frp /etc/frp/token
sudo chmod 0640 /etc/frp/token
```

客户端必须使用相同 Token。通过受保护的传输渠道复制 Token 文件，不要把它贴进聊天记录、工单或仓库。

如果需要 Dashboard，再生成独立密码供 Systemd 环境文件读取：

```bash
sudo sh -c 'umask 027; printf "FRP_DASHBOARD_PASSWORD=%s\n" "$(openssl rand -base64 32 | tr -d "\n")" > /etc/frp/frps.env'
sudo chown root:frp /etc/frp/frps.env
sudo chmod 0640 /etc/frp/frps.env
```

### 编写 `/etc/frp/frps.toml`

```toml
bindAddr = "0.0.0.0"
bindPort = 7000

# 只接受使用 TLS 的 frpc。
transport.tls.force = true

# Token 从权限受限的独立文件读取。
auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "/etc/frp/token"

# 限制客户端可以申请的 TCP 远程端口。
allowPorts = [
  { start = 6000, end = 6099 },
]
maxPortsPerClient = 10

# 由本机 Nginx 转发到该端口，不直接暴露给公网。
vhostHTTPPort = 8080

# Dashboard 只监听回环地址。
webServer.addr = "127.0.0.1"
webServer.port = 7500
webServer.user = "frp-admin"
webServer.password = "{{ .Envs.FRP_DASHBOARD_PASSWORD }}"

log.to = "console"
log.level = "info"
log.disablePrintColor = true
```

设置权限并校验配置：

```bash
sudo chown root:frp /etc/frp/frps.toml
sudo chmod 0640 /etc/frp/frps.toml
sudo -u frp /usr/local/bin/frps verify -c /etc/frp/frps.toml
```

看到配置语法通过后再启动服务。严格校验可以提前发现字段拼写错误和不支持的配置项。

### TLS 到底保护了什么

FRP 自 v0.50.0 起，`frpc` 的 `transport.tls.enable` 默认值已经是 `true`。本文仍显式写出该字段，便于审计。服务端的 `transport.tls.force = true` 则用于拒绝没有启用 TLS 的客户端。

默认 TLS 可以加密 `frpc` 与 `frps` 之间的连接，但如果没有配置受信 CA，客户端不能获得与公有 PKI HTTPS 相同的服务器身份保证。高风险环境应为 `frps` 配置证书和私钥，并在 `frpc` 配置 `transport.tls.trustedCaFile` 与 `transport.tls.serverName`。

Token 用于验证客户端是否允许连接 FRP 服务端，也不能替代证书身份校验或业务服务自己的用户权限。

## 使用 Systemd 管理 frps

创建 `/etc/systemd/system/frps.service`：

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
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now frps
sudo systemctl status frps
sudo journalctl -u frps -f
```

使用服务管理器可以获得开机启动、失败重启、统一日志和明确的运行用户，不需要依赖一直打开的终端会话。

## 私有访问 Dashboard

`webServer.addr = "127.0.0.1"` 意味着 Dashboard 不接受外部网络连接。需要查看时建立 SSH 本地转发：

```bash
ssh -L 7500:127.0.0.1:7500 admin@frp.example.com
```

然后在本机浏览器打开：

```text
http://127.0.0.1:7500
```

不要在云安全组或防火墙中开放 7500。Dashboard 能看到代理、客户端和流量信息，本身也是管理面。

## Linux 客户端部署 frpc

### 安装文件和 Token

在内网 Linux 设备执行：

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin frp
sudo install -d -o root -g frp -m 0750 /etc/frp
sudo install -m 0755 ./frpc /usr/local/bin/frpc
```

把服务端生成的 Token 安全复制到 `/etc/frp/token`，然后限制权限：

```bash
sudo chown root:frp /etc/frp/token
sudo chmod 0640 /etc/frp/token
```

### 编写公共配置

`/etc/frp/frpc.toml`：

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
log.disablePrintColor = true
```

后续 TCP 与 HTTP 代理配置可以继续追加在同一个文件中。

## TCP 映射内网 SSH

在 `frpc.toml` 末尾加入：

```toml
[[proxies]]
name = "home-ssh"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6001
transport.useEncryption = true
```

校验并启动后，公网访问方式为：

```bash
ssh -p 6001 user@frp.example.com
```

FRP 的端口映射不会自动保护 SSH：

- 使用密钥认证；
- 禁止 root 密码登录；
- 限制允许登录的账号；
- 在防火墙中尽可能限制来源地址；
- 保留主机密钥校验；
- 监控失败登录和异常扫描。

`transport.useEncryption` 是代理数据层的附加加密选项，不能替代 SSH 自身的端到端加密和身份认证。

## HTTP 域名代理

假设内网 Web 服务监听 `127.0.0.1:8080`，DNS 中的 `app.example.com` 已经指向公网 FRP 服务器。

在 `frpc.toml` 追加：

```toml
[[proxies]]
name = "home-web"
type = "http"
localIP = "127.0.0.1"
localPort = 8080
customDomains = ["app.example.com"]
```

FRPS 会根据 Host 将请求路由到该代理。HTTP 模式适合多个域名共享同一个 VHost 端口；与 TCP 模式不同，它不是通过 `remotePort` 区分服务。

### Nginx 终止 HTTPS

公网服务器已经由 Nginx 占用 80/443 时，推荐链路：

```text
访问者 HTTPS :443
    ↓
Nginx 终止 TLS
    ↓ HTTP，仅限本机
FRPS vhostHTTPPort :8080
    ↓
FRPC
    ↓
内网 Web :8080
```

Nginx 示例：

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

HTTPS `server` 块使用相同的 `location` 配置，并加载证书。证书申请与自动续期可继续参考站内的 [Nginx 反向代理](../nginx-reverse-proxy/) 和 [acme.sh HTTPS](../nginx-acme-https/) 文档。

这里必须保留原始 Host。FRPS 根据 `app.example.com` 选择 HTTP 代理；如果 Nginx 把 Host 改成其他值，FRPS 会找不到匹配项。

`vhostHTTPPort = 8080` 不需要对公网开放。云安全组和主机防火墙应阻止外部直接访问该端口，让所有 Web 流量先经过 Nginx 的认证、限流、日志和 HTTPS 配置。

## 使用 Systemd 管理 Linux frpc

创建 `/etc/systemd/system/frpc.service`：

```ini
[Unit]
Description=FRP client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=frp
Group=frp
ExecStartPre=/usr/local/bin/frpc verify -c /etc/frp/frpc.toml
ExecStart=/usr/local/bin/frpc -c /etc/frp/frpc.toml
Restart=on-failure
RestartSec=5s

NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

设置配置权限并启动：

```bash
sudo chown root:frp /etc/frp/frpc.toml
sudo chmod 0640 /etc/frp/frpc.toml
sudo -u frp /usr/local/bin/frpc verify -c /etc/frp/frpc.toml

sudo systemctl daemon-reload
sudo systemctl enable --now frpc
sudo systemctl status frpc
sudo journalctl -u frpc -f
```

如果 `localIP` 指向其他本机服务，要确保 `frp` 用户能够建立连接；如果服务只监听另一个网络命名空间或容器网络，还需要单独处理网络可达性。

## Windows 客户端部署 frpc

以下示例使用固定目录：

```text
C:\frp\frpc.exe
C:\frp\frpc.toml
C:\frp\token
C:\frp\logs\
```

### 准备目录与配置

以管理员身份打开 PowerShell：

```powershell
New-Item -ItemType Directory -Path C:\frp\logs -Force
```

把 `frpc.exe`、`frpc.toml` 和服务端的 Token 文件放入 `C:\frp`。配置与 Linux 保持相同逻辑：

```toml
serverAddr = "frp.example.com"
serverPort = 7000
clientID = "windows-home-01"

transport.protocol = "tcp"
transport.tls.enable = true

auth.method = "token"
auth.additionalScopes = ["HeartBeats", "NewWorkConns"]
auth.tokenSource.type = "file"
auth.tokenSource.file.path = "C:/frp/token"

log.to = "C:/frp/logs/frpc.log"
log.level = "info"
log.maxDays = 7

[[proxies]]
name = "windows-web"
type = "http"
localIP = "127.0.0.1"
localPort = 8080
customDomains = ["windows-app.example.com"]
```

限制目录 ACL，只允许系统和管理员读取：

```powershell
icacls C:\frp /inheritance:r
icacls C:\frp /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
```

### 先以前台方式验证

```powershell
Set-Location C:\frp
.\frpc.exe verify -c .\frpc.toml
.\frpc.exe -c .\frpc.toml
```

确认日志显示连接成功、代理注册成功，并从外部网络完成访问测试。前台调试通过后再配置开机任务。

### 使用 ScheduledTasks 开机运行

```powershell
$action = New-ScheduledTaskAction `
  -Execute 'C:\frp\frpc.exe' `
  -Argument '-c C:\frp\frpc.toml' `
  -WorkingDirectory 'C:\frp'

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName 'FRP Client' `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -User 'SYSTEM' `
  -RunLevel Highest `
  -Force
```

管理任务：

```powershell
Start-ScheduledTask -TaskName 'FRP Client'
Get-ScheduledTaskInfo -TaskName 'FRP Client'
Stop-ScheduledTask -TaskName 'FRP Client'
```

日志查看：

```powershell
Get-Content C:\frp\logs\frpc.log -Tail 100 -Wait
```

计划任务以 `SYSTEM` 身份运行，因此不要把配置放进某个普通用户的个人目录。修改 Token 或配置后，重新运行 `frpc.exe verify`，再重启任务。

## 防火墙与最小暴露

公网服务器建议只开放实际需要的端口：

| 端口 | 用途 | 公网策略 |
|---|---|---|
| `7000/tcp` | FRPC 连接 FRPS | 能限制客户端出口地址时尽量限制来源 |
| `6001/tcp` | 示例 SSH TCP 映射 | 只开放实际使用的远程端口，并限制来源 |
| `80/443` | Nginx Web 入口 | 按公开网站策略开放 |
| `8080/tcp` | FRPS HTTP VHost | 不对公网开放 |
| `7500/tcp` | Dashboard | 不对公网开放 |

`allowPorts` 控制 FRPC 可以向 FRPS 申请哪些 TCP 远程端口，云安全组和主机防火墙控制公网能否访问这些端口。两者作用不同，需要同时配置。

不要为了省事开放整个 `6000-6099`。配置允许范围可以保留扩展空间，防火墙只开放当前真正使用的 `remotePort`。

## 从内到外排障

出现连接失败时，不要一开始就反复重启。按数据路径逐层检查。

### 1. 检查内网本地服务

Linux：

```bash
ss -lntp
curl http://127.0.0.1:8080/
```

Windows：

```powershell
Get-NetTCPConnection
Test-NetConnection 127.0.0.1 -Port 8080
```

如果 FRPC 所在设备自己都无法访问 `localIP:localPort`，FRP 也无法转发。

### 2. 校验配置

```bash
frps verify -c /etc/frp/frps.toml
frpc verify -c /etc/frp/frpc.toml
```

Windows：

```powershell
C:\frp\frpc.exe verify -c C:\frp\frpc.toml
```

### 3. 检查进程状态和日志

```bash
systemctl status frps frpc
journalctl -u frps -u frpc --since "10 minutes ago"
```

Windows：

```powershell
Get-ScheduledTaskInfo -TaskName 'FRP Client'
Get-Content C:\frp\logs\frpc.log -Tail 100
```

### 4. 检查控制端口可达性

Windows：

```powershell
Test-NetConnection frp.example.com -Port 7000
```

Linux：

```bash
nc -vz frp.example.com 7000
```

### 5. 检查 Token、TLS 和版本

服务端与客户端必须读取相同 Token。修改 Token 文件后需要重启进程，因为文件 Token 在配置加载时读取，不会自动动态刷新。

如果服务端强制 TLS，旧客户端或显式关闭 TLS 的配置会被拒绝。混合版本出现异常时，先对照官方兼容窗口，并确认升级顺序是否为服务端在前、客户端在后。

### 6. 检查远程端口限制

TCP 代理申请的 `remotePort` 必须位于 `allowPorts` 范围内，并且没有超过 `maxPortsPerClient`。

### 7. 检查安全组与防火墙

云安全组放行不代表主机防火墙已放行，反过来也一样。检查端口监听和两层规则：

```bash
ss -lntp
```

### 8. 检查 HTTP Host 路由

在公网服务器本机测试 FRPS VHost：

```bash
curl -H 'Host: app.example.com' http://127.0.0.1:8080/
```

如果这个命令成功、外部 HTTPS 失败，问题通常在 DNS、Nginx 或证书；如果本机 VHost 就失败，检查 FRPC 代理名称、`customDomains`、内网服务和 FRP 日志。

### 9. 检查端口冲突

```bash
ss -lntp
```

确认 7000、8080 和需要的 `remotePort` 没有被其他 FRP 实例、Nginx 或系统服务占用。

## 安全边界

需要明确以下事实：

- Token 只验证 FRPC 是否可以连接 FRPS，不是业务级用户授权；
- TLS 加密链路不等于应用已经安全，仍需考虑证书身份校验；
- Dashboard 不应直接暴露互联网；
- HTTP 服务仍需应用登录、权限、CSRF 防护、限流、日志和安全更新；
- TCP 映射后的 SSH 或远程桌面会面对公网扫描和口令攻击；
- `allowPorts`、云安全组、主机防火墙和应用权限必须共同生效；
- FRP 不替代企业 VPN、零信任网关或细粒度访问代理；
- 不应直接公开数据库、缓存、容器引擎和基础设施管理接口。

## 生产环境检查清单

```text
1. FRP 版本和资产架构是否明确，下载文件是否校验 SHA-256
2. 是否先升级 frps，再升级 frpc
3. frps 是否设置 transport.tls.force = true
4. Token 是否从权限受限文件读取，且没有进入仓库和日志
5. 是否限制 allowPorts 与 maxPortsPerClient
6. Dashboard 是否只监听 127.0.0.1
7. 7500 和 8080 是否没有对公网开放
8. TCP remotePort 是否只开放当前实际使用的端口和来源
9. SSH、Web 等被代理服务是否拥有自己的认证与权限控制
10. frps/frpc 启动前是否执行 verify
11. Linux 是否由 Systemd 管理，Windows 是否由计划任务管理
12. Nginx 是否保留 Host 并统一终止 HTTPS
13. DNS、云安全组和主机防火墙是否同时验证
14. 是否监控 FRP 日志、异常连接和公网扫描
15. 是否准备 Token 轮换、版本升级和故障回退流程
```

## 参考资料

- [FRP 官方仓库与基础说明](https://github.com/fatedier/frp)
- [FRP Releases](https://github.com/fatedier/frp/releases)
- [FRP 配置校验](https://gofrp.org/en/docs/features/common/configure/)
- [FRP Token 认证](https://gofrp.org/en/docs/features/common/authentication/)
- [FRP HTTP 自定义域名代理](https://gofrp.org/en/docs/examples/vhost-http/)
- [FRP Systemd 部署](https://gofrp.org/en/docs/setup/systemd/)
- [Microsoft New-ScheduledTaskAction](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskaction)
- [CNFlyCat 的 FRP 教程](https://github.com/CNFlyCat/UsefulTutorials/tree/master/Frp%E5%86%85%E7%BD%91%E7%A9%BF%E9%80%8F%E6%90%AD%E5%BB%BA%E6%95%99%E5%AD%A6)

> 本文参考了 CNFlyCat 教程中的跨平台场景和章节组织，但正文、配置和安全建议均重新编写，并以 FRP 与 Microsoft 官方文档为准。
