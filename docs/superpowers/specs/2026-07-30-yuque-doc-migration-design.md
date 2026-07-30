# Yuque Documentation Migration Design

## Goal

Turn selected notes from `zh19990906/yuque` into safe, maintainable documentation that follows the site's documentation-series model, while adding dedicated Nginx and AI/LLM groups.

## Source Policy

The Yuque repository is an editorial source, not a copy source. Every migrated document is rewritten for a public audience. The migration must remove:

- passwords, API keys, access keys, proxy credentials, and private tokens;
- private IP addresses, company domains, internal image registries, and project-specific identifiers;
- obsolete commands and APIs;
- Yuque HTML styling such as `<font>` tags;
- duplicated headings, raw export footers, and private Yuque links.

Examples use environment variables, placeholders such as `example.com`, and current safe practices. Docker TCP port `2375` is documented only as an unsafe anti-pattern.

## Documentation Groups

Add two groups after YOLO:

- `nginx`, order `60`: reverse proxy, HTTPS, certificates, and load balancing.
- `ai-llm`, order `70`: NLP foundations, attention, Transformer, and LLM application foundations.

Existing groups remain unchanged.

## First Migration Batch

### Linux

1. `linux-inode-troubleshooting.md`
   - Section: `磁盘与文件系统`
   - Rewrites the inode experiment and troubleshooting notes.
   - Covers `df -i`, locating inode-heavy directories, safe cleanup, archiving, and the destructive nature of filesystem recreation.
2. `linux-mount-cifs-share.md`
   - Section: `文件系统与挂载`
   - Covers `cifs-utils`, credentials files, manual mounting, `/etc/fstab`, permissions, and common errors.

### Docker

3. `docker-engine-api-security.md`
   - Section: `安全与远程管理`
   - Replaces the old unauthenticated TCP instructions with Unix Socket, Docker Context over SSH, and mutual TLS.
4. `docker-private-registry.md`
   - Section: `镜像仓库`
   - Covers Registry/Harbor concepts, trusted certificates, authentication, push/pull, and insecure registry warnings.

### Python

5. `python-thread-pool.md`
   - Section: `并发编程`
   - Covers `ThreadPoolExecutor`, `as_completed`, exception handling, timeouts, and I/O-bound scope.
6. `python-scheduling-and-datetime.md`
   - Section: `实用技巧`
   - Combines lightweight scheduling and robust date parsing, while explaining when systemd timers or cron are more appropriate.

### PostgreSQL

7. `postgresql-python-access.md`
   - Section: `应用接入`
   - Uses parameterized SQL, transactions, context managers, and connection pooling. It must not include `LAST_INSERT_ID()` or MySQL metadata queries.

### Nginx

8. `nginx-reverse-proxy.md`
   - Section: `反向代理`
   - Covers proxy headers, WebSocket forwarding, timeouts, body limits, and configuration validation.
9. `nginx-acme-https.md`
   - Section: `HTTPS 与安全`
   - Covers acme.sh installation, webroot issuance, certificate installation, reload hooks, renewal checks, and firewall/DNS prerequisites.
10. `nginx-load-balancing.md`
    - Section: `负载均衡`
    - Covers round robin, weights, `least_conn`, `ip_hash`, failure behavior, proxy headers, and operational caveats.

### AI / LLM

11. `nlp-and-llm-foundations.md`
    - Section: `基础概念`
    - Covers NLP task families, text representation evolution, pretrained models, and the relationship between NLP and LLMs.
12. `attention-and-transformer.md`
    - Section: `模型架构`
    - Covers self-attention intuition, Q/K/V, scaled dot-product attention, multi-head attention, positional information, encoder/decoder roles, and practical limitations.

## Frontmatter Rules

Every file includes:

- `title`
- `published` using the original note's first publication or a nearby editorial date
- `updated: 2026-07-30`
- `description`
- `tags`
- `category`
- `contentType: docs`
- `docGroup`
- `docSection`
- `docOrder`

Dates remain distributed across 2022–2026. The author is not duplicated in frontmatter; the site uses `profileConfig.name`.

## Attribution

Each document ends with a short editorial note stating that it was reorganized from the author's earlier notes. Private Yuque URLs are not published. External factual references use official documentation links where relevant.

## Safety Review

Before committing, scan all new content for:

- IPv4 address patterns other than documentation ranges or loopback;
- terms such as `password=`, `api_key=`, `secret_key=`, `access_key=` followed by literals;
- private domains and internal registry names observed in the source;
- `0.0.0.0:2375` presented without an explicit danger warning;
- incorrect author names or Yuque export footers.

## Validation

- Existing documentation-core tests pass.
- A new content-safety test validates group registration, required files, frontmatter, forbidden secret patterns, and absence of export artifacts.
- Astro Check validates every content entry.
- Production builds pass on Node.js 22 and 23.
- Biome reports no new issues.

## Non-goals

- LangChain/LangGraph, Redis, Kafka, MinIO, MongoDB, Elasticsearch, and project-specific deployment notes are deferred to later batches.
- Images from the Yuque export are not migrated in this batch.
- No legacy Yuque URL redirect system is added.
