---
title: Linux inode 不足与小文件排查
published: 2023-10-07
updated: 2026-07-30
description: 从 inode 使用率定位到目录分析、归档清理和文件系统规划的完整排障流程。
tags: [Linux, inode, ext4, 文件系统, 排障]
category: Linux
contentType: docs
docGroup: linux
docSection: 磁盘与文件系统
docOrder: 50
draft: false
---

磁盘还有剩余空间，却无法创建文件，并不一定是容量问题。Linux 文件系统还需要 inode 保存文件类型、权限、时间戳和数据块位置等元数据；大量小文件可能先耗尽 inode。

## inode 是什么

一个常规文件、目录、符号链接通常都会占用一个 inode。文件内容大小与 inode 数量不是同一个维度：一百万个 1 KB 小文件只占约 1 GB 数据空间，却可能耗尽为分区预留的 inode。

## 先确认是否真的耗尽

```bash
# 查看数据块容量
findmnt -T /var/lib/app
df -h /var/lib/app

# 查看 inode 使用率
df -i /var/lib/app
```

典型现象是 `IUse%` 接近 `100%`，同时应用出现 `No space left on device`。还要同时排除只读挂载、用户配额和目录权限问题：

```bash
findmnt -no OPTIONS /var/lib/app
quota -s 2>/dev/null || true
namei -l /var/lib/app
```

## 定位 inode 数量最多的目录

先在同一个文件系统内统计目录分布，`-xdev` 可以避免进入其他挂载点：

```bash
sudo find /var -xdev -printf '%h\n' \
  | sort \
  | uniq -c \
  | sort -nr \
  | head -n 30
```

对可疑目录继续缩小范围：

```bash
sudo find /var/lib -xdev -type f | wc -l
sudo find /var/lib/app -xdev -maxdepth 2 -type f \
  -printf '%h\n' | sort | uniq -c | sort -nr | head
```

只看 `du -sh` 容易漏掉问题，因为它主要回答“占了多少数据块”，而不是“创建了多少目录项”。

## 安全清理顺序

1. 查阅应用文档，确认哪些缓存、临时文件和任务产物允许删除。
2. 检查日志轮转是否生效，优先压缩或归档历史日志。
3. 对长期保存的大量小文件先打包，再转移到对象存储或归档盘。
4. 删除前检查文件是否仍被进程打开。
5. 清理后再次执行 `df -i`，确认 inode 使用率确实下降。

查看已删除但仍被进程占用的文件：

```bash
sudo lsof +L1
```

查找零字节文件只能作为线索，不能直接批量删除：

```bash
sudo find /var/lib/app -xdev -type f -size 0c -print
```

:::warning
不要把 `find ... -delete` 直接用于不了解的数据目录。先输出文件列表、抽样检查并准备备份，再执行删除。
:::

## ext4 创建时的 inode 规划

inode 数量通常在创建文件系统时决定。面向大量小文件的分区，可以在确认业务模型后选择更适合的使用类型：

```bash
sudo mkfs.ext4 -T small /dev/sdX1
sudo tune2fs -l /dev/sdX1 | grep -E 'Inode count|Block size|Inode size'
```

`-T small` 会影响块大小和 inode 密度，并不适合所有负载。小块可能增加大文件的元数据与寻址开销，因此需要用真实文件规模和读写模式做基准测试。

:::danger
`mkfs.ext4` 会重新创建文件系统并破坏原有数据。已有 ext4 文件系统的 inode 总量通常不能在原地安全扩大；正确流程是备份、重新规划文件系统、格式化并恢复数据。
:::

## 常见误区

- **磁盘没满就不是空间问题：** inode 耗尽同样会返回空间不足。
- **删除几个大文件就能恢复：** 一个大文件只释放一个 inode；应处理数量最多的小文件集合。
- **重启会恢复 inode：** inode 是文件系统资源，重启不会自动增加。
- **只提高 inode 数量：** 如果应用无上限地产生文件，最终仍会再次耗尽，应同时增加生命周期管理。

## 排障清单

```text
1. df -h 与 df -i 同时检查
2. 确认挂载点、只读状态、配额和权限
3. 使用 find -xdev 按目录统计文件数量
4. 找到文件产生者和保留策略
5. 先归档、再清理、最后复查
6. 长期修复写入日志轮转、缓存上限或对象存储方案
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
