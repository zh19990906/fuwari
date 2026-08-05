# YOLO 云台项目文档系列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Fuwari 中新增“YOLO 云台项目”专栏、八篇可复现文档和静态回归测试，完整记录双机视觉跟踪架构、NanoPi K2/PCA9685 接线、旧版设备树修复、渐进式舵机验证、故障排查与部署运维。

**Architecture:** 沿用现有 Astro 内容集合，文章继续存放在 `src/content/posts/`，通过 `contentType: docs` 和 `docGroup: yolo-gimbal` 组成独立专栏。新增一个 Node.js 静态测试文件并从 `tests/docs-core.test.mjs` 导入，使元数据、安全边界、关键实机结论和引用要求进入现有 `pnpm test:docs` 流程。

**Tech Stack:** Astro 5 content collections、Markdown、TypeScript 配置、Node.js 内置测试运行器、NanoPi K2、Linux 3.14 设备树、I²C、PCA9685、Python、Ultralytics YOLO、ByteTrack、UDP。

## Global Constraints

- 所有文章使用中文正文，API、类名、状态名和命令保留英文。
- 所有文章使用 `published: 2026-08-05`、`updated: 2026-08-05`、`contentType: docs`、`docGroup: yolo-gimbal`、`draft: false`。
- 不添加单篇 `author`。
- 不包含真实凭据、私有 IPv4 地址、内部域名、可复用弱密码或真实 Token。
- 网络示例使用 `VISION_HOST_IP`、`K2_HOST_IP` 等明显占位名称。
- 接线描述必须区分 PCA9685 的 `VCC`、`V+`、`GND` 和 `OE`，并强调板上丝印优先。
- 舵机示例默认从 `1500 us` 中位开始，仅使用 `1475/1525 us` 小范围动作。
- 设备树节点地址和 I²C 总线编号必须标注为环境相关；本次实机结论仅适用于 Ubuntu 16.04.7、Linux 3.14.29 和对应 `nanopi-k2.dtb`。
- 项目架构与代码能力以 `zh19990906/yolo-gimbal-tracker` 的 `main` 分支为依据；PR #1、#2、#3 已合并的能力可以写成当前能力。
- 尚未完成的双舵机全范围标定、长时间稳定性、断网自动回中实机验证和完整双机联调列入“待验证”，不能描述为已经成功。
- 技术事实优先引用 FriendlyELEC、NXP、Linux 内核、Python、Ultralytics、OpenCV 和项目仓库等第一方资料。
- 不新增 Astro 运行时依赖。

---

### Task 1: 建立文档回归测试契约

**Files:**
- Create: `tests/yolo-gimbal-docs.test.mjs`
- Modify: `tests/docs-core.test.mjs`

**Interfaces:**
- Consumes: `src/content/posts/*.md` 的 Frontmatter 和 `src/config/docs.ts`。
- Produces: 八篇文档与 `yolo-gimbal` 专栏的静态契约。

- [ ] **Step 1: 创建聚焦测试文件**

在 `tests/yolo-gimbal-docs.test.mjs` 写入：

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const postsDir = path.join(root, "src/content/posts");

const expectedDocs = {
  "yolo-gimbal-system-architecture.md": {
    section: "项目总览", order: 10,
    required: ["Windows/N100", "NanoPi K2", "ByteTrack", "UDP", "return-center"],
  },
  "yolo-gimbal-windows-vision-host.md": {
    section: "视觉端", order: 20,
    required: ["Ultralytics", "ByteTrack", "vision perf", "asyncio.TimeoutError", "YOLO26"],
  },
  "yolo-gimbal-k2-control-service.md": {
    section: "控制端", order: 30,
    required: ["tracking", "holding", "return-center", "fault", "Pca9685ServoBackend"],
  },
  "yolo-gimbal-hardware-wiring.md": {
    section: "硬件与总线", order: 40,
    required: ["Pin 1", "Pin 3", "Pin 5", "Pin 6", "VCC", "V+", "OE", "共地"],
  },
  "nanopi-k2-enable-header-i2c.md": {
    section: "硬件与总线", order: 50,
    required: ["Ubuntu 16.04.7", "Linux 3.14.29", "0x50", "UU", "i2c@c1108500", "fdtput", "DTB"],
  },
  "pca9685-servo-bringup.md": {
    section: "调试验证", order: 60,
    required: ["i2cdetect -l", "0x40", "1500", "1475", "1525", "CH0", "CH1"],
  },
  "yolo-gimbal-troubleshooting.md": {
    section: "故障排查", order: 70,
    required: ["--", "UU", "HDMI DDC", "VCC", "V+", "立即断电"],
  },
  "yolo-gimbal-deployment-operations.md": {
    section: "部署运维", order: 80,
    required: ["backend: pca9685", "i2c_bus", "i2c_address: 0x40", "frequency_hz: 50", "模拟后端"],
  },
};

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim();
}

