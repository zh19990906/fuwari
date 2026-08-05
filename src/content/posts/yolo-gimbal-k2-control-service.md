---
title: NanoPi K2 控制端：消息校验、状态机与舵机安全限制
published: 2026-08-05
updated: 2026-08-05
description: 说明 K2 的 UDP 接收、20 Hz 安全控制、holding/return-center/fault 状态、脉宽限制和 PCA9685 后端。
tags: [NanoPi K2, UDP, 状态机, PCA9685, 舵机]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 控制端
docOrder: 30
draft: false
---

NanoPi K2 是云台的最后安全边界。它不处理摄像头或 YOLO，而是把视觉主机发送的归一化误差转换为受限舵机脉宽，并在消息停止、网络中断和硬件写入失败时执行明确状态。

本文以 `yolo-gimbal-tracker` 当前主分支代码为准，并特别区分“代码逻辑存在”和“实机已经验收”。

## 服务组装

`apps/k2_gimbal/main.py` 的 `build_service()` 组装以下组件：

```text
K2 配置
  ├─ UdpControlReceiver
  ├─ ControlSequenceValidator
  ├─ SimulatedServoBackend 或 Pca9685ServoBackend
  ├─ GimbalController
  ├─ SafetyStateMachine
  ├─ StatusSender
  └─ K2Service
```

命令入口：

```bash
k2-gimbal --config configs/k2.local.yaml --check-config
k2-gimbal --config configs/k2.local.yaml
```

先使用 `--check-config`，避免服务打开 I²C 后才发现字段类型或范围错误。

## 网络和消息边界

示例配置包含：

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
```

K2 只接受配置中的视觉主机地址。协议校验还覆盖：

- 消息类型和协议版本；
- `instance_id` 是否为规范 UUID；
- 同一实例中的序号是否递增；
- Unix 时间是否明显过旧或来自未来；
- 字段是否齐全、类型和范围是否正确；
- 是否存在未知字段；
- 数据报是否超过大小限制。

非法网络包会被拒绝和计数，不会仅因为格式错误就进入 fault。硬件写入错误才属于需要锁存的执行器故障。

## 固定频率循环

示例配置：

```yaml
control:
  loop_rate_hz: 20
```

K2 控制循环以固定 20 Hz 调用状态机，状态回传以 5 Hz 发送。视觉端推理可能不是 20 FPS，但控制器的安全计时和舵机步进不直接跟随每次推理完成时间。

所有超时判断使用本机单调时钟。跨设备时间戳用于报文新鲜度边界，不承担本地调度计时。

## 启动状态

`SafetyStateMachine.start()` 首先调用 `controller.write_center()`，成功后进入 `IDLE`。这意味着服务启动时会立即向后端写入 Pan/Tilt 中心脉宽。

因此切换到真实 PCA9685 前必须完成以下检查：

- 云台安装在中心位置附近；
- 中心脉宽不会撞机械限位；
- 外部舵机电源电压和极性正确；
- Pan/Tilt 通道没有插反；
- 首次实机测试使用窄脉宽范围。

若启动时写中心失败，状态机会设置 `FAULT` 和 `SERVO_WRITE_FAILED`，并重新抛出异常。

## tracking、holding、return-center 与 fault

代码中的枚举状态还包括 `STARTING` 和 `IDLE`。运行中最重要的四个概念如下。

### tracking

最近控制消息年龄不超过 `hold_timeout_ms`，且 `target_visible` 为真时：

```text
error_x / error_y
  -> 方向反转（可选）
  -> 死区
  -> EMA 平滑
  -> 增益换算
  -> 最大单步限制
  -> 安全脉宽裁剪
  -> 后端写入
```

成功后状态为 `TRACKING`。

### holding

出现以下任一情况时保持当前输出：

- 控制消息仍然足够新，但 `target_visible` 为假；
- 最后消息年龄超过保持阈值，但尚未超过回中阈值。

holding 不会继续使用陈旧误差追踪，也不会立即跳回中心。

### return-center

最后合法消息年龄超过 `return_center_timeout_ms` 后，代码状态为 `RETURNING_CENTER`。每个控制周期调用 `step_toward_center()`，Pan/Tilt 每次最多移动 `max_step_us`，到达中心后进入 `IDLE`。

本文用 `return-center` 表示这一概念；网页或协议中可能显示 `returning_center`。

### fault

后端写中心、跟踪或回中时抛出异常，状态机会：

1. 设置模式为 `FAULT`；
2. 保存 `FaultInfo("SERVO_WRITE_FAILED", ...)`；
3. 停止后续控制更新；
4. 将异常继续上抛，由服务日志记录。

当前版本没有自动清除 fault。恢复前应先排查电源、I²C、PCA9685、接线和机械堵转，再人工重启服务。

## 死区、EMA 和最大步进

示例配置：

```yaml
control:
  dead_zone: 0.05
  smoothing_alpha: 0.3
  pan_gain_us: 300
  tilt_gain_us: 300
  max_step_us: 20
