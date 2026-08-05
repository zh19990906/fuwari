# YOLO 云台项目文档系列设计

日期：2026-08-05

## 目标

在现有 Fuwari 文档体系中新增一个独立的 `YOLO 云台项目` 专栏，系统记录 `zh19990906/yolo-gimbal-tracker` 的双机视觉跟踪架构、Windows/N100 视觉端、NanoPi K2 控制端、PCA9685 与双轴舵机接线、NanoPi K2 设备树修复、单舵机验证、故障排查和部署运维。

文档不仅描述最终正确配置，还要保留本次真实排查链路，解释错误现象、判断依据、错误结论如何被纠正，以及每一步的安全边界，使后续复现者能从现象逐层定位，而不是只复制最终命令。

## 读者与使用场景

主要读者：

- 正在复现该云台项目的开发者；
- 使用 NanoPi K2、PCA9685 和普通三线舵机的嵌入式开发者；
- 需要排查 Linux I²C、设备树、舵机供电和双机 UDP 控制链路的维护者；
- 未来继续维护 `yolo-gimbal-tracker` 与博客文档的项目成员。

文档假定读者具备基础 Linux 命令行、Python 和电气安全知识，但不假定熟悉 NanoPi K2 的旧版 Amlogic 内核或设备树。

## 专栏配置

在 `src/config/docs.ts` 新增：

```ts
{
  slug: "yolo-gimbal",
  title: "YOLO 云台项目",
  description: "双机视觉跟踪、NanoPi K2、PCA9685、舵机控制与系统排障记录",
  order: 90,
}
```

专栏使用独立 `docGroup: yolo-gimbal`，不放入现有 `yolo` 或 `linux` 分组。原因是该项目横跨视觉推理、网络协议、嵌入式 Linux、设备树、I²C、电源和机械执行机构，独立分组更利于持续扩展。

## 首批文档

所有文章位于 `src/content/posts/`，使用：

- `contentType: docs`
- `docGroup: yolo-gimbal`
- `published: 2026-08-05`
- `updated: 2026-08-05`
- `draft: false`
- 不设置单篇 `author`

### 1. 系统架构与数据流

文件：`yolo-gimbal-system-architecture.md`

Frontmatter：

- `docSection: 项目总览`
- `docOrder: 10`

内容：

- Windows/N100 视觉主机与 NanoPi K2 控制主机的职责边界；
- 摄像头、YOLO、ByteTrack、目标选择、归一化误差、UDP、控制状态机、PCA9685 和舵机之间的数据流；
- 跟踪、保持、回中和故障状态；
- 为什么视觉推理和硬件控制分离；
- 延迟、丢包、进程退出和网络中断时的安全行为；
- 项目目录与关键配置入口。

### 2. Windows/N100 视觉端

文件：`yolo-gimbal-windows-vision-host.md`

Frontmatter：

- `docSection: 视觉端`
- `docOrder: 20`

内容：

- 摄像头输入和 Ultralytics YOLO 推理流程；
- ByteTrack 跟踪与目标 ID 连续性；
- 目标选择策略与画面中心误差归一化；
- UDP 消息发送与低频诊断日志；
- YOLO26 性能诊断方法，包括预处理、推理、后处理和总帧耗时的区分；
- WebSocket 超时在 Python 3.10 环境中的兼容性排查；
- CPU、GPU、输入分辨率和模型大小对性能的影响；
- 视觉端异常时不应持续发送陈旧控制量。

文档只记录已经进入目标代码分支或能够从仓库状态验证的实现。尚未合并的改动必须标注分支或 PR 状态，不能写成默认分支已经具备的能力。

### 3. NanoPi K2 控制端

文件：`yolo-gimbal-k2-control-service.md`

Frontmatter：

- `docSection: 控制端`
- `docOrder: 30`

内容：

- UDP 接收、数据校验和超时判断；
- 误差平滑、死区、速度限制、角度或脉宽限制；
- `tracking`、`holding`、`return-center`、`fault` 状态转换；
- 模拟后端与 PCA9685 后端；
- CH0/CH1 与 Pan/Tilt 的映射；
- 进程启动、停止和异常退出时的舵机安全策略；
- 配置文件中需要按实机修改的字段。

### 4. 硬件接线与供电

文件：`yolo-gimbal-hardware-wiring.md`

Frontmatter：

- `docSection: 硬件与总线`
- `docOrder: 40`

内容：

- NanoPi K2 物理 Pin 1、3、5、6 与 PCA9685 `VCC`、`SDA`、`SCL`、`GND` 的连接；
- PCA9685 `V+`、`VCC`、`OE` 的区别；
- 舵机独立 5–6V 电源连接到绿色端子的 `V+` 与 `GND`；
- K2、PCA9685 和外部电源共地；
- 舵机三线插头的信号、电源和地；
- CH0 为水平 Pan、CH1 为俯仰 Tilt 的初始约定；
- 通电顺序、断电操作和首次测试前检查清单；
- 错接 5V 到 K2 3.3V 或信号线、反接电源、无共地、机械堵转等风险。

