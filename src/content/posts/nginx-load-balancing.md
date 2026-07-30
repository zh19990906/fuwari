---
title: Nginx 负载均衡：轮询、权重与最少连接
published: 2022-08-23
updated: 2026-07-30
description: 使用 upstream 配置轮询、权重、最少连接和会话策略，并整理故障与观测要点。
tags: [Nginx, 负载均衡, upstream, least_conn, 高可用]
category: Nginx
contentType: docs
docGroup: nginx
docSection: 负载均衡
docOrder: 30
draft: false
---

Nginx 可以把请求分发到多个上游实例，降低单机压力并支持滚动发布。负载均衡算法只能决定“把请求发给谁”，不能替代应用健康检查、会话设计、容量规划和数据库高可用。

## 基础 upstream

```nginx
upstream app_backend {
    server 192.0.2.11:8000 max_fails=3 fail_timeout=30s;
    server 192.0.2.12:8000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

默认算法是轮询。请求依次分配给可用上游，但不会保证在任意短时间窗口内绝对平均。

## 权重轮询

机器规格或实例容量不同，可以设置权重：

```nginx
upstream app_backend {
    server 192.0.2.11:8000 weight=3;
    server 192.0.2.12:8000 weight=1;
}
```

理论上第一台获得约三倍请求。权重应基于压测和真实监控调整，而不是只按 CPU 核数猜测；数据库、缓存、网络和接口类型都会影响实际容量。

## 最少连接

请求耗时差异较大时，`least_conn` 往往比简单轮询更合理：

```nginx
upstream app_backend {
    least_conn;
    server 192.0.2.11:8000;
    server 192.0.2.12:8000;
}
```

它优先选择当前活动连接较少的实例。长连接、SSE 和 WebSocket 会显著影响连接数量，需要结合业务协议判断。

## IP Hash

```nginx
upstream app_backend {
    ip_hash;
    server 192.0.2.11:8000;
    server 192.0.2.12:8000;
}
```

`ip_hash` 尝试让相同客户端地址落到相同上游，常被用作简单会话粘性方案。但它有明显限制：

- 大量用户经过同一个 NAT 时会集中到同一实例；
- 代理链下客户端地址可能不真实；
- 扩缩容会改变映射；
- 不能替代共享 Session、外部缓存或无状态认证。

优先让应用无状态化，把 Session 放到共享存储，或使用签名令牌。只有明确需要时才依赖粘性会话。

## 备用节点与临时下线

```nginx
upstream app_backend {
    server 192.0.2.11:8000;
    server 192.0.2.12:8000;
    server 192.0.2.13:8000 backup;
}
```

备用节点只在普通节点不可用时接收请求。

维护期间可以标记：

```nginx
server 192.0.2.12:8000 down;
```

修改后仍需 reload。频繁通过编辑配置上下线实例时，应该评估服务发现、容器编排或自动化配置生成，而不是长期手工维护地址列表。

## 被动失败判断

开源 Nginx 常见参数：

```nginx
server 192.0.2.11:8000 max_fails=3 fail_timeout=30s;
```

它主要依据真实代理请求中的连接或响应失败进行被动判断，并不是独立的主动 `/health` 探测。应用应提供健康接口，外部负载均衡器或监控系统也应持续检查。

不要把所有 HTTP 5xx 都简单视为节点宕机。某些 5xx 是业务输入、数据库或依赖故障，盲目重试可能放大压力。

## 重试与幂等性

Nginx 可以在特定错误后尝试下一个上游：

```nginx
proxy_next_upstream error timeout http_502 http_503 http_504;
proxy_next_upstream_tries 2;
```

对于 POST、支付、写库等非幂等请求，自动重试可能产生重复操作。只有应用具备幂等键、事务约束和明确重试语义时，才扩大重试范围。

## Keepalive

Nginx 到上游可以复用连接：

```nginx
upstream app_backend {
    server 192.0.2.11:8000;
    server 192.0.2.12:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_pass http://app_backend;
    }
}
```

连接池过大可能长期占用上游文件描述符，过小则增加握手成本。应结合并发和上游限制调整。

## 滚动发布

一个简单流程：

1. 从 upstream 中移除或标记一个节点；
2. `nginx -t` 后 reload；
3. 等待旧连接完成；
4. 部署并验证该节点；
5. 加回 upstream；
6. 继续下一台。

如果使用容器平台，应把 readiness 与滚动更新交给平台，Nginx 只消费稳定的服务地址或服务发现结果。

## 观测

访问日志加入上游信息：

```nginx
log_format upstream_timing '$remote_addr $request '
                           'status=$status upstream=$upstream_addr '
                           'upstream_status=$upstream_status '
                           'request_time=$request_time '
                           'upstream_time=$upstream_response_time';

access_log /var/log/nginx/access.log upstream_timing;
```

重点关注：

- 每个上游的请求量；
- 连接和响应失败；
- P50/P95/P99 延迟；
- 502、503、504 比例；
- 实例 CPU、内存、连接池和队列；
- reload 后配置是否符合预期。

`$upstream_addr` 可能包含多个地址，表示请求发生了重试。

## 常见误区

- **上游多了就等于高可用：** Nginx 本身仍可能是单点。
- **轮询必然平均：** 长短请求、Keepalive 和连接状态会造成差异。
- **IP Hash 能解决 Session：** 它只是流量粘性，不提供 Session 持久化。
- **失败就无限重试：** 写操作可能被重复执行。
- **只看 Nginx 日志：** 应同时观察应用、数据库和依赖服务。

## 上线检查清单

```text
1. upstream 地址和端口可从 Nginx 主机访问
2. 所有实例运行同一兼容版本
3. 会话和上传数据不依赖单机目录
4. 重试规则符合接口幂等性
5. 超时和 Keepalive 与上游容量匹配
6. 日志记录 upstream 地址、状态和耗时
7. Nginx 自身也有高可用或快速恢复方案
8. 扩缩容、节点故障和滚动发布已经演练
```

> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。