for (const [filename, requirements] of Object.entries(expectedDocs)) {
  test(`${filename} follows YOLO gimbal documentation contract`, async () => {
    const content = await readFile(path.join(postsDir, filename), "utf8");
    assert.match(content, /^---\n[\s\S]*?\n---\n/);
    assert.equal(frontmatterValue(content, "contentType"), "docs");
    assert.equal(frontmatterValue(content, "docGroup"), "yolo-gimbal");
    assert.equal(frontmatterValue(content, "docSection"), requirements.section);
    assert.equal(Number(frontmatterValue(content, "docOrder")), requirements.order);
    assert.equal(frontmatterValue(content, "published"), "2026-08-05");
    assert.equal(frontmatterValue(content, "updated"), "2026-08-05");
    assert.equal(frontmatterValue(content, "draft"), "false");
    assert.doesNotMatch(content, /^author:/m);
    for (const phrase of requirements.required) {
      assert.ok(content.includes(phrase), `${filename} missing ${phrase}`);
    }
    assert.doesNotMatch(content, /(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/);
    assert.doesNotMatch(content, /(?:password|secret|api[_-]?key|access[_-]?key|token)\s*[=:]\s*["'][A-Za-z0-9_\-]{8,}["']/i);
    assert.doesNotMatch(content, /minioadmin|changeme|password123|admin123/i);
    const fenceCount = (content.match(/```/g) ?? []).length;
    assert.equal(fenceCount % 2, 0, `${filename} has unclosed code fence`);
  });
}

test("registers the YOLO gimbal documentation group", async () => {
  const config = await readFile(path.join(root, "src/config/docs.ts"), "utf8");
  assert.match(config, /slug: "yolo-gimbal"[\s\S]*?title: "YOLO 云台项目"[\s\S]*?order: 90/);
});
```

- [ ] **Step 2: 接入现有测试入口**

在 `tests/docs-core.test.mjs` 增加：

```js
import "./yolo-gimbal-docs.test.mjs";
```

- [ ] **Step 3: 验证 RED**

Run: `pnpm test:docs`

Expected: 八个文件读取失败且专栏注册失败；原有文档核心测试保持通过。

- [ ] **Step 4: 提交**

```bash
git add tests/yolo-gimbal-docs.test.mjs tests/docs-core.test.mjs
git commit -m "test: define YOLO gimbal documentation contract"
```

---

### Task 2: 注册“YOLO 云台项目”专栏

**Files:**
- Modify: `src/config/docs.ts`

**Interfaces:**
- Consumes: 现有 `DocGroupConfig[]`。
- Produces: 可用于八篇文章的 `docGroup: yolo-gimbal`。

- [ ] **Step 1: 在 DevOps 分组后添加**

```ts
{
  slug: "yolo-gimbal",
  title: "YOLO 云台项目",
  description: "双机视觉跟踪、NanoPi K2、PCA9685、舵机控制与系统排障记录",
  order: 90,
},
```

- [ ] **Step 2: 运行聚焦测试**

Run: `node --test tests/yolo-gimbal-docs.test.mjs`

Expected: 专栏测试通过，八篇文章仍因文件不存在而失败。

- [ ] **Step 3: 提交**

```bash
git add src/config/docs.ts
git commit -m "docs: register YOLO gimbal series"
```

---

### Task 3: 编写系统架构与 Windows 视觉端文档

**Files:**
- Create: `src/content/posts/yolo-gimbal-system-architecture.md`
- Create: `src/content/posts/yolo-gimbal-windows-vision-host.md`

**Interfaces:**
- Consumes: `yolo-gimbal-tracker` 当前 `main` 和已合并 PR #1、#2、#3。
- Produces: 系列总览和视觉主机完整说明。

- [ ] **Step 1: 创建架构文档**

Frontmatter：

```yaml
---
title: 双机 YOLO 云台跟踪系统：架构、数据流与安全边界
published: 2026-08-05
updated: 2026-08-05
description: 说明 Windows/N100 视觉主机与 NanoPi K2 控制主机的职责、UDP 数据流、状态机和失联安全行为。
tags: [YOLO, 云台, NanoPi K2, UDP, ByteTrack]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 项目总览
docOrder: 10
draft: false
---
```

正文二级标题固定为：系统目标与适用范围、双机职责边界、从摄像头到舵机的数据流、UDP 控制与状态回传、四种安全状态、为什么推理与控制分离、失联与退出行为、项目目录与配置入口、已验证与待验证、参考资料。明确监控网页不在实时闭环中。

- [ ] **Step 2: 创建视觉端文档**

使用 `docSection: 视觉端`、`docOrder: 20`。覆盖 Windows 数字相机索引与 `CAP_DSHOW`、Linux `/dev/video*` 与 `CAP_V4L2`、YOLO/ByteTrack、类别过滤、目标切换滞回、归一化误差、20 Hz UDP、每 5 秒 `vision perf` 聚合日志、YOLO26 的 Ultralytics 版本约束、Python 3.10 `asyncio.TimeoutError` 修复、CPU/模型/分辨率性能边界和停止发送陈旧控制量。

- [ ] **Step 3: 验证与提交**

```bash
node --test tests/yolo-gimbal-docs.test.mjs
git add src/content/posts/yolo-gimbal-system-architecture.md \
  src/content/posts/yolo-gimbal-windows-vision-host.md
git commit -m "docs: add YOLO gimbal architecture and vision host guides"
```

Expected: 前两篇与专栏测试通过，其余六篇失败。

---

### Task 4: 编写 K2 控制端与硬件接线文档

**Files:**
- Create: `src/content/posts/yolo-gimbal-k2-control-service.md`
- Create: `src/content/posts/yolo-gimbal-hardware-wiring.md`

**Interfaces:**
- Consumes: K2 服务、模拟/PCA9685 后端、NanoPi K2 针脚和 PCA9685 数据手册。
- Produces: 软件安全状态机说明和断电接线规程。

- [ ] **Step 1: 创建 K2 控制服务文档**

使用 `docSection: 控制端`、`docOrder: 30`。覆盖报文验证、序号/时间戳边界、20 Hz 控制与 5 Hz 心跳、平滑、死区、速度和脉宽限制、`tracking/holding/return-center/fault`、simulated 与 `Pca9685ServoBackend`、CH0/Pan 与 CH1/Tilt、启动/停止/异常退出安全行为。明确代码具备状态机不等于实机断网回中已经验证。

- [ ] **Step 2: 创建硬件接线文档**

使用 `docSection: 硬件与总线`、`docOrder: 40`。必须包含：

```text
NanoPi K2 Pin 1  (3.3V) -> PCA9685 VCC
NanoPi K2 Pin 3  (SDA)  -> PCA9685 SDA
NanoPi K2 Pin 5  (SCL)  -> PCA9685 SCL
NanoPi K2 Pin 6  (GND)  -> PCA9685 GND
```

```text
外部 5–6V 正极 -> PCA9685 绿色端子 V+
外部电源负极   -> PCA9685 绿色端子 GND
PCA9685 OE     -> 首次测试保持未接
```

明确 K2 不给舵机供电，三方共地；舵机按板上 `S/PWM`、`V+`、`GND` 丝印插入；先 CH0 后 CH1。列出 5V 误接信号脚、V+/VCC 混淆、反接、无共地、机械堵转和带电改线风险。

- [ ] **Step 3: 验证与提交**

```bash
node --test tests/yolo-gimbal-docs.test.mjs
git add src/content/posts/yolo-gimbal-k2-control-service.md \
  src/content/posts/yolo-gimbal-hardware-wiring.md
git commit -m "docs: add K2 control and hardware wiring guides"
```

Expected: 前四篇与专栏测试通过，其余四篇失败。

---

### Task 5: 编写设备树修复与 PCA9685 渐进验证文档

**Files:**
- Create: `src/content/posts/nanopi-k2-enable-header-i2c.md`
- Create: `src/content/posts/pca9685-servo-bringup.md`

**Interfaces:**
- Consumes: 本次实机输出、`fdtget/fdtput/dtc` 和 `Pca9685ServoBackend`。
- Produces: 可回滚 I²C 启用流程和低风险单舵机验证流程。

- [ ] **Step 1: 创建排针 I²C 文档**

使用 `docSection: 硬件与总线`、`docOrder: 50`，严格按真实链路记录：Ubuntu 16.04.7、Linux 3.14.29、固定 `/boot/nanopi-k2.dtb`；初始仅 `/dev/i2c-0` 和 `i2c_gpio.32`；`0x50 = UU` 与 `hdmitx ... DDC` 证明它是 HDMI DDC；`.32` 不是 `/dev/i2c-32`；四个 `amlogic, meson-i2c` 节点均 disabled；本机 Pin 3/5 的 i2c-A 对应 `/i2c@c1108500`；备份 DTB；执行：

```bash
fdtput -t s nanopi-k2-i2c.dtb /i2c@c1108500 status okay
fdtget -t s nanopi-k2-i2c.dtb /i2c@c1108500 status
dtc -I dtb -O dts -o /tmp/nanopi-k2-i2c.dts nanopi-k2-i2c.dtb
```

验证 `pinctrl-0` 和 `a_i2c`，替换、`sync`、重启；本次实机新总线为 `i2c-1`，`i2cdetect -y 1 0x40 0x40` 返回 `40`；给出无法启动时的离线 DTB 恢复方法。

- [ ] **Step 2: 创建 PCA9685/舵机验证文档**

使用 `docSection: 调试验证`、`docOrder: 60`，分四阶段：仅接逻辑与 I²C；通过 `i2cdetect -l` 找实际总线并限定扫描 `0x40`；运行项目后端初始化/关闭；断电后接 5–6V 独立电源和一个 CH0 舵机，以 `1500, 1475, 1500, 1525, 1500`、每步 2 秒测试，成功后再测 CH1。列出撞限位、持续嗡鸣、异常抖动、发热、异味、K2 重启或断网等立即断电条件。

- [ ] **Step 3: 验证与提交**

```bash
node --test tests/yolo-gimbal-docs.test.mjs
git add src/content/posts/nanopi-k2-enable-header-i2c.md \
  src/content/posts/pca9685-servo-bringup.md
git commit -m "docs: add NanoPi I2C repair and servo bring-up guides"
```

Expected: 前六篇与专栏测试通过，最后两篇失败。

---

### Task 6: 编写故障排查与部署运维文档

**Files:**
- Create: `src/content/posts/yolo-gimbal-troubleshooting.md`
- Create: `src/content/posts/yolo-gimbal-deployment-operations.md`

**Interfaces:**
- Consumes: 前六篇的架构、接线、设备树和验证结论。
- Produces: 按现象检索的维护手册和端到端操作规程。

- [ ] **Step 1: 创建故障排查手册**

使用 `docSection: 故障排查`、`docOrder: 70`。每个问题固定使用“现象、最可能原因、无破坏性检查、安全修复、成功判据、立即停止条件”。覆盖 `--`、`UU`、只有 HDMI DDC、`/dev/i2c-1` 不存在、灯亮但无应答、SDA/SCL 电平异常、VCC/V+ 混淆、舵机不动/反向/抖动/嗡鸣/撞限位、接入后 K2 重启/断网、Pan/Tilt 互换、UDP 有数据但不跟踪、YOLO 帧率低或 ID 跳变。明确三条纠正：`i2c-0` 不一定是排针；灯亮不等于 I²C 正常；`0x50 UU` 是 HDMI DDC 线索。

- [ ] **Step 2: 创建部署运维文档**

使用 `docSection: 部署运维`、`docOrder: 80`。使用 `VISION_HOST_IP`/`K2_HOST_IP`，给出：

```yaml
servo:
  backend: pca9685
  i2c_bus: 1
  i2c_address: 0x40
  frequency_hz: 50
```

紧随说明总线号以当前 `i2cdetect -l` 为准。覆盖启动顺序：机械检查 → K2 → PCA9685 逻辑 → 舵机电源 → K2 服务 → 视觉服务；停止顺序：停止视觉发送 → 停止 K2 服务/回中 → 关闭舵机电源 → 关闭 K2；状态心跳、UDP、I²C 和机械动作验证；DTB/配置备份、模拟后端回退、失败恢复；已验证/待验证矩阵和变更后验收清单。

- [ ] **Step 3: 验证与提交**

```bash
node --test tests/yolo-gimbal-docs.test.mjs
git add src/content/posts/yolo-gimbal-troubleshooting.md \
  src/content/posts/yolo-gimbal-deployment-operations.md
git commit -m "docs: add YOLO gimbal troubleshooting and operations guides"
```

Expected: 九个聚焦测试全部通过。

---

### Task 7: 完成引用、安全和全量验证

**Files:**
- Modify only when verification exposes a defect in Tasks 1–6 files.

**Interfaces:**
- Consumes: 完整专栏、八篇文章和测试。
- Produces: 可构建、可审阅的分支。

- [ ] **Step 1: 核对第一方引用**

按主题使用以下来源，不为无关文章强行添加：

- `github.com/zh19990906/yolo-gimbal-tracker`
- `wiki.friendlyelec.com/wiki/index.php/NanoPi_K2`
- `nxp.com/docs/en/data-sheet/PCA9685.pdf`
- `docs.kernel.org/i2c/dev-interface.html`
- `manpages.debian.org/i2c-tools/i2cdetect.8.en.html`
- `docs.python.org/3/library/asyncio-task.html`
- `docs.ultralytics.com/modes/track/`
- `docs.opencv.org/4.x/`

- [ ] **Step 2: 运行测试和构建**

```bash
pnpm test:docs
pnpm check
pnpm type-check
pnpm format
git diff --check
pnpm build
```

Expected: 全部成功，文档专栏页面包含八篇文章。

- [ ] **Step 3: 扫描敏感信息**

```bash
grep -RniE '(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)[0-9]{1,3}\.[0-9]{1,3}' \
  src/content/posts/*gimbal*.md src/content/posts/nanopi-k2-enable-header-i2c.md \
  src/content/posts/pca9685-servo-bringup.md || true
```

Expected: 无命中。若验证产生必要修正，提交：

```bash
git add src/config/docs.ts src/content/posts tests
git commit -m "docs: refine YOLO gimbal series verification"
```

---

### Task 8: 打开 Draft PR 并核对 CI

**Files:**
- No repository file changes unless CI identifies a defect.

**Interfaces:**
- Consumes: `agent/yolo-gimbal-docs` 完整提交历史。
- Produces: 面向 `main` 的 Draft PR。

- [ ] **Step 1: 推送分支**

```bash
git push -u origin agent/yolo-gimbal-docs
```

- [ ] **Step 2: 创建 Draft PR**

标题：`docs: add complete YOLO gimbal project series`

正文总结新专栏、八篇文章、真实 I²C 排查链路、硬件安全边界、静态文档契约、已验证与待验证事项。

- [ ] **Step 3: 核对 CI**

确认 Code quality、documentation tests、Astro Check、Astro production build 和仓库现有 Node.js 22/23 矩阵全部通过。

- [ ] **Step 4: 保持 Draft 状态**

不自动合并；向用户提供 PR 地址、变更文件、测试结果和仍需实机验证的清单。
