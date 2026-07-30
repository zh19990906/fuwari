---
title: Docker 核心概念与安装检查
published: 2024-06-02
updated: 2026-07-30
description: 理解镜像、容器、仓库、网络和卷，并完成 Docker 环境检查。
tags: [Docker, 容器, 入门]
category: Docker
contentType: docs
docGroup: docker
docSection: 快速开始
docOrder: 10
draft: false
---

Docker 将应用及其运行依赖打包为镜像，再从镜像创建隔离的容器进程。容器不是虚拟机：它通常共享宿主机内核，但拥有独立的文件系统视图、网络和进程空间。

## 核心对象

- **镜像（image）**：只读模板，由多层文件系统组成。
- **容器（container）**：镜像的运行实例，拥有可写层和运行状态。
- **仓库（registry）**：保存与分发镜像，例如 Docker Hub 或私有仓库。
- **卷（volume）**：由 Docker 管理的持久化数据。
- **网络（network）**：容器之间以及容器与外部通信的连接方式。
- **Compose**：用一个 YAML 文件描述多容器应用。

## 安装后检查

```bash
docker version
docker info
docker compose version
```

运行测试容器：

```bash
docker run --rm hello-world
```

查看当前对象：

```bash
docker ps
docker images
docker volume ls
docker network ls
```

## Linux 权限说明

Docker 守护进程通常拥有较高系统权限。把用户加入 `docker` 组，基本等同于授予其控制宿主机 Docker 的高权限能力：

```bash
sudo usermod -aG docker "$USER"
```

重新登录后生效。生产服务器应限制 Docker Socket 的访问，不要将 `/var/run/docker.sock` 随意挂载给不可信容器。

## 第一个容器

```bash
docker run --name web-demo -d -p 8080:80 nginx:alpine
curl http://127.0.0.1:8080
docker logs web-demo
docker stop web-demo
docker rm web-demo
```

`-p 8080:80` 表示把宿主机 8080 端口映射到容器 80 端口。容器内监听地址也必须允许外部连接。

## 查看容器细节

```bash
docker inspect web-demo
docker stats
docker top web-demo
docker exec -it web-demo sh
```

容器镜像不一定包含 Bash，应根据镜像使用 `sh` 或其他 Shell。

## 生命周期原则

容器应以前台主进程为生命周期。不要依赖容器内手工启动后台服务，也不要把临时修改留在容器可写层中。可重复的修改应该进入 Dockerfile，数据应该进入卷或外部存储。

## 常用清理

```bash
docker container prune
docker image prune
docker system df
```

:::warning
`docker system prune` 可能删除未使用的镜像、容器和网络；增加 `--volumes` 还会删除未使用卷。执行前必须确认数据是否已经备份。
:::

## 参考资料

- [Docker Get Started](https://docs.docker.com/get-started/)
- [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/)
