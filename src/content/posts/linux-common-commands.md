---
title: Linux 常用命令速查
published: 2023-06-18
updated: 2026-07-30
description: 按文件、文本、进程、网络和系统信息整理常用 Linux 命令。
tags: [Linux, Shell, 命令行]
category: Linux
contentType: docs
docGroup: linux
docSection: 命令基础
docOrder: 10
draft: false
---

这份速查表以 GNU/Linux 常见工具为主。macOS 的部分参数不同，执行破坏性命令前应先阅读 `man` 页面。

## 文件与目录

```bash
pwd                    # 当前目录
ls -lah                # 包含隐藏文件和可读大小
cd /path/to/dir
mkdir -p app/logs
cp -a source target    # 尽量保留属性
mv old new
rm -i file             # 删除前确认
find . -type f -name '*.log'
```

:::warning
`rm -rf` 不经过回收站。变量为空、路径拼错或当前目录判断错误都可能造成严重数据损失。
:::

## 查看文件

```bash
cat file.txt
less file.txt
head -n 20 file.txt
tail -n 100 file.txt
tail -f app.log
wc -l file.txt
file archive.tar.gz
```

## 文本搜索与处理

```bash
grep -Rni 'error' ./logs
grep -v '^#' app.conf
cut -d: -f1 /etc/passwd
sort names.txt | uniq -c | sort -nr
sed -n '10,30p' file.txt
awk '{print $1, $NF}' access.log
```

组合命令时，先逐段确认输出，再用管道连接：

```bash
journalctl -u nginx --since today | grep -i error | tail -n 50
```

## 压缩与归档

```bash
tar -czf backup.tar.gz directory/
tar -xzf backup.tar.gz
zip -r backup.zip directory/
unzip backup.zip
```

## 系统信息

```bash
uname -a
cat /etc/os-release
hostnamectl
uptime
date
timedatectl
free -h
lscpu
lsblk
```

## 进程与资源

```bash
ps aux
ps -ef | grep process-name
pgrep -af process-name
top
kill PID
kill -TERM PID
```

优先发送 `TERM` 让程序清理资源；只有进程无法响应时才考虑 `KILL`：

```bash
kill -KILL PID
```

## 网络基础

```bash
ip address
ip route
ss -lntup
ping -c 4 example.com
curl -I https://example.com
curl -v https://example.com
getent hosts example.com
```

## 权限和用户

```bash
id
whoami
sudo -l
chmod u+x script.sh
chown user:group file
```

## 获取帮助

```bash
man command
command --help
apropos keyword
type command
```

`type` 可以确认一个名称究竟是外部程序、Shell 内建命令、函数还是别名。

## 参考资料

- [GNU Coreutils 手册](https://www.gnu.org/software/coreutils/manual/)
- [Linux man-pages](https://www.kernel.org/doc/man-pages/)