```

### 死区

当误差绝对值不超过 `dead_zone` 时，控制器把该轴过滤值设为零并重置 EMA，避免目标在中心附近因检测噪声持续微动。

### EMA 平滑

误差超出死区后使用指数移动平均：

```text
filtered = alpha * current + (1 - alpha) * previous
```

较大的 `smoothing_alpha` 更快响应当前误差，较小值更平滑但延迟更大。

### 最大单步

控制器先计算目标脉宽，再通过 `max_step_us` 限制一次循环最多改变多少微秒。20 Hz 下，`max_step_us: 20` 理论上限制每秒最多累计约 400 微秒，但实际还受误差、增益和安全边界影响。

最大步进不是机械速度标定的替代品。不同舵机在相同脉宽变化下的速度、负载和惯性不同。

## Pan/Tilt 轴配置

示例：

```yaml
servo:
  pan:
    channel: 0
    center_us: 1500
    min_safe_us: 1000
    max_safe_us: 2000
    invert: false
  tilt:
    channel: 1
    center_us: 1500
    min_safe_us: 1000
    max_safe_us: 2000
    invert: false
```

初始约定：

- CH0：Pan，底座水平旋转；
- CH1：Tilt，上层俯仰。

这只是配置约定，不是硬件强制规则。若实际通道相反，可以交换舵机插头或修改配置，但一次只改变一个因素。

`invert` 只反转控制误差方向，不会改变舵机插头、电源极性或 PWM 引脚。

## simulated 后端

首次部署保持：

```yaml
servo:
  backend: simulated
```

模拟后端用于验证：

- 配置能加载；
- UDP 消息可以接收；
- 状态转换符合预期；
- Pan/Tilt 脉宽始终在安全范围；
- 视觉端能收到 K2 真实心跳；
- 停止视觉端后出现 holding 和 returning_center。

模拟后端通过不代表实物供电、I²C 和机械结构安全，但可以提前排除大部分软件与网络问题。

## Pca9685ServoBackend

真实后端配置：

```yaml
servo:
  backend: pca9685
  frequency_hz: 50
  i2c_bus: 1
  i2c_address: 0x40
```

实际总线编号必须以 `i2cdetect -l` 和 `/dev/i2c-*` 为准。本文实机启用后是 `i2c-1`，其他镜像可能不同。

`Pca9685ServoBackend` 初始化时：

1. 打开 `smbus2.SMBus(i2c_bus)`；
2. 读取 MODE1；
3. 进入睡眠并写入预分频；
4. 恢复 MODE1；
5. 设置自动递增和 MODE2 输出方式。

`set_pulse_us(channel, pulse_us)` 把微秒换算为 12 位 PWM 计数，并写入对应通道的四个寄存器。类本身只验证脉宽位于当前 PWM 周期内；真正的舵机安全最小值和最大值由 `GimbalController` 的轴配置裁剪。

## 状态回传

K2 状态发送器回传：

- 当前后端；
- 当前模式；
- Pan/Tilt 脉宽；
- fault 信息；
- 最近控制实例和序号；
- 进程运行时间等状态。

视觉端网页中的“K2 在线”来自合法状态包的新鲜度，而不是视觉端本机 UDP 发送成功。

## 停止服务的当前行为

命令行捕获 `KeyboardInterrupt` 后调用 `service.close()`，最终关闭控制器和后端。当前 `close()` 路径没有显式先执行 `write_center()`。

因此不要把“正常停止进程”写成“必然自动回中”。更安全的运维方式是：

1. 停止视觉端发送并观察 K2 进入 return-center；
2. 确认脉宽回到中心；
3. 再停止 K2 服务；
4. 最后切断舵机外部电源。

后续若修改代码增加关停回中，也应考虑 I²C 已故障、机械卡住和进程被强制终止时无法保证执行。

## 配置与启动检查

```bash
cp configs/k2.example.yaml configs/k2.local.yaml
k2-gimbal --config configs/k2.local.yaml --check-config
```

首次网络联调：

```yaml
servo:
  backend: simulated
```

真实硬件前检查：

```bash
i2cdetect -l
ls -l /dev/i2c-*
i2cdetect -y 1 0x40 0x40
```

看到地址 `40` 后，也只说明 I²C 设备应答。仍需完成项目后端初始化和单舵机窄范围测试。

## 验收清单

- [ ] `--check-config` 成功；
- [ ] simulated 后端能持续回传状态；
- [ ] 视觉端停止后先 holding，再 returning_center；
- [ ] 所有脉宽始终处于轴安全范围；
- [ ] I²C 正确总线上能检测 `0x40`；
- [ ] 单个 CH0 舵机从 1500 微秒做小范围测试；
- [ ] CH1 单独测试；
- [ ] 方向、中心和机械限位逐轴标定；
- [ ] 断网回中实机验收；
- [ ] 后端写入故障时 fault 锁存且不继续偏转。

## 参考资料

- 项目 K2 代码：<https://github.com/zh19990906/yolo-gimbal-tracker/tree/main/apps/k2_gimbal>
- 项目 K2 示例配置：<https://github.com/zh19990906/yolo-gimbal-tracker/blob/main/configs/k2.example.yaml>
- Linux I²C 用户空间接口：<https://docs.kernel.org/i2c/dev-interface.html>
- NXP PCA9685 数据手册：<https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf>