文档必须强调板上丝印优先于克隆板常见排列，不能仅凭线色或针脚数量判断。

### 5. 在旧版 NanoPi K2 系统启用排针 I²C

文件：`nanopi-k2-enable-header-i2c.md`

Frontmatter：

- `docSection: 硬件与总线`
- `docOrder: 50`

内容以本次实机环境为主：

- Ubuntu 16.04.7 LTS；
- Linux 3.14.29 厂商内核；
- 固定 `/boot/nanopi-k2.dtb`，无 overlay 配置；
- 初始只有 `/dev/i2c-0` 和 `i2c_gpio.32`；
- `i2c-0` 扫描出现 `0x50 = UU`，结合 `hdmitx` 日志确认它是 HDMI DDC/EDID 总线；
- `/proc/device-tree` 中四个 `amlogic, meson-i2c` 节点均为 `disabled`；
- Pin 3/5 对应 `i2c-A`，目标节点为 `/i2c@c1108500`；
- 使用 `fdtget`、`fdtput` 和 `dtc` 创建、修改和验证 DTB 副本；
- 修改 `status` 为 `okay`，保留 `pinctrl-0` 等原有属性；
- 替换前备份 DTB，确保有离线恢复手段；
- 重启后出现新总线，并在新总线上检测 `0x40`。

必须把以下内容作为环境边界：

- 节点地址、总线编号和启动方式依赖具体镜像与内核；
- 不能把 `i2c_gpio.32` 中的 `32` 当作 `/dev/i2c-32`；
- 不应盲目套用本机节点地址到其他系统；
- 修改错误可能导致系统无法启动；
- 操作前必须备份 DTB，并说明从另一台 Linux 主机或备用介质恢复的方法。

### 6. PCA9685 与单舵机渐进验证

文件：`pca9685-servo-bringup.md`

Frontmatter：

- `docSection: 调试验证`
- `docOrder: 60`

内容：

- 先只接逻辑电源和 I²C，不接舵机与外部电源；
- 使用 `i2cdetect -l` 识别实际总线编号；
- 在正确总线上用受限地址扫描验证 `0x40`；
- 使用项目 `Pca9685ServoBackend` 做初始化与寄存器读写测试；
- 断电后接独立舵机电源，只接 CH0 的一个舵机；
- 从 1500 微秒中位开始，用 1475/1525 或其他小范围脉宽测试；
- CH0 成功后再测试 CH1；
- 记录抖动、嗡鸣、过热、机械碰撞、K2 重启等立即断电条件；
- 根据实际机械结构逐步标定安全最小值、最大值和中心值。

示例必须默认使用小范围动作，不能直接给出大角度扫动脚本。

### 7. 故障排查手册

文件：`yolo-gimbal-troubleshooting.md`

Frontmatter：

- `docSection: 故障排查`
- `docOrder: 70`

按现象组织：

- `i2cdetect` 显示 `--`；
- 地址显示 `UU`；
- 只有 HDMI DDC 总线；
- `/dev/i2c-1` 不存在；
- PCA9685 指示灯亮但无 I²C 应答；
- SDA/SCL 空闲电平异常；
- `VCC` 与 `V+` 混淆；
- 舵机不动、反向、抖动、持续嗡鸣或撞限位；
- 接入舵机后 K2 重启或网络断开；
- Pan/Tilt 通道互换；
- UDP 数据存在但云台不跟踪；
- 视觉端帧率低、模型延迟高或跟踪 ID 跳变。

每个现象使用统一格式：

1. 现象；
2. 最可能原因；
3. 无破坏性检查；
4. 安全修复步骤；
5. 成功判据；
6. 何时立即停止并断电。

文档还要保留本次排查中出现的认知纠正：看到 `i2c-0` 不代表它连接 40Pin；看到电源灯亮不代表 I²C 接线正确；`0x50 UU` 是识别错误总线的重要线索。

### 8. 部署、启动顺序与恢复

文件：`yolo-gimbal-deployment-operations.md`

Frontmatter：

- `docSection: 部署运维`
- `docOrder: 80`

内容：

- Windows 视觉端与 K2 控制端环境准备；
- 网络端口、主机地址和配置占位符；
- K2 配置中的 `backend: pca9685`、`i2c_bus: 1`、`i2c_address: 0x40` 和 `frequency_hz: 50`；
- 实际总线编号必须以设备当前输出为准，不能固定假设永远是 1；
- 推荐启动顺序：机械检查、K2、PCA9685 逻辑、舵机电源、控制服务、视觉服务；
- 推荐停止顺序和异常断电流程；
- 日志、健康状态和网络连通性验证；
- 配置备份、DTB 恢复、模拟后端回退；
- 维护检查清单和变更记录方式。

## 内容准确性规则

所有文档遵循以下分级：

### 已实机验证

明确标记本次 NanoPi K2 实机得到的输出，例如：

