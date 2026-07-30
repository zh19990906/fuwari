---
title: Linux 进程、systemd 服务与日志排查
published: 2024-08-11
updated: 2026-07-30
description: 从进程状态、systemd 单元到 journal 日志建立标准排障流程。
tags: [Linux, systemd, journalctl, 进程]
category: Linux
contentType: docs
docGroup: linux
docSection: 服务与排障
docOrder: 30
draft: false
---

服务不可用时，不要直接反复重启。先确认进程是否存在、端口是否监听、systemd 为什么判定失败，以及应用在退出前记录了什么。

## 查看进程

```bash
ps aux
ps -eo pid,ppid,user,stat,%cpu,%mem,etime,cmd --sort=-%cpu | head
pgrep -af nginx
```

常见进程状态：

- `R`：正在运行或等待 CPU。
- `S`：可中断睡眠，通常在等待事件。
- `D`：不可中断睡眠，常见于磁盘或网络存储等待。
- `Z`：僵尸进程，子进程已退出但父进程未回收。

## 查看资源

```bash
top
free -h
vmstat 1
iostat -xz 1
```

`top` 适合快速观察，`vmstat` 可以区分 CPU、内存和 I/O 压力。`iostat` 通常由 `sysstat` 软件包提供。

## systemd 常用命令

```bash
systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
systemctl is-enabled nginx
systemctl is-active nginx
```

配置支持热加载时优先使用 `reload`，可以减少连接中断。修改单元文件后运行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart myapp
```

## 查看单元配置

```bash
systemctl cat myapp
systemctl show myapp
systemctl list-dependencies myapp
```

不要直接修改软件包提供的 `/usr/lib/systemd/system/*.service`。使用覆盖配置：

```bash
sudo systemctl edit myapp
```

例如设置环境变量和重启策略：

```ini
[Service]
Environment="APP_ENV=production"
Restart=on-failure
RestartSec=5s
```

## journalctl

```bash
journalctl -u myapp
journalctl -u myapp -n 100 --no-pager
journalctl -u myapp -f
journalctl -u myapp --since '2026-07-30 08:00'
journalctl -p err..alert --since today
```

查看本次启动：

```bash
journalctl -b
journalctl -u myapp -b
```

查看上一次启动：

```bash
journalctl -b -1
```

## 端口与连接

```bash
ss -lntup
ss -lntp 'sport = :8080'
curl -v http://127.0.0.1:8080/health
```

进程存在但服务不可访问时，确认它监听的是 `127.0.0.1`、`0.0.0.0` 还是 IPv6 地址，并检查防火墙、反向代理和容器端口映射。

## 信号与停止进程

```bash
kill -TERM PID
kill -HUP PID
kill -KILL PID
```

`TERM` 请求正常退出，`HUP` 常被服务用于重新加载配置，`KILL` 无法被捕获，会跳过清理逻辑。优先使用服务管理器停止服务：

```bash
sudo systemctl stop myapp
```

## 标准排障顺序

1. `systemctl status myapp` 查看摘要和退出码。
2. `journalctl -u myapp -n 200` 查看完整错误。
3. `systemctl cat myapp` 检查启动命令、用户和环境。
4. 以服务账户手动验证配置或启动命令。
5. 使用 `ss` 确认端口。
6. 检查磁盘、内存、权限和依赖服务。
7. 修复根因后再重启并观察日志。

## 参考资料

- [systemctl](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [journalctl](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html)
