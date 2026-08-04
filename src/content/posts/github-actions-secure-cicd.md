---
title: GitHub Actions 实战：从 Pull Request 检查到安全部署
published: 2026-08-04
updated: 2026-08-04
description: 使用 GitHub Actions 建立最小权限的 CI/CD，覆盖 PR 检查、缓存、并发、环境审批、OIDC、不可变 Action、构建产物和回滚。
tags: [GitHub Actions, CI/CD, DevOps, OIDC, 安全]
category: DevOps
contentType: docs
docGroup: devops
docSection: CI/CD
docOrder: 10
draft: false
---

CI/CD 的目标不是“每次 push 跑一串命令”，而是让代码在进入主分支和生产环境前经过可重复检查，并让发布身份、权限和产物来源可以审计。

本文以 GitHub Actions 为例，覆盖 Pull Request 检查、最小权限、依赖缓存、并发取消、Environment 审批、OIDC 和回滚。示例使用公共占位符，不包含真实云账号、密钥或内部地址。

## Workflow、Job 与 Step

```text
Workflow
├── Job: lint-and-test
│   ├── Step: checkout
│   ├── Step: install
│   └── Step: test
└── Job: build
    ├── Step: checkout
    └── Step: build artifact
```

- Workflow 由事件触发；
- Job 默认并行运行，使用 `needs` 建立依赖；
- Step 在同一 Runner 中顺序执行；
- 每个 Job 都有独立文件系统和 `GITHUB_TOKEN`；
- Job 间共享文件需要显式上传 Artifact。

不要依赖另一个 Job 的临时目录仍然存在。

## Pull Request 检查

```yaml
name: Build and Check

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683

      - name: Setup Node.js
        uses: actions/setup-node@cdca7365b2dadb8aad0a33bc7601856ffabcc48e
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build
```

PR 检查应至少验证：

- 锁文件未漂移；
- 单元和集成测试；
- 类型检查和格式检查；
- 生产构建；
- 文档或 Schema 校验；
- 依赖和安全策略。

分支保护规则应要求关键检查通过后才能合并。工作流文件本身的修改也必须经过评审，因为它可以改变代码执行和凭据访问方式。

## GITHUB_TOKEN 最小权限

GitHub 为每个 Job 生成短期 `GITHUB_TOKEN`。默认权限不应依赖仓库历史设置，而要在 Workflow 或 Job 中显式声明。

只读检查：

```yaml
permissions:
  contents: read
```

发布 GitHub Pages：

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

`id-token: write` 只允许请求 OIDC Token，不自动授予仓库写权限。不要为了方便使用 `write-all`。

如果只有一个 Job 需要写权限，把权限放在该 Job，而不是整个 Workflow。

## 固定 Action 到 full-length commit SHA

标签和分支可以被移动。GitHub 安全指南建议把第三方 Action 固定到 full-length commit SHA，获得不可变引用。

```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
```

更新流程应包含：

1. 验证 SHA 属于官方仓库；
2. 对应可信 Release 或 Tag；
3. 阅读变更说明；
4. 由 Dependabot 或维护 PR 更新；
5. 通过 CI 后合并。

仅固定版本 Tag 比完全不固定好，但不提供相同的不可变保证。

## 不信任 Pull Request 输入

分支名、Issue 标题、PR Body、Commit Message 和用户输入都可能包含恶意内容。不要直接拼接到 Shell：

```yaml
- name: Unsafe example
  run: echo "${{ github.event.pull_request.title }}"
```

表达式在 Shell 执行前展开，特殊字符可能改变命令。更安全的方式是先写入环境变量并正确引用：

```yaml
- name: Print title safely
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: printf '%s\n' "$PR_TITLE"
```

更复杂输入应由脚本语言参数解析，不要生成 Shell 代码。

## pull_request 与 pull_request_target

`pull_request` 默认在合并上下文运行，来自 Fork 的代码通常无法访问仓库 Secret。

`pull_request_target` 在目标仓库上下文运行，可能访问更高权限，因此不能同时 Checkout 并执行不受信任 Fork 代码。

高风险反模式：

```yaml
on: pull_request_target

steps:
  - uses: actions/checkout@...
    with:
      ref: ${{ github.event.pull_request.head.sha }}
  - run: ./scripts/from-untrusted-pr.sh
```

需要给外部 PR 打标签或留言时，让高权限 Workflow 只处理元数据，不执行 PR 内容。

## concurrency 取消过时运行

同一分支连续 Push 时，旧检查已经没有价值：

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

部署通常不应直接取消正在修改生产状态的 Job。可以使用固定环境组并设置：

```yaml
concurrency:
  group: production
  cancel-in-progress: false
```

具体选择取决于部署是否原子、是否支持回滚，以及中途取消会不会留下半完成状态。

## Matrix 测试

```yaml
strategy:
  fail-fast: false
  matrix:
    node: [22, 23]

steps:
  - uses: actions/setup-node@cdca7365b2dadb8aad0a33bc7601856ffabcc48e
    with:
      node-version: ${{ matrix.node }}
```

Matrix 适合验证多个受支持运行时、操作系统或依赖版本。不要为了展示覆盖面测试已经不支持的组合，这会增加时间和维护成本。

## 缓存不是构建产物

缓存用于加速可重新生成的内容，例如包管理器下载目录。Artifact 用于在 Job 之间传递构建结果和保留审计证据。

