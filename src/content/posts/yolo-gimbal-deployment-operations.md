---
title: YOLO 云台部署运维：配置、启动顺序、监控、回退与恢复
published: 2026-08-05
updated: 2026-08-05
description: 组织 Windows/N100 与 NanoPi K2 的部署、模拟后端联调、PCA9685 配置、启停顺序、日志和 DTB 恢复。
tags: [部署, 运维, YOLO, NanoPi K2, PCA9685]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 部署运维
docOrder: 80
draft: false
---

本文把视觉主机、NanoPi K2、PCA9685 和双轴舵机组织为一个可重复部署、可回退、可恢复的系统。上线顺序始终是：先软件与模拟后端，后 I²C 与单舵机，最后完整跟踪。

> 本次实机只完成了 NanoPi K2 排针 I²C 启用和 PCA9685 `0x40` 探测。双舵机标定、断网回中和长时间联调仍需按本文验收。

## 部署边界

系统包含两台主机：

| 设备 | 主要职责 | 不负责 |
|---|---|---|
| Windows/N100 视觉主机 | OpenCV、YOLO、ByteTrack、目标选择、UDP 发送、Web 监控 | 直接产生 PWM、执行失联回中 |
| NanoPi K2 | UDP 校验、安全状态机、PCA9685、状态回传 | 摄像头和模型推理 |

网络默认端口：

```text
视觉主机 -> K2：UDP 6000
K2 -> 视觉主机：UDP 6001
浏览器 -> 视觉主机：TCP 8000
```

Web 页面无登录和 TLS，只应在可信局域网使用，不要映射到公网。

## 版本和环境

项目主分支要求 Python 3.11+。

视觉主机安装：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install '.[n100]'
```

Windows PowerShell：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install ".[n100]"
```

K2 安装：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install '.[k2]'
```

本次 K2 系统是 Ubuntu 16.04.7 / Linux 3.14.29。该系统自带 Python 较旧，项目运行依赖单独准备的 Python 3.11 环境。部署前确认：

```bash
python --version
python -c 'import smbus2; print(smbus2.__version__)'
```

不要因为 WebSocket 对 Python 3.10 的 `asyncio.TimeoutError` 兼容修复，就把 3.10 当作正式支持环境。

## 目录与本地配置

推荐把仓库部署到固定目录，例如：

```text
/code/yolo-gimbal-tracker
```

模型、真实地址和实机参数放在不提交的本地文件：

```text
configs/n100.local.yaml
configs/k2.local.yaml
models/target.pt
```

公开示例只使用：

```text
VISION_HOST_IP
K2_HOST_IP
REPLACE_WITH_CAMERA_ID
PAN_MIN_VERIFIED
PAN_MAX_VERIFIED
TILT_MIN_VERIFIED
TILT_MAX_VERIFIED
```

不要把真实内网地址、凭据、模型授权文件或设备唯一信息提交到博客与项目仓库。

## 视觉端配置

Linux/N100：

```yaml
camera:
  device: /dev/v4l/by-id/REPLACE_WITH_CAMERA_ID
  width: 1280
  height: 720
  fps: 30
  pixel_format: MJPG
  buffer_size: 1
vision:
  model_path: /code/yolo-gimbal-tracker/models/target.pt
  target_classes: [target_class]
control:
  host: K2_HOST_IP
  port: 6000
  send_rate_hz: 20
k2_status:
  bind_host: 0.0.0.0
  bind_port: 6001
  allowed_k2_ip: K2_HOST_IP
web:
  bind_host: 0.0.0.0
  port: 8000
```

Windows 相机源：

```yaml
camera:
  device: "0"
  width: 640
  height: 480
  fps: 30
  pixel_format: MJPG
  buffer_size: 1
vision:
  model_path: C:/code/yolo-gimbal-tracker/models/target.pt
```

检查：

```bash
yolo-vision --config configs/n100.local.yaml --check-config
```

或 Windows：

```powershell
yolo-vision --config configs\n100.windows.yaml --check-config
```

## K2 网络与安全配置

```yaml
network:
  bind_host: 0.0.0.0
  control_port: 6000
  allowed_n100_ip: VISION_HOST_IP
  n100_status_host: VISION_HOST_IP
  status_port: 6001
  status_rate_hz: 5
safety:
  max_message_age_ms: 300
  hold_timeout_ms: 500
  return_center_timeout_ms: 2000
  future_tolerance_ms: 1000
control:
  loop_rate_hz: 20
  dead_zone: 0.05
  smoothing_alpha: 0.3
  pan_gain_us: 300
  tilt_gain_us: 300
  max_step_us: 20
```

两台机器应有稳定地址，并保持系统时间大致同步。超时调度使用单调时钟，但协议仍会拒绝明显过旧或来自未来的消息。

## 第一阶段：模拟后端联调

首次部署必须使用模拟后端：

```yaml
servo:
  backend: simulated
  frequency_hz: 50
  i2c_bus: 1
  i2c_address: 0x40
