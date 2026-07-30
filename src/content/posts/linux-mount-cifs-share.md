---
title: Linux 挂载 Windows SMB/CIFS 共享目录
published: 2022-08-29
updated: 2026-07-30
description: 使用 CIFS 手动挂载共享目录，并通过凭据文件和 fstab 实现安全的持久挂载。
tags: [Linux, SMB, CIFS, Windows, 挂载]
category: Linux
contentType: docs
docGroup: linux
docSection: 文件系统与挂载
docOrder: 60
draft: false
---

SMB/CIFS 常用于在 Windows、NAS 和 Linux 之间共享文件。Linux 可以通过内核的 CIFS 客户端把远程共享目录挂载到本地路径。

## 安装客户端工具

Ubuntu/Debian：

```bash
sudo apt update
sudo apt install -y cifs-utils
```

RHEL/Fedora：

```bash
sudo dnf install -y cifs-utils
```

## 手动挂载

先创建挂载点：

```bash
sudo mkdir -p /mnt/team-share
```

使用环境变量避免把用户名直接写死在命令中：

```bash
export SMB_USER='your-user'

sudo mount -t cifs //fileserver.example.com/team /mnt/team-share \
  -o username="$SMB_USER",vers=3.0,uid=$(id -u),gid=$(id -g),file_mode=0640,dir_mode=0750
```

命令会交互式询问密码。挂载完成后检查：

```bash
findmnt /mnt/team-share
mountpoint /mnt/team-share
ls -la /mnt/team-share
```

## 使用凭据文件

长期挂载不应把密码直接写在命令历史或 `/etc/fstab` 中。创建仅 root 可读的凭据文件：

```bash
sudo install -m 600 /dev/null /etc/samba/credentials-team
sudoedit /etc/samba/credentials-team
```

内容示例：

```ini
username=your-user
password=replace-with-a-secret
# domain=EXAMPLE
```

再次确认权限：

```bash
sudo chown root:root /etc/samba/credentials-team
sudo chmod 600 /etc/samba/credentials-team
```

## 配置开机挂载

在 `/etc/fstab` 中增加：

```fstab
//fileserver.example.com/team /mnt/team-share cifs credentials=/etc/samba/credentials-team,vers=3.0,_netdev,nofail,uid=1000,gid=1000,file_mode=0640,dir_mode=0750 0 0
```

参数含义：

- `credentials`：读取独立凭据文件。
- `vers=3.0`：优先使用现代 SMB 协议，旧设备可能需要单独确认版本。
- `_netdev`：标记为依赖网络的挂载。
- `nofail`：远程服务不可用时不阻塞系统启动。
- `uid`、`gid`：把远程文件映射给本地用户。
- `file_mode`、`dir_mode`：控制本地看到的默认权限。

测试配置时不要直接重启：

```bash
sudo umount /mnt/team-share 2>/dev/null || true
sudo mount -a
findmnt /mnt/team-share
```

## systemd 自动挂载

网络环境不稳定时，可以在 `fstab` 参数中加入：

```text
x-systemd.automount,x-systemd.idle-timeout=300
```

这样访问目录时才触发挂载，空闲后可以自动释放连接。修改后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart remote-fs.target
```

## 常见错误

### `mount error(13): Permission denied`

- 检查共享目录权限与账号权限。
- 检查用户名是否需要域前缀。
- 确认凭据文件没有多余空格或不可见字符。
- 查看内核日志：

```bash
sudo dmesg | tail -n 50
journalctl -b --no-pager | grep -i cifs
```

### `mount error(95): Operation not supported`

服务端与客户端协议版本可能不匹配。先确认服务端支持的 SMB 版本，再尝试 `vers=3.1.1`、`3.0` 或 `2.1`。不要为了兼容轻易退回 SMB 1.0。

### 主机名无法解析

```bash
getent hosts fileserver.example.com
nc -vz fileserver.example.com 445
```

确认 DNS、路由和防火墙允许 TCP 445。

### 文件归属不正确

本地 `uid`、`gid` 与实际登录用户不一致时，可以查询：

```bash
id
```

再调整挂载参数。多人共用时应结合组权限、`forceuid`/`forcegid` 的实际效果和服务端 ACL 设计，不要只依赖宽松的 `0777`。

:::warning
不要把密码直接写进 shell 命令、脚本、Git 仓库或 `/etc/fstab`。凭据泄露后应立即修改服务端密码，并清理命令历史和日志副本。
:::

## 卸载

```bash
sudo umount /mnt/team-share
```

目录繁忙时先定位占用进程：

```bash
sudo fuser -vm /mnt/team-share
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
