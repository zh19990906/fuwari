---
title: PCA9685 与双轴舵机渐进验证：从 0x40 到 CH0/CH1 小范围动作
published: 2026-08-05
updated: 2026-08-05
description: 用分阶段方法验证 I²C、项目后端、独立舵机电源和单舵机窄范围运动，降低错接与撞限位风险。
tags: [PCA9685, 舵机, i2cdetect, Python, NanoPi K2]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 调试验证
docOrder: 60
draft: false
---

本文给出从“Linux 能看到 PCA9685”到“单个舵机做小范围运动”的渐进验证流程。每一阶段只增加一个新变量：先总线，再项目驱动，再外部电源，最后才是舵机。

> 不要从完整双机跟踪服务开始测试。错误的通道、方向、中心或安全范围可能让舵机直接撞向机械限位。

## 阶段 0：机械和电气准备

开始前：

- NanoPi K2、PCA9685 和外部舵机电源全部断电；
- 舵机插头暂时拔下；
- 绿色端子 V+ 暂时不接电源；
- PCA9685 只连接 VCC、GND、SDA、SCL；
- K2 Pin 1/3/5/6 分别连接 VCC/SDA/SCL/GND；
- 控制排针 V+ 和 OE 留空；
- 准备随时切断外部舵机电源的开关或插头；
- 云台附近没有障碍物、线缆和手指夹点。

建议准备万用表，至少能测量 3.3V、外部 5–6V 和极性。

## 阶段 1：识别正确的 I²C 总线

```bash
i2cdetect -l
ls -l /dev/i2c-*
```

不要从设备名称猜编号。例如 `i2c_gpio.32` 中的 `32` 不是 `/dev/i2c-32`。

本次 NanoPi K2 修复后出现：

```text
i2c-0：HDMI DDC
i2c-1：40Pin 的 i2c-A
```

其他系统编号可能不同。本文后续用 `1` 表示本次实机总线，执行时必须替换为当前机器的实际编号。

## 阶段 2：受限地址扫描

只扫描 PCA9685 默认地址：

```bash
i2cdetect -y 1 0x40 0x40
```

成功：

```text
40: 40
```

解释：

- `40`：设备应答；
- `--`：当前适配器的该地址没有应答；
- `UU`：地址已被内核驱动占用。

看到 `40` 证明 I²C 逻辑链路基本可用，但不能证明舵机电源、通道方向、机械限位或项目控制参数安全。

若为 `--`，先检查：

```text
PCA9685 VCC 对 GND：约 3.3V
SDA 空闲对 GND：通常约 3.3V
SCL 空闲对 GND：通常约 3.3V
```

同时确认没有误扫 HDMI DDC 总线。

## 阶段 3：安装 K2 Python 依赖

在项目虚拟环境中：

```bash
cd /code/yolo-gimbal-tracker
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[k2]'
```

项目正式要求 Python 3.11+。本次旧系统原生环境较老时，可以使用已准备好的 Python 3.11 虚拟环境，但需要确保 `smbus2` 能访问宿主机 `/dev/i2c-*`。

检查：

```bash
python - <<'PY'
import platform
import smbus2

print("python:", platform.python_version())
print("smbus2:", smbus2.__version__)
PY
```

## 阶段 4：不接舵机的项目后端初始化

保持外部 V+ 和所有舵机断开，运行：

```bash
cd /code/yolo-gimbal-tracker
source .venv/bin/activate

python - <<'PY'
from apps.k2_gimbal.servo.pca9685 import Pca9685ServoBackend

backend = Pca9685ServoBackend(
    i2c_bus=1,
    address=0x40,
    frequency_hz=50,
)

print("PCA9685 初始化及寄存器读写成功")
backend.close()
PY
```

构造函数会：

1. 打开 `smbus2.SMBus(1)`；
2. 读取 MODE1；
3. 写入 50 Hz 所需的预分频；
4. 恢复运行模式；
5. 配置 MODE2。

如果初始化中途失败，类会关闭自己打开的总线并重新抛出异常。

