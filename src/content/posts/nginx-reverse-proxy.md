---
title: Nginx 反向代理与常用代理头
published: 2022-09-14
updated: 2026-07-30
description: 从基础代理配置到 WebSocket、超时、上传限制和 502/504 排查。
tags: [Nginx, 反向代理, WebSocket, HTTP, 部署]
category: Nginx
contentType: docs
docGroup: nginx
docSection: 反向代理
docOrder: 10
draft: false
---

Nginx 反向代理接收客户端请求，再把请求转发到后端应用。它常用于统一域名、终止 TLS、限制上传大小、设置超时和隐藏内部服务端口。

## 基础配置

```nginx
server {
    listen 80;
    server_name app.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

保存后先检查语法，再平滑重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

不要在未通过 `nginx -t` 时直接重启，错误配置可能让服务无法恢复。

## 常用代理头

| Header | 作用 |
|---|---|
| `Host` | 把用户访问的域名传给后端 |
| `X-Real-IP` | 传递当前客户端地址 |
| `X-Forwarded-For` | 追加经过的代理链路地址 |
| `X-Forwarded-Proto` | 告诉后端原请求是 HTTP 还是 HTTPS |

后端框架必须只信任受控代理写入的这些头。应用直接暴露到公网时，客户端可以伪造 `X-Forwarded-For`；应在框架中配置可信代理数量或可信网段，而不是无条件接受任意值。

## `proxy_pass` 尾斜杠

路径是否保留与尾斜杠有关：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
}
```

请求 `/api/users` 会被转发为 `/users`。

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
}
```

请求路径通常保留 `/api/users`。修改代理路径后应使用真实 URI 做测试，避免接口突然出现 404。

## WebSocket

WebSocket 升级需要 HTTP/1.1 和升级头：

```nginx
location /ws/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

多个 location 都需要 WebSocket 时，可以使用 `map`：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

然后：

```nginx
proxy_set_header Connection $connection_upgrade;
```

## 超时

```nginx
proxy_connect_timeout 5s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
send_timeout 60s;
```

- `proxy_connect_timeout`：建立到上游连接的时间；
- `proxy_send_timeout`：把请求发送给上游时，两次写操作之间的等待；
- `proxy_read_timeout`：从上游读取响应时，两次读操作之间的等待；
- `send_timeout`：向客户端发送响应时的等待。

不要为了掩盖慢查询把所有超时改成数小时。先定位上游性能、数据库锁和外部依赖，再为长任务设计异步接口。

## 上传大小与缓冲

```nginx
client_max_body_size 100m;
client_body_timeout 30s;
proxy_request_buffering off;
```

`proxy_request_buffering off` 会让请求体流式发送到后端，适合某些大文件上传，但后端必须能处理慢客户端和中断。普通接口保持默认缓冲更容易保护上游。

响应流或 Server-Sent Events 可以考虑：

```nginx
proxy_buffering off;
proxy_cache off;
```

不要全局关闭缓冲，否则会增加上游连接占用。

## 静态文件与应用分离

```nginx
server {
    listen 80;
    server_name app.example.com;

    location /assets/ {
        alias /srv/app/assets/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`alias` 与 `root` 的路径拼接规则不同。改动后用实际文件验证，并确保 Nginx 工作用户有读取权限。

## 502 与 504 排查

### 502 Bad Gateway

通常表示 Nginx 无法与上游正常通信：

```bash
curl -v http://127.0.0.1:8000/health
sudo ss -lntp | grep 8000
sudo journalctl -u nginx --since today --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

检查：

- 应用是否启动；
- 监听地址与端口是否一致；
- Unix Socket 权限；
- 容器端口映射；
- SELinux 或防火墙；
- 上游是否提前关闭连接。

### 504 Gateway Timeout

表示连接成功，但上游在超时前没有返回完整响应。应同时检查应用日志、数据库慢查询、外部 API 和线程/连接池耗尽。

## 配置拆分

可以把通用代理头放入片段：

```nginx
# /etc/nginx/snippets/proxy-headers.conf
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

引用：

```nginx
include snippets/proxy-headers.conf;
```

拆分配置后仍应通过 `nginx -T` 查看最终展开结果：

```bash
sudo nginx -T | less
```

## 上线检查清单

```text
1. nginx -t 通过
2. 域名解析到正确主机
3. 后端只监听必要的本地或容器网络地址
4. 代理头与框架可信代理配置一致
5. 上传大小和超时符合业务需求
6. WebSocket/SSE 路径单独验证
7. 日志中没有持续 502/504
8. reload 后旧连接可正常完成
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
