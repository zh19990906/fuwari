---
title: Linux 网络、磁盘与空间排查
published: 2025-06-15
updated: 2026-07-30
description: 使用 ip、ss、curl、df、du、lsblk 等工具定位网络与磁盘问题。
tags: [Linux, 网络, 磁盘, 排障]
category: Linux
contentType: docs
docGroup: linux
docSection: 服务与排障
docOrder: 40
draft: false
---

网络和磁盘问题经常表现为“应用超时”“写入失败”或“服务突然退出”。排查时应从本机状态开始，再逐层确认 DNS、路由、端口、文件系统和底层设备。

## 网络接口与路由

```bash
ip address
ip link
ip route
ip route get 1.1.1.1
```

`ip route get` 可以显示访问目标地址时系统会选择的接口、网关和源地址。

## DNS 排查

```bash
getent hosts example.com
resolvectl status
resolvectl query example.com
cat /etc/resolv.conf
```

先区分“域名无法解析”和“目标地址无法连接”。直接使用 IP 成功但域名失败，通常应优先检查 DNS。

## 端口与连接

```bash
ss -lntup
ss -ntp
ss -s
```

测试 HTTP：

```bash
curl -I https://example.com
curl -v --connect-timeout 5 https://example.com
```

测试 TCP 端口：

```bash
nc -vz database.example.com 5432
```

如果系统没有 `nc`，可以使用 Bash 的 `/dev/tcp`，但可读性和兼容性不如专用工具。

## 防火墙

不同发行版可能使用 nftables、firewalld 或 ufw：

```bash
sudo nft list ruleset
sudo firewall-cmd --list-all
sudo ufw status verbose
```

修改防火墙前确认远程管理端口，避免把自己锁在服务器外。

## 文件系统空间

```bash
df -hT
df -i
```

磁盘容量充足但无法创建文件时，要检查 inode 是否耗尽。定位大目录：

```bash
sudo du -xhd1 /var | sort -h
sudo du -xhd1 /var/lib | sort -h
```

`-x` 限制在同一个文件系统内，避免进入挂载的网络盘或其他分区。

## 查找大文件

```bash
sudo find /var -xdev -type f -size +1G -printf '%s %p\n' | sort -n
```

文件被删除但空间没有释放时，可能仍被进程打开：

```bash
sudo lsof +L1
```

处理方式通常是让对应进程正常重载或重启，而不是直接操作 `/proc` 中的文件描述符。

## 块设备与挂载

```bash
lsblk -f
findmnt
mount | column -t
blkid
```

查看内核最近的存储错误：

```bash
dmesg -T | tail -n 100
journalctl -k -p warning --since today
```

## 挂载配置

`/etc/fstab` 修改错误可能导致启动失败。修改后先验证：

```bash
sudo mount -a
findmnt --verify
```

对网络存储和可选磁盘可以考虑 `nofail`、`x-systemd.automount` 等选项，但应理解它们对启动和访问延迟的影响。

## 排查流程

### 网络

1. `ip address`：接口是否有正确地址。
2. `ip route`：默认路由是否存在。
3. `getent hosts`：DNS 是否正常。
4. `ss -lntup`：本地服务是否监听。
5. `curl -v` 或 `nc -vz`：连接在哪一步失败。
6. 检查防火墙、云安全组、代理和容器网络。

### 磁盘

1. `df -hT`：容量和文件系统类型。
2. `df -i`：inode。
3. `du`：空间主要消耗位置。
4. `lsof +L1`：已删除但仍占用的文件。
5. `dmesg`、`journalctl -k`：设备或文件系统错误。
6. 确认备份后再执行清理或修复。

## 参考资料

- [iproute2 文档](https://wiki.linuxfoundation.org/networking/iproute2)
- [util-linux 手册](https://www.kernel.org/pub/linux/utils/util-linux/)
