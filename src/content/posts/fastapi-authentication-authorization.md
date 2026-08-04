---
title: FastAPI 认证授权实战：OAuth2、JWT、角色与资源权限
published: 2026-08-04
updated: 2026-08-04
description: 使用 FastAPI 构建可审计的认证与授权边界，覆盖密码哈希、访问令牌、刷新令牌、角色权限和资源所有者检查。
tags: [Python, FastAPI, OAuth2, JWT, RBAC, 安全]
category: Python
contentType: docs
docGroup: python
docSection: Web 工程
docOrder: 110
draft: false
---

认证回答“你是谁”，授权回答“你能做什么”。很多接口只验证 JWT 是否能解码，却没有继续检查账号状态、权限范围和资源归属，这会把身份凭据误当成完整的访问控制系统。

本文以 FastAPI 自带的 `OAuth2PasswordBearer` 为入口，给出一套可拆分、可测试的认证授权结构。示例只演示边界，不包含完整用户中心、第三方登录或企业级身份提供商。

## 数据模型先区分身份与权限

最小用户模型通常至少包含：

- 稳定的用户 ID；
- 唯一登录标识；
- 密码哈希而不是明文密码；
- 是否禁用；
- 角色或权限集合；
- 凭据版本，用于让旧令牌整体失效；
- 创建时间和最近安全事件时间。

角色适合表达岗位，例如 `admin`、`editor`、`viewer`；权限适合表达动作，例如 `article:write`。资源级操作还要检查资源所有者，而不是只看角色。

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Principal:
    user_id: str
    roles: frozenset[str]
    permissions: frozenset[str]
    disabled: bool = False
```

不要把邮箱、手机号、权限列表等频繁变化的信息全部塞进长期 JWT。令牌中的声明越多，信息过期和泄露后的影响越大。

## 密码使用 Argon2 哈希

密码必须使用专门的密码哈希算法。FastAPI 当前安全教程推荐通过 `pwdlib` 使用 Argon2。

```bash
python -m pip install "pwdlib[argon2]" pyjwt
```

```python
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()


def hash_password(raw_password: str) -> str:
    return password_hash.hash(raw_password)


def verify_password(raw_password: str, stored_hash: str) -> bool:
    return password_hash.verify(raw_password, stored_hash)
```

密码哈希和普通 SHA-256 用途不同。不要自行拼盐，也不要把密码加密后保存为可逆密文。登录失败时返回统一错误，避免泄露“用户存在但密码错误”之类的账号枚举信息。

## Access Token 只承担短期访问

访问令牌应当短期有效，并包含明确的签发者、受众、主题和过期时间。签名密钥从运行环境或密钥管理系统读取。

```python
import os
from datetime import datetime, timedelta, timezone

import jwt

JWT_SIGNING_KEY = os.environ["JWT_SIGNING_KEY"]
JWT_ISSUER = "https://auth.example.com"
JWT_AUDIENCE = "blog-api"


def create_access_token(user_id: str, credential_version: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "ver": credential_version,
        "typ": "access",
    }
    return jwt.encode(payload, JWT_SIGNING_KEY, algorithm="HS256")
```

JWT 是签名载荷，不是加密容器。客户端和日志系统都可能看到载荷内容，因此不要写入密码、身份证号、内部备注或其他敏感信息。

验证时固定算法、签发者和受众，不要根据令牌头部动态接受任意算法。

```python
from jwt.exceptions import InvalidTokenError