缓存键必须包含锁文件哈希：

```yaml
with:
  cache: pnpm
  cache-dependency-path: pnpm-lock.yaml
```

不要缓存包含凭据的目录，也不要把缓存命中当作依赖完整性证明。安装仍应使用锁文件严格模式。

## 构建一次，部署同一产物

理想流程：

```text
Commit
  ↓
Test
  ↓
Build immutable artifact
  ↓
Security checks
  ↓
Approval
  ↓
Deploy exact artifact
```

不要在生产部署 Job 中重新从浮动依赖构建。测试通过的产物和部署产物必须具有相同摘要。

```yaml
- name: Upload artifact
  uses: actions/upload-artifact@REPLACE_WITH_VERIFIED_FULL_SHA
  with:
    name: site-dist
    path: dist/
    if-no-files-found: error
```

下载后可校验 manifest 或 SHA-256，再执行部署。

## Environment 与审批

```yaml
jobs:
  deploy:
    environment:
      name: production
      url: https://example.com
```

Environment 可以配置：

- 必需审批者；
- 等待时间；
- 允许部署的分支或 Tag；
- Environment Secret；
- 部署历史。

生产凭据只放在 production Environment，不要让普通 PR 检查 Job 获得。

## 使用 OIDC 代替长期云密钥

GitHub Actions 可以通过 OIDC 请求短期身份。Workflow 只需要：

```yaml
permissions:
  contents: read
  id-token: write
```

云平台信任策略应限制：

- GitHub Organization 和 Repository；
- 目标分支、Tag 或 Environment；
- 允许的 reusable workflow；
- Audience；
- 最小云角色权限。

OIDC 减少仓库中长期云密钥，但如果信任条件过宽，攻击者仍可能从其他分支或 Workflow 获取短期凭据。必须同时限制 GitHub 端权限和云端 Subject 条件。

## Reusable Workflow

组织中多个仓库重复相同发布流程时，可以抽取 reusable workflow：

```yaml
on:
  workflow_call:
    inputs:
      artifact-name:
        required: true
        type: string
```

调用方显式传入输入和 Secret。被调用 Workflow 不应假设拥有比调用方更多权限，权限会受到调用链限制。

共享 Workflow 要版本化并审查破坏性变更，避免一次修改影响所有仓库。

## 第三方依赖和脚本

Workflow 会执行：

- Action 仓库代码；
- 包管理器生命周期脚本；
- 项目构建脚本；
- 容器镜像入口；
- 下载的二进制工具。

因此需要：

- 固定 Action SHA；
- 锁定依赖；
- Dependabot 和依赖审查；
- 校验下载文件摘要；
- 限制可使用的 Action 来源；
- 定期删除不再使用的 Secret 和 Workflow。

## Self-hosted Runner 风险

Self-hosted Runner 可能保留磁盘、网络和凭据状态。不应让不受信任的 Fork PR 在可访问内部网络和生产凭据的 Runner 上运行。

最低要求：

- 使用一次性或任务后销毁的 Runner；
- 隔离网络；
- 不共享 Docker Socket；
- 限制标签和可调用仓库；
- 监控异常进程和出站流量；
- 及时更新 Runner 软件。

## 发布和回滚

发布记录至少包含：

- Commit SHA；
- Artifact 或镜像 digest；
- Workflow Run；
- 迁移版本；
- 审批人；
- 环境；
- 时间；
- 冒烟测试结果。

回滚不是重新运行旧源码构建，而是部署上一已验证的不可变产物。数据库变更必须向前兼容，否则应用回滚可能失败。

## 当前博客仓库的可借鉴点

本仓库已经使用：

- PR 和 `main` Push 触发；
- Node.js Matrix；
- `pnpm install --frozen-lockfile`；
- 文档、UI、个性化和构建检查；
- Workflow `concurrency`；
- GitHub Pages 的 `pages: write` 和 `id-token: write`；
- Action 固定到完整 SHA。

后续新增 Workflow 时应继续保持这些约束，而不是复制一个拥有更高权限的通用模板。

## 生产检查清单

- [ ] PR 必须通过测试、类型检查和生产构建；
- [ ] Workflow 和 Job 显式设置最小 `permissions`；
- [ ] 第三方 Action 固定到 full-length commit SHA；
- [ ] 不受信任输入不直接拼接到 Shell；
- [ ] 不使用高权限 `pull_request_target` 执行 Fork 代码；
- [ ] `concurrency` 策略与检查和部署的取消语义匹配；
- [ ] 依赖按锁文件安装，缓存键包含锁文件哈希；
- [ ] 测试、扫描和部署使用同一个不可变产物；
- [ ] 生产部署使用 Environment、审批和分支限制；
- [ ] 云认证优先使用 OIDC，并限制 Repository、Ref 和 Environment；
- [ ] Self-hosted Runner 不运行不受信任代码；
- [ ] 回滚使用上一已验证产物，并确认数据库兼容性。

## 参考资料

- [GitHub Actions Secure Use Reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)
- [GitHub OpenID Connect Reference](https://docs.github.com/en/actions/reference/security/oidc)
- [GitHub Workflow Syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

> 本文以当前仓库 CI 和 Pages 发布方式为案例，补充从检查到安全部署的 DevOps 主线。
