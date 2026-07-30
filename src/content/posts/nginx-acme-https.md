---
title: Nginx 使用 acme.sh 申请证书并自动续期
published: 2025-10-09
updated: 2026-07-30
description: 使用 Webroot 完成证书申请、安装、Nginx HTTPS 配置和自动续期检查。
tags: [Nginx, HTTPS, acme.sh, TLS, Let's Encrypt]
category: Nginx
contentType: docs
docGroup: nginx
docSection: HTTPS 与安全
docOrder: 20
draft: false
---

HTTPS 部署包含四个环节：域名解析、ACME 验证、证书安装和续期后的自动重载。证书“申请成功”并不代表 Nginx 已经使用了新证书，安装路径和 reload hook 同样重要。

## 前置条件

开始前确认：

1. `app.example.com` 已解析到当前服务器；
2. 公网可以访问 TCP 80 和 443；
3. Nginx 已能通过 HTTP 提供一个 Webroot 目录；
4. 服务器时间正确；
5. 使用具备 `sudo` 权限的维护账号。

```bash
getent hosts app.example.com
sudo ss -lntp | grep -E ':80|:443'
timedatectl status
```

## 安装 Nginx 与必要工具

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y nginx curl socat
sudo systemctl enable --now nginx
```

检查配置：

```bash
sudo nginx -t
systemctl status nginx --no-pager
```

## 准备 HTTP Webroot

```bash
sudo mkdir -p /var/www/app.example.com/.well-known/acme-challenge
sudo chown -R www-data:www-data /var/www/app.example.com
```

HTTP 配置：

```nginx
server {
    listen 80;
    server_name app.example.com;

    root /var/www/app.example.com;

    location ^~ /.well-known/acme-challenge/ {
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 200 "HTTPS setup in progress\n";
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

从外部网络验证挑战目录可访问，而不仅是在本机执行 `curl 127.0.0.1`。

## 安装 acme.sh

```bash
curl https://get.acme.sh | sh -s email=admin@example.com
```

重新加载 shell 环境，或直接使用完整路径：

```bash
~/.acme.sh/acme.sh --version
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
```

安装脚本来自网络。生产环境可以先下载、审阅，再执行；同时应记录安装版本和升级方式。

## 申请证书

```bash
~/.acme.sh/acme.sh --issue \
  -d app.example.com \
  --webroot /var/www/app.example.com
```

多个具体域名可以重复使用 `-d`：

```bash
~/.acme.sh/acme.sh --issue \
  -d app.example.com \
  -d api.example.com \
  --webroot /var/www/app.example.com
```

Webroot 模式要求每个域名的挑战请求都能到达同一个目录。通配符证书不能通过 HTTP Webroot 完成，通常需要 DNS API 验证。

## 安装证书到稳定路径

不要让 Nginx 直接引用 `~/.acme.sh/` 内部工作目录。创建专用目录：

```bash
sudo mkdir -p /etc/nginx/ssl/app.example.com
```

安装证书并配置续期后重载：

```bash
~/.acme.sh/acme.sh --install-cert -d app.example.com \
  --key-file /etc/nginx/ssl/app.example.com/private.key \
  --fullchain-file /etc/nginx/ssl/app.example.com/fullchain.pem \
  --reloadcmd "sudo systemctl reload nginx"
```

私钥权限：

```bash
sudo chown root:root /etc/nginx/ssl/app.example.com/private.key
sudo chmod 600 /etc/nginx/ssl/app.example.com/private.key
```

`reloadcmd` 必须在当前安装方式下能够无交互执行。使用 sudo 时应只授予重载 Nginx 所需的最小权限，不要为 acme.sh 开放任意 root 命令。

## 配置 HTTPS

```nginx
server {
    listen 80;
    server_name app.example.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/app.example.com;
        default_type text/plain;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/nginx/ssl/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/app.example.com/private.key;

    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

验证：

```bash
curl -I https://app.example.com
openssl s_client \
  -connect app.example.com:443 \
  -servername app.example.com </dev/null
```

## 自动续期

acme.sh 安装时通常会注册计划任务。检查：

```bash
crontab -l
~/.acme.sh/acme.sh --cron --home ~/.acme.sh
```

查看证书列表：

```bash
~/.acme.sh/acme.sh --list
```

可以使用测试环境或强制续期验证完整链路，但不要频繁请求生产证书，以免触发 CA 限制。验证目标包括：

- 新证书写入稳定路径；
- 文件权限仍正确；
- `nginx -t` 通过；
- reload hook 成功；
- 外部客户端看到新的到期时间。

## DNS 验证与通配符证书

通配符示例：

```text
*.example.com
```

需要创建 `_acme-challenge.example.com` 的 TXT 记录。推荐使用受限的 DNS API 令牌，并只授权修改目标 DNS Zone；不要把全局云账号密钥放在脚本中。

DNS API 变量名称与提供商有关，应查阅 acme.sh 对应 DNS 插件的说明，并通过权限最小化和密钥轮换降低风险。

## 常见问题

### 验证请求 404

- Webroot 路径和 Nginx `root` 不一致；
- 其他 location 提前拦截；
- CDN、WAF 或反向代理没有把挑战路径转发到当前主机；
- 域名解析仍指向旧地址。

```bash
sudo nginx -T | grep -n -A10 -B5 acme-challenge
```

### 端口 80 无法访问

检查云防火墙、系统防火墙、运营商限制和上游负载均衡。HTTP-01 验证要求 CA 能从公网访问端口 80。

### 续期成功但网站仍显示旧证书

- Nginx 引用的不是 `--install-cert` 目标路径；
- reload hook 失败；
- 前面还有 CDN 或负载均衡器终止 TLS；
- 浏览器或监控检查了另一个域名。

### 私钥权限过宽

私钥只应对必要的 root/Nginx 读取路径开放。不要把 `/etc/nginx/ssl` 整体设为 `777`。

## 上线检查清单

```text
1. 域名解析、80 和 443 均从外网验证
2. 挑战目录只提供验证文件
3. Nginx 引用稳定证书路径
4. 私钥权限最小化
5. nginx -t 后再 reload
6. 自动续期任务存在
7. reload hook 已真实演练
8. 监控证书到期时间和续期失败日志
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