成功判据：

```text
PCA9685 初始化及寄存器读写成功
```

失败时不要急着接舵机。保留完整异常堆栈，检查：

- `i2c_bus` 是否是实际总线；
- 地址是否为 `0x40`；
- 当前用户是否有权限访问 `/dev/i2c-1`；
- `smbus2` 是否安装在当前虚拟环境；
- 设备是否在运行中掉线。

## 阶段 5：配置权限

临时用 root 运行可以排除权限问题，但长期服务应使用专用用户并加入 `i2c` 组：

```bash
getent group i2c
usermod -aG i2c SERVICE_USER
```

重新登录或重启服务后检查：

```bash
id SERVICE_USER
ls -l /dev/i2c-1
```

不要为了省事把 `/dev/i2c-*` 永久改为所有用户可写。

## 阶段 6：断电接入独立舵机电源

先关闭 K2：

```bash
poweroff
```

确认系统完全停止并拔掉 K2 电源，然后连接：

```text
外部 5–6V 正极 -> PCA9685 绿色端子 V+
外部电源负极   -> PCA9685 绿色端子 GND
```

重新核对：

- V+ 与 GND 没有反接；
- 外部电源没有接到 VCC；
- K2 GND、PCA9685 GND 和外部电源负极共地；
- 外部电源电流能力足够；
- 此时仍不接舵机。

开启外部电源后，用万用表测绿色端子 V+ 对 GND。电压应符合舵机规格且极性正确。

再次关闭外部电源和 K2，准备接单个舵机。

## 阶段 7：只接 CH0

断电后把底座水平轴舵机接入 CH0：

```text
舵机信号线 -> S / PWM
舵机红线   -> V+
舵机黑/棕线 -> GND
```

以板上通道排针丝印为准。常见线色不能替代核对。

不要接 CH1。一次只验证一个舵机，可以快速判断故障来自哪个通道、插头或机械轴。

## 阶段 8：CH0 小范围脉宽测试

通电顺序：

1. 启动 K2；
2. 确认系统和 I²C 正常；
3. 开启外部舵机电源；
4. 运行小范围脚本。

```bash
cd /code/yolo-gimbal-tracker
source .venv/bin/activate

python - <<'PY'
import time

from apps.k2_gimbal.servo.pca9685 import Pca9685ServoBackend

backend = Pca9685ServoBackend(
    i2c_bus=1,
    address=0x40,
    frequency_hz=50,
)

try:
    for pulse_us in (1500, 1475, 1500, 1525, 1500):
        print(f"CH0 -> {pulse_us} us")
        backend.set_pulse_us(0, pulse_us)
        time.sleep(2)
finally:
    backend.set_pulse_us(0, 1500)
    backend.close()
PY
```

脚本只在中心附近变化 25 微秒。动作可能很小，目的是确认：

- CH0 确实控制 Pan；
- 舵机能接收 PWM；
- 方向和机械结构没有明显危险；
- K2 与电源不会因一个舵机动作而重启。

`finally` 会尝试写回 1500 微秒，但不能保证在断电、I²C 故障、进程强杀或舵机卡死时成功。外部电源开关仍是最终安全措施。

## 动作太小时如何扩大范围

先确认 1475/1525 不会卡住、发热或撞限位，再改为：

```text
1450 -> 1500 -> 1550 -> 1500
```

每次只增加小步长。不要一开始使用 1000/2000 微秒等通用大范围，因为实际云台连杆和舵机安装角度可能远小于常见行程。

## 阶段 9：只接 CH1

CH0 测试完成后：

1. 停止脚本；
2. 关闭外部舵机电源；
3. 关闭 K2 并拔电；
4. 拔下 CH0；
5. 把俯仰舵机接到 CH1；
6. 把测试脚本中的通道 `0` 改为 `1`；
7. 重复 1500/1475/1525 测试。

单独测试 CH1 可以避免两个舵机同时启动造成瞬时电流过大，也便于观察 Tilt 的机械限位。

