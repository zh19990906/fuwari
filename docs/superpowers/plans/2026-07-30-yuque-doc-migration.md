# Yuque Documentation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Nginx and AI/LLM documentation groups and publish twelve sanitized, rewritten documents derived from selected personal Yuque notes.

**Architecture:** Keep documentation metadata in the existing Astro content collection and register only the two new groups in `src/config/docs.ts`. Add a standalone Node content-safety test that reads Markdown as text, validates the expected files and frontmatter, and rejects private export artifacts or credential-like literals before Astro parses the content.

**Tech Stack:** Astro content collections, Markdown, TypeScript configuration, Node.js built-in test runner, pnpm, GitHub Actions.

## Global Constraints

- New groups are exactly `nginx` with order `60` and `ai-llm` with order `70`.
- New files use `contentType: docs` and the exact `docGroup`, `docSection`, and `docOrder` values listed below.
- Every migrated document contains `updated: 2026-07-30`.
- No article contains a per-post author field.
- No private Yuque URL, export footer, real credential, private registry, company domain, or private IP address may be published.
- Docker port `2375` appears only in an explicit unsafe-example warning.
- Use `example.com`, `192.0.2.0/24`, `127.0.0.1`, environment variables, or shell placeholders in examples.
- Every document ends with: `> 本文根据早期个人笔记重新整理，并结合当前通用实践进行了校对。`

---

### Task 1: Add migration safety tests and register groups

**Files:**
- Create: `tests/content-migration.test.mjs`
- Modify: `package.json:7-20`
- Modify: `.github/workflows/build.yml:42-49`
- Modify: `src/config/docs.ts:5-36`

**Interfaces:**
- Consumes: the twelve exact Markdown paths listed in `expectedDocs`.
- Produces: `pnpm test:content-migration` and two valid documentation group slugs.

- [ ] **Step 1: Write the failing content-safety test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const expectedDocs = {
  "linux-inode-troubleshooting.md": ["linux", "磁盘与文件系统", "50"],
  "linux-mount-cifs-share.md": ["linux", "文件系统与挂载", "60"],
  "docker-engine-api-security.md": ["docker", "安全与远程管理", "50"],
  "docker-private-registry.md": ["docker", "镜像仓库", "60"],
  "python-thread-pool.md": ["python", "并发编程", "50"],
  "python-scheduling-and-datetime.md": ["python", "实用技巧", "60"],
  "postgresql-python-access.md": ["postgresql", "应用接入", "50"],
  "nginx-reverse-proxy.md": ["nginx", "反向代理", "10"],
  "nginx-acme-https.md": ["nginx", "HTTPS 与安全", "20"],
  "nginx-load-balancing.md": ["nginx", "负载均衡", "30"],
  "nlp-and-llm-foundations.md": ["ai-llm", "基础概念", "10"],
  "attention-and-transformer.md": ["ai-llm", "模型架构", "20"],
};

