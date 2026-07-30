---
title: Docker 数据持久化与常见故障排查
published: 2025-05-18
updated: 2026-07-30
description: 区分卷与绑定挂载，并按日志、端口、网络、权限和资源排查容器故障。
tags: [Docker, Volume, 排障, 网络]
category: Docker
contentType: docs
docGroup: docker
docSection: 数据与排障
docOrder: 40
draft: false
---

容器可写层不适合保存重要数据。容器被删除或重建时，业务数据应仍然存在于卷、绑定挂载或外部存储中。

## 卷与绑定挂载

命名卷：

```bash
docker volume create app-data
docker run --rm -v app-data:/data alpine sh -c 'date > /data/created-at'
docker run --rm -v app-data:/data alpine cat /data/created-at
```

绑定挂载：

```bash
docker run --rm -v "$PWD/config:/app/config:ro" alpine ls -la /app/config
```

- 命名卷由 Docker 管理，适合数据库和应用持久化数据。
- 绑定挂载直接映射宿主机路径，适合配置、源码和明确需要宿主机管理的文件。
- 配置文件尽量使用只读挂载 `:ro`。

## 备份命名卷

```bash
docker run --rm \
  -v app-data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine tar -czf /backup/app-data.tar.gz -C /source .
```

恢复前先停止写入该卷的服务，并验证备份文件可读取。

## 容器反复退出

```bash
docker ps -a
docker logs --tail 200 container-name
docker inspect container-name --format '{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}'
```

常见退出码：

- `0`：主进程正常结束，可能是启动命令本来就不是长期进程。
- `1`：应用通用错误，应查看日志。
- `126`：命令存在但不可执行，常见于权限问题。
- `127`：命令不存在或 PATH 不正确。
- `137`：常见于被 `SIGKILL` 终止，包括内存不足。

检查 OOM：

```bash
docker inspect container-name --format '{{.State.OOMKilled}}'
dmesg -T | grep -i -E 'out of memory|killed process'
```

## 端口无法访问

```bash
docker port container-name
docker inspect container-name --format '{{json .NetworkSettings.Ports}}'
ss -lntp
curl -v http://127.0.0.1:8080
```

确认四件事：

1. 应用在容器内实际监听目标端口；
2. 应用监听 `0.0.0.0`，而不是只监听容器内 `127.0.0.1`；
3. `-p` 或 Compose 的端口映射正确；
4. 宿主机防火墙和云安全组允许访问。

## 容器之间无法连接

```bash
docker network ls
docker network inspect network-name
docker exec app getent hosts db
docker exec app sh -c 'nc -vz db 5432'
```

同一 Compose 项目的服务通常通过服务名互相解析。不要把其他容器地址写成 `localhost`。

## 权限问题

宿主机目录的 UID/GID 与容器内用户可能不同：

```bash
docker exec container-name id
ls -ln mounted-directory
```

优先让容器以明确 UID/GID 运行，并设置宿主机目录所有者。避免用 `chmod 777` 解决数据库目录或密钥文件权限。

## 空间占用

```bash
docker system df -v
docker container ls -a
docker image ls
docker volume ls
```

清理前逐项确认：

```bash
docker container prune
docker image prune
docker builder prune
```

不要在不清楚卷用途时执行 `docker volume prune`。

## 标准排障流程

1. `docker ps -a` 确认状态和退出时间。
2. `docker logs` 查看应用错误。
3. `docker inspect` 检查命令、环境、挂载、网络和退出码。
4. `docker exec` 在容器内验证进程、DNS、端口和文件权限。
5. 检查宿主机内存、磁盘、防火墙和内核日志。
6. 修复 Dockerfile 或 Compose 配置，不依赖手工修改运行中的容器。

## 参考资料

- [Docker volumes](https://docs.docker.com/engine/storage/volumes/)
- [Docker networking](https://docs.docker.com/engine/network/)