def decode_access_token(token: str) -> dict[str, object]:
    try:
        payload = jwt.decode(
            token,
            JWT_SIGNING_KEY,
            algorithms=["HS256"],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
    except InvalidTokenError as exc:
        raise ValueError("invalid access token") from exc

    if payload.get("typ") != "access":
        raise ValueError("unexpected token type")
    return payload
```

## 在 FastAPI 中解析当前用户

```python
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


async def get_current_principal(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> Principal:
    try:
        payload = decode_access_token(token)
        user_id = str(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await load_user_and_permissions(user_id)
    if user is None or user.disabled:
        raise HTTPException(status_code=401, detail="invalid credentials")
    if int(payload.get("ver", -1)) != user.credential_version:
        raise HTTPException(status_code=401, detail="credentials expired")

    return Principal(
        user_id=user.id,
        roles=frozenset(user.roles),
        permissions=frozenset(user.permissions),
        disabled=user.disabled,
    )
```

数据库查询应使用用户 ID，而不是信任令牌里携带的完整权限快照。对性能敏感时可以缓存权限，但要设计明确的失效策略。

## Refresh Token 要可撤销和轮换

Refresh Token 生命周期更长，不应与 Access Token 使用完全相同的处理方式。推荐只给客户端一个高熵随机值，服务端保存其哈希、用户 ID、过期时间、设备信息和撤销状态。

一次刷新流程：

1. 客户端提交 Refresh Token；
2. 服务端哈希后查询记录；
3. 检查是否过期、撤销或已被使用；
4. 撤销旧记录并生成新记录；
5. 返回新的 Access Token 与 Refresh Token；
6. 如果检测到已轮换令牌被再次使用，撤销该令牌家族。

这种 Refresh Token 轮换比“永远有效的第二个 JWT”更容易撤销和审计。登出、修改密码、账号冻结时必须让相关刷新凭据失效。

## 权限依赖只检查一个动作

```python
from collections.abc import Callable


def require_permission(permission: str) -> Callable:
    async def dependency(
        principal: Annotated[Principal, Depends(get_current_principal)],
    ) -> Principal:
        if permission not in principal.permissions:
            raise HTTPException(status_code=403, detail="forbidden")
        return principal

    return dependency
```

```python
@app.post("/articles")
async def create_article(
    principal: Annotated[
        Principal,
        Depends(require_permission("article:write")),
    ],
):
    ...
```

认证失败使用 `401`；已经认证但没有权限使用 `403`。不要通过不同错误内容向外暴露内部角色和权限结构。

## 资源所有者检查不可省略

用户拥有 `article:write` 不代表可以修改所有文章。资源加载和授权检查应处于同一个清晰流程。

```python
async def require_article_editor(
    article_id: str,
    principal: Annotated[Principal, Depends(get_current_principal)],
):
    article = await load_article(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="article not found")

    is_owner = article.owner_id == principal.user_id
    is_admin = "article:admin" in principal.permissions
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    return article
```

多租户系统还必须先限定租户，再判断资源所有者。任何只根据前端传来的 `tenant_id` 或 `owner_id` 做授权的实现都不可靠。

## 浏览器客户端的保存位置

- `HttpOnly`、`Secure`、合理 `SameSite` 的 Cookie 可以降低脚本直接读取令牌的风险，但需要处理 CSRF；
- 浏览器本地存储容易受到 XSS 后的令牌读取影响；
- 移动端应使用平台安全存储；
- 无论使用哪种位置，都要缩短 Access Token 生命周期并避免把令牌写入 URL。

不要在访问日志、错误追踪、分析事件和前端调试输出中记录 Authorization Header。

## 常见失败模式

- 只验证签名，不验证 `iss`、`aud`、`exp` 和令牌类型；
- 永久有效 Access Token；
- 修改密码后旧令牌仍然长期有效；
- Refresh Token 不轮换、不可撤销；
- 管理接口只检查“已登录”；
- 只做角色判断，不检查资源所有者；
- 在 JWT 中放入敏感数据；
- 把认证成功当作业务操作幂等和审计完成。

## 生产检查清单

- [ ] 密码只保存 Argon2 等专用密码哈希；
- [ ] Access Token 设置短过期时间并验证签发者和受众；
- [ ] Refresh Token 可撤销、可轮换并记录使用状态；
- [ ] 密码修改、账号冻结和安全事件能够让旧凭据失效；
- [ ] 每个写接口都有明确权限和资源所有者检查；
- [ ] 多租户查询始终包含租户边界；
- [ ] 日志和错误追踪不记录令牌、密码或认证头；
- [ ] 认证、越权、撤销和令牌重放均有自动化测试；
- [ ] 高风险操作有审计事件和二次确认策略。

## 参考资料

- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [FastAPI OAuth2 with Password and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)

> 本文根据现有 FastAPI 工程文档体系补充，并以官方安全教程为主要依据进行整理。