## 阶段 10：两个舵机同时连接

两个轴分别通过后，断电连接 CH0 和 CH1。此时仍不应直接全范围扫动，而是：

1. 先写两个中心值；
2. 分别对 Pan、Tilt 做很小偏移；
3. 检查一个轴动作是否拉扯另一轴线缆；
4. 观察外部电源电压和 K2 稳定性；
5. 逐轴标定最小、中心和最大安全脉宽。

记录示例：

| 轴 | 通道 | 中心 | 已验证最小 | 已验证最大 | invert |
|---|---:|---:|---:|---:|---|
| Pan | 0 | 1500 | 待验证 | 待验证 | 待验证 |
| Tilt | 1 | 1500 | 待验证 | 待验证 | 待验证 |

没有实测之前，不要把示例配置的 1000～2000 微秒当作安全范围。

## 阶段 11：切换完整 K2 服务

先用模拟后端确认网络和状态机：

```yaml
servo:
  backend: simulated
```

然后把实际总线、地址和已标定脉宽写入本地配置：

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

占位值必须换成实测整数后再启动。

```bash
k2-gimbal --config configs/k2.local.yaml --check-config
k2-gimbal --config configs/k2.local.yaml
```

服务启动时会写中心脉宽，所以启动前机械结构必须允许该中心位置。

## 立即断电条件

出现以下任何情况，立即关闭外部舵机电源：

- 舵机猛烈撞击限位；
- 持续嗡鸣但轴不动；
- 舵机、导线、PCA9685 或端子明显发热；
- 有焦味、烟雾、火花；
- K2 重启、掉线或系统日志出现欠压相关异常；
- 外部电源进入保护；
- 运动方向明显会继续拉断线缆；
- I²C 在动作时持续报错。

切断舵机电源后，再停止 Python 程序和 K2。不要在舵机持续堵转时花时间查看日志。

## 常见失败

### `Permission denied: /dev/i2c-1`

当前用户没有访问权限。检查 `i2c` 组和服务用户，不要修改为全局可写。

### `OSError: Remote I/O error`

常见原因包括错误总线、掉线、VCC/GND 接触不良、SDA/SCL 受干扰或 PCA9685 地址不符。先回到 `i2cdetect -y BUS 0x40 0x40`。

### PCA9685 初始化成功但舵机不动

检查：

- 绿色端子 V+ 是否有正确外部电压；
- 舵机插头方向；
- 是否插在脚本使用的 CH0/CH1；
- OE 是否被拉高；
- 舵机是否损坏；
- 小范围变化是否小到肉眼不明显。

### 接舵机后 K2 重启

优先怀疑外部电源能力不足、错误从 K2 取舵机电源、共地或短路。不要通过提高软件重试次数解决供电问题。

### 动作方向相反

电气连接正确时，修改轴配置的 `invert`，或重新定义 Pan/Tilt 正方向。不要反接舵机电源线。

## 本次验证状态

已完成：

- `i2cdetect -l` 识别排针总线；
- `i2cdetect -y 1 0x40 0x40` 返回 `40`。

在写本文时仍应视为待验证：

- 项目 `Pca9685ServoBackend` 的实机初始化输出；
- CH0 的 1500/1475/1525 动作；
- CH1 的同类动作；
- 两轴安全范围标定；
- 完整跟踪和断网回中。

后续完成每一步后，应更新本文的验证日期、硬件型号和结果，而不是只在聊天记录中保留。

## 参考资料

- 项目 PCA9685 后端：<https://github.com/zh19990906/yolo-gimbal-tracker/blob/main/apps/k2_gimbal/servo/pca9685.py>
- 项目 K2 配置：<https://github.com/zh19990906/yolo-gimbal-tracker/blob/main/configs/k2.example.yaml>
- NXP PCA9685 数据手册：<https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf>
- Linux I²C 用户空间接口：<https://docs.kernel.org/i2c/dev-interface.html>
- `smbus2` 项目：<https://github.com/kplindegaard/smbus2>