- 初始仅存在 `i2c-0`；
- `0x50` 显示 `UU`；
- `/i2c@c1108500` 初始为 `disabled`；
- 将其改为 `okay` 并重启后出现 `i2c-1`；
- `i2cdetect -y 1 0x40 0x40` 返回 `40`。

### 从项目代码确认

架构、配置字段、后端接口、状态机和通道映射必须以 `zh19990906/yolo-gimbal-tracker` 当前目标分支中的代码和配置为依据。

### 环境相关推断

对总线编号、DTB 节点、舵机行程和供电规格等可能因镜像、克隆板或硬件型号变化的内容，必须显式标记“以本机输出、板上丝印或器件数据手册为准”。

### 尚未完成验证

未在实机完成的步骤，如双舵机全范围标定、长时间稳定性、断网自动回中和完整双机联调，必须写为待验证项，不能描述为已经成功。

## 引用策略

技术事实优先引用第一方资料：

- FriendlyELEC NanoPi K2 官方针脚与系统资料；
- NXP PCA9685 数据手册；
- Linux 内核 I²C、GPIO 和设备树文档；
- `i2c-tools` 手册；
- Ultralytics 官方文档；
- Python 与 websockets 官方文档；
- `zh19990906/yolo-gimbal-tracker` 仓库中的代码、配置和 PR。

文章避免大段转载，只做必要的中文解释和链接引用。

## 安全与隐私边界

所有文档必须：

- 不包含真实私有 IPv4 地址、密码、Token、API Key 或内部域名；
- 命令中的网络地址使用明确占位符；
- 不建议从 K2 的 5V 引脚直接为舵机供电；
- 不把舵机外部电源正极接到 PCA9685 `VCC`；
- 在改线、插拔舵机和修改供电前要求断电；
- 在 DTB 替换前要求备份和恢复路径；
- 在首次动作测试中限制脉宽范围；
- 明确机械堵转、过热、异味和反复重启是立即断电条件。

## 测试策略

新增 `tests/yolo-gimbal-docs.test.mjs`，并从 `tests/docs-core.test.mjs` 导入。

静态检查：

- 8 个预期 Markdown 文件存在；
- 每篇有完整 Frontmatter；
- `contentType`、`docGroup`、`docSection`、`docOrder`、日期和 `draft` 正确；
- 不包含单篇 `author`；
- `src/config/docs.ts` 注册 `yolo-gimbal`，标题和顺序正确；
- 关键主题存在，例如 `ByteTrack`、`Pca9685ServoBackend`、`i2c@c1108500`、`0x50`、`UU`、`0x40`、`nanopi-k2.dtb`、独立舵机电源和 DTB 恢复；
- 不包含真实私有 IPv4、明文凭据或默认弱密码；
- 代码围栏数量为偶数；
- 文档中不把 `i2c_gpio.32` 误写成 `/dev/i2c-32`；
- 设备树文章同时包含备份、验证和恢复说明；
- 舵机文章包含小范围测试和立即断电条件。

验证命令：

```bash
pnpm test:docs
pnpm check
pnpm build
```

若仓库 CI 有独立 Code quality、文档测试、Astro Check 和 Astro Build 工作流，Draft PR 必须等待全部通过。

## 文件变更范围

计划修改：

- `src/config/docs.ts`
- `tests/docs-core.test.mjs`

计划新增：

- `src/content/posts/yolo-gimbal-system-architecture.md`
- `src/content/posts/yolo-gimbal-windows-vision-host.md`
- `src/content/posts/yolo-gimbal-k2-control-service.md`
- `src/content/posts/yolo-gimbal-hardware-wiring.md`
- `src/content/posts/nanopi-k2-enable-header-i2c.md`
- `src/content/posts/pca9685-servo-bringup.md`
- `src/content/posts/yolo-gimbal-troubleshooting.md`
- `src/content/posts/yolo-gimbal-deployment-operations.md`
- `tests/yolo-gimbal-docs.test.mjs`
- `docs/yolo-gimbal-docs-index.md`
- `docs/superpowers/plans/2026-08-05-yolo-gimbal-docs.md`

本设计文档自身位于：

- `docs/superpowers/specs/2026-08-05-yolo-gimbal-docs-design.md`

## 不在首批范围内

本次不包含：

- 修改 `yolo-gimbal-tracker` 的业务代码；
- 重新设计 Fuwari 的文档 UI；
- 新增运行时依赖；
- 制作依赖实物照片的接线插图；
- 自动检测舵机机械极限；
- 远程自动修改读者设备上的 DTB；
- 将旧版 NanoPi K2 系统升级到新内核；
- 声称尚未完成的双舵机全链路联调已经通过。

## 发布方式

设计和实施工作进入独立分支：

```text
agent/yolo-gimbal-docs
```

实施完成后创建 Draft PR 到 `main`。PR 描述应列出：

- 新增专栏与 8 篇文章；
- 本次实机验证范围；
- 设备树修改的高风险提示；
- 新增静态测试；
- 本地与 CI 验证结果；
- 尚未完成的实机验证项。
