---
title: Linux 文件系统、用户与权限
published: 2023-11-05
updated: 2026-07-30
description: 理解目录结构、所有者、权限位、sudo 和安全的文件操作方式。
tags: [Linux, 权限, chmod, chown]
category: Linux
contentType: docs
docGroup: linux
docSection: 系统基础
docOrder: 20
draft: false
---

Linux 权限问题通常来自三个方面：文件属于谁、当前进程以谁的身份运行、路径上的每一级目录是否允许访问。

## 常见目录

- `/etc`：系统和服务配置。
- `/var`：日志、缓存、数据库等可变数据。
- `/home`：普通用户主目录。
- `/root`：root 用户主目录。
- `/tmp`：临时文件，可能在重启后清理。
- `/usr`：系统安装的软件和共享资源。
- `/opt`：第三方或自包含应用。
- `/srv`：服务提供的数据。

不要把应用数据随意散落在系统目录中。部署时明确配置、程序、日志和持久化数据的位置。

## 查看权限

```bash
ls -ld /path/to/file
stat /path/to/file
namei -l /path/to/file
```

典型输出：

```text
-rw-r----- 1 app app 1280 Jul 30 09:00 config.yaml
```

第一组是所有者权限，第二组是所属组权限，第三组是其他用户权限。

- `r`：读取。
- `w`：写入。
- `x`：执行；对目录来说表示可以进入和访问其中条目。

## 修改权限

符号写法更容易读：

```bash
chmod u+x deploy.sh
chmod g+r config.yaml
chmod o-rwx secret.env
```

数字写法：

```bash
chmod 640 config.yaml
chmod 750 deploy.sh
```

对应关系：读取 `4`、写入 `2`、执行 `1`。

## 修改所有者

```bash
sudo chown app:app /srv/myapp/config.yaml
sudo chown -R app:app /srv/myapp/data
```

递归修改前先确认路径。对系统根目录或不确定变量使用 `-R` 风险很高。

## 用户与组

```bash
id
id app
getent passwd app
getent group docker
sudo usermod -aG docker app
```

新增组成员后，用户通常需要重新登录才能获得新的组列表。

## sudo 的正确使用

```bash
sudo -l
sudo systemctl restart nginx
```

尽量只让需要权限的命令通过 `sudo` 执行，不要长期使用 root Shell。编辑受保护文件时可使用：

```bash
sudoedit /etc/nginx/nginx.conf
```

## 默认权限与 umask

```bash
umask
umask -S
```

`umask` 会从程序请求的默认权限中屏蔽位。服务创建的文件权限异常时，应同时检查服务账户、启动脚本和 systemd 中的 `UMask=` 设置。

## 特殊权限

- setuid：程序以文件所有者身份执行。
- setgid：目录中的新文件继承目录所属组。
- sticky bit：共享目录中用户只能删除自己拥有的文件。

共享协作目录常见配置：

```bash
sudo chown -R root:developers /srv/project
sudo chmod 2775 /srv/project
```

## 权限排查顺序

1. 使用 `id` 确认当前身份和组。
2. 使用 `namei -l` 检查完整路径。
3. 使用 `ls -l`、`stat` 检查目标文件。
4. 确认进程实际运行账户。
5. 再判断是否需要修改权限或所有者。

不要用 `chmod 777` 掩盖根因。它会让所有用户可写，可能引入配置篡改和代码执行风险。

## 参考资料

- [GNU Coreutils：文件权限](https://www.gnu.org/software/coreutils/manual/html_node/File-permissions.html)
- [systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
