---
title: Docker Engine API 的安全访问方式
published: 2023-05-15
updated: 2026-07-30
description: 对比 Unix Socket、SSH Context 与双向 TLS，避免将未认证的 Docker API 暴露到网络。
tags: [Docker, API, SSH, TLS, 安全]
category: Docker
contentType: docs
docGroup: docker
docSection: 安全与远程管理
docOrder: 50
draft: false
---

Docker Engine API 可以创建特权容器、挂载宿主机目录、读取环境变量并控制网络，因此它的权限通常接近宿主机 root。远程访问方案的第一目标不是“能连上”，而是限制谁能连接、通信是否加密，以及操作是否可审计。

## 本机优先使用 Unix Socket

默认 Docker CLI 通过 `/var/run/docker.sock` 与本机守护进程通信：

```bash
docker version
docker info
```

普通用户无法访问时，可以临时使用 `sudo`：

```bash
sudo docker version
```

也可以把受信任用户加入 `docker` 组，但需要明确：该组成员通常能够获得宿主机 root 级能力。

```bash
sudo usermod -aG docker "$USER"
```

重新登录后生效。生产服务器不应为了方便把大量账号加入该组。

## 推荐：通过 SSH 使用 Docker Context

Docker Context 可以复用 SSH 的密钥、主机校验和账号权限，无需额外暴露 Docker TCP 端口。

```bash
docker context create production \
  --docker "host=ssh://deploy@example.com"

docker --context production version
docker --context production ps
```

切回本机：

```bash
docker context use default
```

SSH 侧应继续采用常规安全措施：

- 禁止密码登录或限制为跳板机访问；
- 使用独立部署账号；
- 校验 `known_hosts`，不要长期关闭主机指纹检查；
- 限制账号能访问的 Docker 主机与网络范围；
- 定期轮换密钥并移除离职或失效账号。

## 危险反例：未认证的 2375

```text
危险：tcp://0.0.0.0:2375 没有传输加密和客户端认证，等同于把宿主机 root 级控制权交给能访问该端口的人。
```

即使端口暂时只在内网可见，也可能被同网段主机、错误路由、容器网络或后续防火墙变更访问。不要把“内网”当作认证机制。

## 必须使用 TCP 时启用双向 TLS

TCP 场景应使用 `2376`、服务端证书和客户端证书。证书至少需要：

- 独立 CA；
- 服务端证书包含正确的 DNS 名称或 IP SAN；
- 客户端证书具有客户端用途；
- 私钥权限严格限制；
- 防火墙只允许固定管理网段；
- 明确的到期时间与轮换流程。

一种 systemd drop-in 配置示例：

```ini
# /etc/systemd/system/docker.service.d/remote-api.conf
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd \
  -H unix:///var/run/docker.sock \
  -H tcp://0.0.0.0:2376 \
  --tlsverify \
  --tlscacert=/etc/docker/tls/ca.pem \
  --tlscert=/etc/docker/tls/server-cert.pem \
  --tlskey=/etc/docker/tls/server-key.pem
```

应用前先检查配置目录、证书和备份终端：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
sudo systemctl status docker --no-pager
sudo ss -lntp | grep 2376
```

客户端使用环境变量或 Docker Context，避免在每条命令重复证书路径：

```bash
export DOCKER_HOST='tcp://docker.example.com:2376'
export DOCKER_TLS_VERIFY='1'
export DOCKER_CERT_PATH="$HOME/.docker/production-tls"

docker version
```

:::warning
修改 Docker 的 systemd `ExecStart` 有使守护进程无法启动的风险。操作前保留当前 SSH 会话、备份配置，并准备通过控制台回滚。
:::

## Python SDK

本机或已经配置好 Docker 环境变量时，优先让 SDK 读取标准配置：

```python
import docker

client = docker.from_env()
print(client.version()["Version"])
```

不要在源码中写固定的远程地址、证书私钥或仓库密码。应用需要远程管理 Docker 时，应通过受控服务账号、最小网络范围和审计日志限制风险。

## 验证与审计

```bash
# 确认监听地址
sudo ss -lntp | grep dockerd

# 查看最近的守护进程日志
sudo journalctl -u docker --since today --no-pager

# 查看 Context 配置
docker context ls
docker context inspect production
```

建议定期检查：

1. 是否仍有 `2375` 监听；
2. 防火墙规则是否超出预期；
3. 客户端证书是否即将过期；
4. SSH 密钥和服务账号是否仍然有效；
5. 自动化系统是否记录了高风险操作。

## 选择建议

| 场景 | 推荐方案 |
|---|---|
| 本机开发 | Unix Socket |
| 少量远程主机运维 | Docker Context over SSH |
| 自动化平台必须走 TCP | 双向 TLS + 防火墙白名单 |
| 公网直接暴露 | 不推荐；增加 VPN、专用网络或受控网关 |

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