for (const [filename, [group, section, order]] of Object.entries(expectedDocs)) {
  test(`${filename} follows documentation metadata and safety rules`, async () => {
    const content = await readFile(path.join(root, "src/content/posts", filename), "utf8");
    assert.match(content, /^---\n[\s\S]*?\n---/);
    assert.match(content, /contentType: docs/);
    assert.match(content, new RegExp(`docGroup: ${group}`));
    assert.match(content, new RegExp(`docSection: ${section}`));
    assert.match(content, new RegExp(`docOrder: ${order}`));
    assert.match(content, /updated: 2026-07-30/);
    assert.match(content, /本文根据早期个人笔记重新整理/);
    assert.doesNotMatch(content, /www\.yuque\.com|> 更新:|> 原文:/);
    assert.doesNotMatch(content, /<font\b|<\/font>/i);
    assert.doesNotMatch(content, /^author:/m);
    assert.doesNotMatch(content, /(?:api[_-]?key|secret[_-]?key|access[_-]?key|password)\s*=\s*["'][^$<{][^"']+/i);
    assert.doesNotMatch(content, /(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/);
  });
}

test("documentation groups register nginx and ai-llm", async () => {
  const config = await readFile(path.join(root, "src/config/docs.ts"), "utf8");
  assert.match(config, /slug: "nginx"[\s\S]*?order: 60/);
  assert.match(config, /slug: "ai-llm"[\s\S]*?order: 70/);
});
```

- [ ] **Step 2: Add the command and CI step**

Add to `package.json`:

```json
"test:content-migration": "node --test tests/content-migration.test.mjs"
```

Add to `.github/workflows/build.yml` after documentation tests:

```yaml
- name: Run content migration safety tests
  run: pnpm test:content-migration
```

- [ ] **Step 3: Run RED**

Run: `pnpm test:content-migration`

Expected: FAIL because the twelve files and new groups do not exist.

- [ ] **Step 4: Register the groups**

Append to `docsGroups`:

```ts
{
  slug: "nginx",
  title: "Nginx",
  description: "反向代理、HTTPS、证书管理与负载均衡实践",
  order: 60,
},
{
  slug: "ai-llm",
  title: "AI / LLM",
  description: "NLP、注意力机制、Transformer 与大语言模型基础",
  order: 70,
},
```

- [ ] **Step 5: Commit the failing test and group registration**

```bash
git add tests/content-migration.test.mjs package.json .github/workflows/build.yml src/config/docs.ts
git commit -m "test: define yuque migration safety rules"
```

### Task 2: Publish Linux and Docker migration documents

**Files:**
- Create: `src/content/posts/linux-inode-troubleshooting.md`
- Create: `src/content/posts/linux-mount-cifs-share.md`
- Create: `src/content/posts/docker-engine-api-security.md`
- Create: `src/content/posts/docker-private-registry.md`

**Interfaces:**
- Produces: four docs entries recognized by existing docs utilities.

- [ ] **Step 1: Create `linux-inode-troubleshooting.md`**

Use this frontmatter:

```yaml
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
---
```

Required sections and commands:

```markdown
## inode 是什么
## 先确认是否真的耗尽
```bash
df -h
df -i
```
## 定位 inode 数量最多的目录
```bash
sudo find /var -xdev -printf '%h\n' | sort | uniq -c | sort -nr | head -n 30
sudo find /var/lib -xdev -type f | wc -l
```
## 安全清理顺序
- 清理应用明确允许删除的缓存和临时文件
- 轮转或归档历史日志
- 将大量小文件打包后再转移
- 删除前先确认进程是否仍持有文件
## ext4 创建时的 inode 规划
```bash
sudo mkfs.ext4 -T small /dev/sdX1
sudo tune2fs -l /dev/sdX1 | grep -E 'Inode count|Block size'
```
Include a warning that formatting destroys existing data and existing inode counts cannot be safely enlarged in place.
## 常见误区
## 排障清单
```

- [ ] **Step 2: Create `linux-mount-cifs-share.md`**

Use:

```yaml
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
---
```

Required safe commands:

```bash
sudo apt update
sudo apt install -y cifs-utils
sudo mkdir -p /mnt/team-share
sudo mount -t cifs //fileserver.example.com/team /mnt/team-share \
  -o username="$SMB_USER",vers=3.0,uid=$(id -u),gid=$(id -g),file_mode=0640,dir_mode=0750
```

Credential file:

```ini
username=your-user
password=replace-with-a-secret
# domain=EXAMPLE
```

```bash
sudo install -m 600 /dev/null /etc/samba/credentials-team
sudoedit /etc/samba/credentials-team
```

`fstab` entry:

```fstab
//fileserver.example.com/team /mnt/team-share cifs credentials=/etc/samba/credentials-team,vers=3.0,_netdev,nofail,uid=1000,gid=1000,file_mode=0640,dir_mode=0750 0 0
```

Include `mount -a`, `findmnt`, `journalctl -b`, protocol-version troubleshooting, DNS/firewall checks, and a warning not to put passwords directly in shell history or `fstab`.

- [ ] **Step 3: Create `docker-engine-api-security.md`**

Use:

```yaml
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
---
```

Required structure:

```markdown
## 为什么 Docker API 权限很高
## 本机优先使用 Unix Socket
```bash
docker version
sudo docker version
```
## 推荐：通过 SSH 使用 Docker Context
```bash
docker context create production --docker "host=ssh://deploy@example.com"
docker --context production ps
docker context use default
```
## 必须使用 TCP 时启用双向 TLS
```

Show daemon configuration only on `tcp://0.0.0.0:2376` with `tlsverify`, certificate paths, firewall allow-listing, and certificate rotation. Include this explicit anti-pattern:

```text
危险：tcp://0.0.0.0:2375 没有传输加密和客户端认证，等同于把宿主机 root 级控制权交给能访问该端口的人。
```

Include Python SDK usage through environment variables:

```python
import docker

client = docker.from_env()
print(client.version()["Version"])
```

- [ ] **Step 4: Create `docker-private-registry.md`**

Use:

```yaml
---
title: Docker 私有镜像仓库与证书信任
published: 2022-09-08
updated: 2026-07-30
description: 从本地 Registry 到 Harbor，整理证书信任、登录、推送和常见错误排查。
tags: [Docker, Registry, Harbor, TLS, 镜像]
category: Docker
contentType: docs
docGroup: docker
docSection: 镜像仓库
docOrder: 60
---
```

Include:

```bash
docker run -d --restart=always --name registry -p 5000:5000 \
  -v registry-data:/var/lib/registry registry:2

docker tag app:1.0 registry.example.com/team/app:1.0
docker login registry.example.com
docker push registry.example.com/team/app:1.0
```

Explain trusted CA installation at `/etc/docker/certs.d/registry.example.com/ca.crt`, `systemctl restart docker`, Harbor's value for RBAC/scanning, and why `insecure-registries` is a temporary isolated-network exception rather than the normal solution.

- [ ] **Step 5: Run the migration test**

Run: `pnpm test:content-migration`

Expected: these four tests pass; the remaining eight still fail because their files do not exist.

- [ ] **Step 6: Commit**

```bash
git add src/content/posts/linux-*.md src/content/posts/docker-*.md
git commit -m "content: migrate linux and docker operations notes"
```

### Task 3: Publish Python and PostgreSQL migration documents

**Files:**
- Create: `src/content/posts/python-thread-pool.md`
- Create: `src/content/posts/python-scheduling-and-datetime.md`
- Create: `src/content/posts/postgresql-python-access.md`

**Interfaces:**
- Produces: three docs entries in existing Python/PostgreSQL groups.

- [ ] **Step 1: Create `python-thread-pool.md`**

Frontmatter:

```yaml
---
title: Python ThreadPoolExecutor 并发实操
published: 2022-08-02
updated: 2026-07-30
description: 使用线程池执行 I/O 密集任务，并正确处理结果、异常、超时和资源释放。
tags: [Python, ThreadPoolExecutor, 并发, 线程池]
category: Python
contentType: docs
docGroup: python
docSection: 并发编程
docOrder: 50
---
```

Use a complete safe example:

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import urlopen


def fetch(url: str) -> tuple[str, int]:
    with urlopen(url, timeout=10) as response:
        return url, response.status


urls = ["https://example.com", "https://www.python.org"]
with ThreadPoolExecutor(max_workers=4, thread_name_prefix="fetch") as executor:
    futures = {executor.submit(fetch, url): url for url in urls}
    for future in as_completed(futures):
        url = futures[future]
        try:
            _, status = future.result(timeout=15)
            print(url, status)
        except Exception as exc:
            print(url, type(exc).__name__, exc)
```

Explain I/O-bound vs CPU-bound work, bounded worker counts, ordering differences between `map` and `as_completed`, cancellation limits, and propagating exceptions instead of swallowing them.

- [ ] **Step 2: Create `python-scheduling-and-datetime.md`**

Frontmatter:

```yaml
---
title: Python 轻量定时任务与日期时间处理
published: 2022-08-19
updated: 2026-07-30
description: 组合 schedule 与 dateutil 处理简单定时任务、字符串时间、时区和失败重试。
tags: [Python, schedule, datetime, dateutil, 定时任务]
category: Python
contentType: docs
docGroup: python
docSection: 实用技巧
docOrder: 60
---
```

Include:

```python
import logging
import time

import schedule

logging.basicConfig(level=logging.INFO)


def job() -> None:
    logging.info("job started")
    try:
        # call application code directly; do not shell out to another Python process
        logging.info("job finished")
    except Exception:
        logging.exception("job failed")


schedule.every().day.at("08:20").do(job)
while True:
    schedule.run_pending()
    time.sleep(1)
```

Date parsing:

```python
from dateutil import parser

value = parser.isoparse("2026-07-30T10:00:00+08:00")
print(value.astimezone())
```

Explain timezone-aware datetimes, `isoparse` vs permissive `parse`, exception handling, missed jobs after process downtime, and when to prefer cron/systemd timers/task queues.

- [ ] **Step 3: Create `postgresql-python-access.md`**

Frontmatter:

```yaml
---
title: Python 安全访问 PostgreSQL：参数化查询、事务与连接池
published: 2023-02-20
updated: 2026-07-30
description: 使用 psycopg 编写参数化 SQL、管理事务，并通过连接池支撑 Web 与批处理任务。
tags: [PostgreSQL, Python, psycopg, SQL, 连接池]
category: PostgreSQL
contentType: docs
docGroup: postgresql
docSection: 应用接入
docOrder: 50
---
```

Use psycopg 3:

```bash
pip install "psycopg[binary,pool]"
export DATABASE_URL='postgresql://app_user:replace-me@db.example.com:5432/app'
```

```python
import os

import psycopg
from psycopg.rows import dict_row

with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT id, title FROM articles WHERE published_at >= %s ORDER BY published_at DESC",
            ("2026-01-01",),
        )
        rows = cursor.fetchall()
```

Insert with `RETURNING id`, transaction rollback example, and pool:

```python
from psycopg_pool import ConnectionPool

pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=1, max_size=10)
with pool.connection() as conn:
    with conn.cursor() as cursor:
        cursor.execute("SELECT now()")
```

Explicitly warn against string-concatenated SQL and long-lived global cursors. Do not mention `LAST_INSERT_ID()`.

- [ ] **Step 4: Run focused test and commit**

Run: `pnpm test:content-migration`

Expected: seven document tests pass; five remain missing.

```bash
git add src/content/posts/python-*.md src/content/posts/postgresql-python-access.md
git commit -m "content: migrate python and postgresql notes"
```

### Task 4: Publish the Nginx documentation group

**Files:**
- Create: `src/content/posts/nginx-reverse-proxy.md`
- Create: `src/content/posts/nginx-acme-https.md`
- Create: `src/content/posts/nginx-load-balancing.md`

**Interfaces:**
- Produces: a complete initial Nginx series at `/docs/nginx/`.

- [ ] **Step 1: Create `nginx-reverse-proxy.md`**

Frontmatter date `2022-09-14`, section `反向代理`, order `10`; title `Nginx 反向代理与常用代理头`.

Include a complete server block:

```nginx
server {
    listen 80;
    server_name app.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Include `sudo nginx -t`, `sudo systemctl reload nginx`, trailing-slash behavior, 502/504 diagnostics, and trust-boundary guidance for forwarded headers.

- [ ] **Step 2: Create `nginx-acme-https.md`**

Frontmatter date `2025-10-09`, section `HTTPS 与安全`, order `20`; title `Nginx 使用 acme.sh 申请证书并自动续期`.

Include prerequisites (DNS, ports 80/443, webroot), safe installer command with placeholder email, webroot challenge, certificate installation, and reload hook:

```bash
curl https://get.acme.sh | sh -s email=admin@example.com
~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
~/.acme.sh/acme.sh --issue -d app.example.com --webroot /var/www/app.example.com
sudo mkdir -p /etc/nginx/ssl/app.example.com
~/.acme.sh/acme.sh --install-cert -d app.example.com \
  --key-file /etc/nginx/ssl/app.example.com/private.key \
  --fullchain-file /etc/nginx/ssl/app.example.com/fullchain.pem \
  --reloadcmd "sudo systemctl reload nginx"
~/.acme.sh/acme.sh --cron --home ~/.acme.sh
```

Include an Nginx 80-to-443 redirect and TLS server, `nginx -t`, renewal verification, file permissions, and a note that wildcard certificates require DNS validation.

- [ ] **Step 3: Create `nginx-load-balancing.md`**

Frontmatter date `2022-08-23`, section `负载均衡`, order `30`; title `Nginx 负载均衡：轮询、权重与最少连接`.

Use:

```nginx
upstream app_backend {
    least_conn;
    server 192.0.2.11:8000 max_fails=3 fail_timeout=30s;
    server 192.0.2.12:8000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://app_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Explain default round robin, `weight`, `least_conn`, `ip_hash`, state/session caveats, passive failure handling in open-source Nginx, graceful reloads, and upstream observability.

- [ ] **Step 4: Run the test and commit**

Run: `pnpm test:content-migration`

Expected: ten document tests pass; AI/LLM documents remain missing.

```bash
git add src/content/posts/nginx-*.md
git commit -m "content: add nginx operations series"
```

### Task 5: Publish AI/LLM foundation documents

**Files:**
- Create: `src/content/posts/nlp-and-llm-foundations.md`
- Create: `src/content/posts/attention-and-transformer.md`

**Interfaces:**
- Produces: an initial AI/LLM learning path at `/docs/ai-llm/`.

- [ ] **Step 1: Create `nlp-and-llm-foundations.md`**

Frontmatter:

```yaml
---
title: NLP 与大语言模型基础概念
published: 2026-01-06
updated: 2026-07-30
description: 从自然语言处理任务、文本表示和预训练模型理解大语言模型所处的位置。
tags: [NLP, LLM, 预训练, 文本表示, 机器学习]
category: AI
contentType: docs
docGroup: ai-llm
docSection: 基础概念
docOrder: 10
---
```

Required sections:

```markdown
## NLP 解决什么问题
- 分类、序列标注、检索、抽取、翻译、摘要、问答、生成
## 文本如何变成模型输入
- one-hot / bag-of-words / TF-IDF
- distributed embeddings
- contextual representations
## 从任务模型到预训练模型
## LLM 与传统 NLP 的关系
## 训练、微调、提示和检索增强
## 评估时不要只看单一分数
## 学习路线
```

Keep claims model-agnostic and avoid copying course prose verbatim.

- [ ] **Step 2: Create `attention-and-transformer.md`**

Frontmatter:

```yaml
---
title: 注意力机制与 Transformer 架构
published: 2026-01-07
updated: 2026-07-30
description: 用直观流程理解 Q、K、V、自注意力、多头注意力和 Transformer 编码器/解码器。
tags: [Transformer, Attention, QKV, 深度学习, LLM]
category: AI
contentType: docs
docGroup: ai-llm
docSection: 模型架构
docOrder: 20
---
```

Include the equation:

```text
Attention(Q, K, V) = softmax(QKᵀ / √dₖ)V
```

Required sections:

```markdown
## 为什么需要注意力
## Q、K、V 的直觉
## 缩放点积注意力
## 自注意力的数据流
## 多头注意力
## 位置信息
## Encoder、Decoder 与 Decoder-only
## Mask 的作用
## 计算与上下文成本
## 阅读模型结构图的顺序
```

Include a small NumPy-like pseudocode example without presenting it as production deep-learning code.

- [ ] **Step 3: Run complete content test**

Run: `pnpm test:content-migration`

Expected: all thirteen tests pass (twelve docs plus group registration).

- [ ] **Step 4: Commit**

```bash
git add src/content/posts/nlp-and-llm-foundations.md src/content/posts/attention-and-transformer.md
git commit -m "content: add ai and llm foundation series"
```

### Task 6: Verify and open the migration PR

**Files:**
- No repository file changes unless checks expose a specific defect.

**Interfaces:**
- Produces: draft PR from `content/migrate-yuque-docs` to `main`.

- [ ] **Step 1: Run all local commands**

```bash
pnpm test:content-migration
pnpm test:docs
pnpm test:ui-language
pnpm astro check
pnpm astro build
pnpm biome check src tests package.json .github/workflows/build.yml
```

Expected: all exit 0.

- [ ] **Step 2: Manually scan the new documents**

Run searches equivalent to:

```bash
rg -n 'www\.yuque\.com|> 更新:|> 原文:|<font|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|10\.[0-9]|api[_-]?key\s*=|secret[_-]?key\s*=|access[_-]?key\s*=|password\s*=' src/content/posts/{linux-inode-troubleshooting,linux-mount-cifs-share,docker-engine-api-security,docker-private-registry,python-thread-pool,python-scheduling-and-datetime,postgresql-python-access,nginx-reverse-proxy,nginx-acme-https,nginx-load-balancing,nlp-and-llm-foundations,attention-and-transformer}.md
```

Expected: no unsafe match; placeholder documentation and environment-variable examples are allowed only after manual review.

- [ ] **Step 3: Open a draft PR**

Title: `content: migrate selected yuque notes into documentation series`

- [ ] **Step 4: Verify all GitHub Actions jobs**

Required successful jobs:

- Code quality
- Astro Check for Node.js 22
- Astro Check for Node.js 23
- Astro Build for Node.js 22
- Astro Build for Node.js 23

- [ ] **Step 5: Update the PR body with document list, security sanitization notes, and exact verification results**

Do not mark ready or merge automatically.