```

这里的 I²C 字段不会驱动硬件，但保留正确格式便于后续切换。

检查 K2：

```bash
k2-gimbal --config configs/k2.local.yaml --check-config
k2-gimbal --config configs/k2.local.yaml
```

再启动视觉端：

```bash
yolo-vision --config configs/n100.local.yaml
```

模拟阶段验收：

- K2 以 5 Hz 回传状态；
- 视觉端页面显示 K2 在线；
- 有目标时进入 tracking；
- 无目标时进入 holding；
- 停止视觉端后先 holding，再 returning_center/IDLE；
- Pan/Tilt 计算脉宽始终在配置范围；
- 浏览器断开不影响 UDP 控制；
- 错误来源地址和非法报文被拒绝。

模拟后端验收未通过，不要接舵机。

## 第二阶段：PCA9685 逻辑验证

只连接：

```text
K2 Pin 1 -> VCC
K2 Pin 3 -> SDA
K2 Pin 5 -> SCL
K2 Pin 6 -> GND
```

不接绿色端子 V+ 和舵机。

```bash
i2cdetect -l
ls -l /dev/i2c-*
i2cdetect -y ACTUAL_BUS 0x40 0x40
```

本次实机结果是 `ACTUAL_BUS=1`，但部署脚本和文档不得假设永远是 1。

项目后端初始化：

```bash
python - <<'PY'
from apps.k2_gimbal.servo.pca9685 import Pca9685ServoBackend

backend = Pca9685ServoBackend(
    i2c_bus=1,
    address=0x40,
    frequency_hz=50,
)
print("PCA9685 backend ready")
backend.close()
PY
```

该步骤尚需在目标实机完成后更新验证记录。

## 第三阶段：单舵机验收

断电接独立 5–6V 到绿色端子 V+/GND，只接 CH0，执行：

```text
1500 -> 1475 -> 1500 -> 1525 -> 1500 us
```

确认电源、机械和方向后，再断电测试 CH1。两个轴分别完成后，记录：

```text
Pan：channel、center_us、min_safe_us、max_safe_us、invert
Tilt：channel、center_us、min_safe_us、max_safe_us、invert
```

示例配置的 1000～2000 微秒不能直接作为已验证范围。

## 第四阶段：真实后端配置

完成实际标定后：

```yaml
servo:
  backend: pca9685
  frequency_hz: 50
  i2c_bus: 1
  i2c_address: 0x40
  pan:
    channel: 0
    center_us: 1500
    min_safe_us: PAN_MIN_VERIFIED
    max_safe_us: PAN_MAX_VERIFIED
    invert: false
  tilt:
    channel: 1
    center_us: 1500
    min_safe_us: TILT_MIN_VERIFIED
    max_safe_us: TILT_MAX_VERIFIED
    invert: false
```

必须把占位值替换为实测整数。核心字段是：

```text
backend: pca9685
i2c_bus: 1
i2c_address: 0x40
frequency_hz: 50
```

其中 `i2c_bus: 1` 仅是本机当前结果。每次迁移系统或修改设备树后重新执行 `i2cdetect -l`。

## 推荐启动顺序

### 日常启动

1. 机械检查：云台没有卡住，线缆有余量；
2. 检查外部舵机电源关闭；
3. 启动 K2；
4. 确认 `/dev/i2c-*`、`0x40` 和系统日志正常；
5. 启动 K2 服务，确认中心脉宽安全；
6. 开启外部舵机电源；
7. 观察 K2 心跳、模式和实际脉宽；
8. 启动视觉服务；
9. 先在小范围场景测试目标；
10. 打开只读监控页面。

K2 服务启动时会写中心，因此外部舵机电源已经开启的情况下，中心值必须经过验证。

### 初次硬件启动

初次测试不要运行完整 K2 服务。使用专用单通道小范围脚本，完成标定后再进入日常启动顺序。

## 推荐停止顺序

当前 K2 `close()` 不显式回中，因此推荐：

1. 停止视觉服务或阻止继续发送目标；
2. 等待 K2 进入 holding；
3. 等待超过回中阈值，观察 returning_center；
4. 确认 Pan/Tilt 回到中心；
5. 关闭外部舵机电源；
6. 停止 K2 服务；
7. 最后关闭 K2。

紧急情况下优先切断外部舵机电源，不要等待软件回中。

## systemd 部署

Linux 视觉主机：

```bash
sudo deploy/install/install-n100.sh
```

K2：

```bash
sudo deploy/install/install-k2.sh
```

安装后编辑：

```text
/etc/yolo-gimbal-tracker/n100.yaml
/etc/yolo-gimbal-tracker/k2.yaml
```

启动和日志：

```bash
sudo systemctl start yolo-vision.service
sudo systemctl start k2-gimbal.service

journalctl -u yolo-vision.service -f
journalctl -u k2-gimbal.service -f
```

旧版 Ubuntu 16.04 上部署前应检查 unit 使用的 Python 路径是否指向项目的 Python 3.11 虚拟环境，而不是系统旧 Python。

不要在未完成硬件标定时设置 K2 服务自动开机并直接驱动真实舵机。

## Windows 自启动

Windows 可先使用手动 PowerShell 启动，完成稳定性验证后再选择任务计划程序或专用服务包装。自启动必须确保：

- 工作目录正确；
- 虚拟环境解释器路径固定；
- 配置文件和模型路径存在；
- 防火墙规则已经配置；
- 失败时日志可见；
- 不会重复启动两个视觉进程争用摄像头。

## 监控与健康判据

### 视觉端

关注：

- 摄像头连接和重连次数；
- 实际分辨率、采集 FPS；
- 推理 FPS；
- `vision perf` 的预处理、推理、后处理和总调用耗时；
- 输入帧年龄；
- 目标类别、ID 和可见状态；
- UDP 发送错误；
- Web `/healthz` 与 `/readyz`。

### K2

关注：

- 最近合法控制消息年龄；
- tracking、holding、returning_center、idle、fault；
- Pan/Tilt 实际脉宽；
- 最近实例 ID 和序号；
- 被拒绝报文计数；
- PCA9685 写入异常；
- K2 重启、掉压和 I²C 错误。

### 电气与机械

关注：

- 外部 V+ 电压；
- 舵机、端子和导线温度；
- 嗡鸣、抖动、堵转和撞限位；
- 两轴运动时线缆拉扯；
- K2 网络是否随舵机动作中断。

## 备份内容

至少备份：

```text
configs/n100.local.yaml
configs/k2.local.yaml
模型文件校验值与来源记录
/boot/nanopi-k2.dtb
/boot/nanopi-k2.dtb.backup-before-i2c
已验证的轴标定表
系统版本和 i2cdetect -l 输出
服务 unit 与 Python 路径
```

配置备份中可能包含真实内网信息，应存放在私有位置，不提交公开博客。

模型建议记录哈希：

```bash
sha256sum models/target.pt
```

## DTB 恢复

更新 K2 系统或替换 DTB 前：

```bash
cp -a /boot/nanopi-k2.dtb \
  "/boot/nanopi-k2.dtb.backup-$(date +%Y%m%d-%H%M%S)"
sync
```

启动失败时使用另一台 Linux 主机挂载存储介质，把已知可用备份恢复为：

```text
/boot/nanopi-k2.dtb
```

恢复后重新确认设备树节点和总线编号，不假定旧的 `i2c_bus` 仍有效。

## 模拟后端回退

出现 I²C、PCA9685、电源或机械异常时，把配置切回：

```yaml
servo:
  backend: simulated
```

模拟后端允许继续验证：

- 视觉端相机和模型；
- UDP 协议；
- K2 状态机；
- Web 监控；
- 网络和时间同步。

它不是隐藏硬件故障的长期方案。故障记录应保留原始日志、接线状态、电源测量和复现步骤。

## 变更管理

每次只修改一类参数：

- 模型或输入分辨率；
- 目标选择参数；
- K2 安全超时；
- 控制增益和平滑；
- 轴方向；
- 安全脉宽；
- 系统、内核或 DTB。

记录：

```text
日期
Git 提交
视觉配置版本
K2 配置版本
模型哈希
系统/内核版本
I²C 总线与地址
硬件改线
测试结果
回滚方式
```

不要同时修改模型、控制参数和机械结构后仅凭“看起来更好”发布。

## 上线前验收

- [ ] 两端 `--check-config` 成功；
- [ ] 模拟后端完成 UDP、状态机和断网逻辑测试；
- [ ] 正确总线检测到 `0x40`；
- [ ] 项目 PCA9685 后端初始化成功；
- [ ] CH0/CH1 单独小范围测试成功；
- [ ] 两轴安全范围已实测并留余量；
- [ ] 外部电源在双轴动作时稳定；
- [ ] 断网后实机先保持再平滑回中；
- [ ] K2 停止后视觉端及时显示离线；
- [ ] 视觉端性能日志没有持续帧积压；
- [ ] 两个浏览器持续观看不影响控制；
- [ ] DTB 和配置均有可用备份；
- [ ] 紧急断电方式清晰可达。

## 本次状态

已验证：

- 旧版 NanoPi K2 的 `i2c-A` 设备树启用；
- 新总线上 PCA9685 地址 `0x40` 应答。

待验证：

- 项目后端真实寄存器初始化；
- CH0/CH1 舵机动作；
- 安全脉宽和方向标定；
- 完整双机跟踪；
- 断网自动回中；
- 30 分钟以上稳定性和多浏览器测试。

## 参考资料

- 项目 README：<https://github.com/zh19990906/yolo-gimbal-tracker>
- 项目 K2 示例配置：<https://github.com/zh19990906/yolo-gimbal-tracker/blob/main/configs/k2.example.yaml>
- 项目视觉端示例配置：<https://github.com/zh19990906/yolo-gimbal-tracker/blob/main/configs/n100.example.yaml>
- FriendlyELEC NanoPi K2：<https://wiki.friendlyelec.com/wiki/index.php/NanoPi_K2>
- Linux systemd 文档：<https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html>
- NXP PCA9685 数据手册：<https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf>
