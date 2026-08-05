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

本文记录 `zh19990906/yolo-gimbal-tracker` 当前主分支的系统结构。项目把视频推理和舵机执行拆到两台机器：Windows/N100 视觉主机负责摄像头、YOLO、ByteTrack 和目标选择，NanoPi K2 只负责接收控制量、执行安全状态机并驱动 PCA9685。

> 本文描述代码当前具备的能力。PCA9685 的 I²C 探测已经在一台 NanoPi K2 上完成；双舵机全范围标定、长时间稳定性和完整断网回中仍属于待验证项目。

## 系统目标与适用范围

系统面向局域网内的双轴视觉云台：摄像头观察目标，视觉端计算目标相对画面中心的误差，K2 把误差转换为 Pan/Tilt 舵机脉宽。设计重点不是“让舵机尽快动”，而是在推理变慢、网络丢包、进程退出或硬件写入失败时仍保持可预测行为。

适合以下场景：

- 视觉主机有比 K2 更强的 CPU 或 GPU；
- 摄像头直接连接 Windows 或 N100；
- K2 靠近云台和 PCA9685；
- 两台机器位于可信局域网；
- 控制链路要求失联后保持并回中。

Web 页面当前只读，没有认证、TLS、手动转动或在线修改控制参数，不应暴露到公网。

## 双机职责边界

### Windows/N100 视觉主机

视觉主机负责：

1. 使用 OpenCV 打开 USB 摄像头；
2. 使用 Ultralytics YOLO 检测目标；
3. 使用 ByteTrack 维护目标 ID；
4. 按配置过滤类别并选择主目标；
5. 计算归一化水平、垂直误差；
6. 以固定 20 Hz 通过 JSON/UDP 发送最新控制消息；
7. 接收 K2 以 5 Hz 回传的状态；
8. 提供 FastAPI、MJPEG、WebSocket、健康检查和只读监控页面。

视觉主机不直接产生舵机 PWM，也不能仅凭一次 `sendto()` 成功断言云台已经执行。实际状态必须以 K2 心跳、模式和脉宽为准。

### NanoPi K2 控制主机

NanoPi K2 不接触视频。它负责：

1. 只接受配置允许的视觉主机地址；
2. 校验协议版本、消息类型、实例 UUID、序号、时间戳和字段范围；
3. 以固定 20 Hz 运行控制循环；
4. 应用死区、平滑、最大步进和安全脉宽限制；
5. 根据消息新鲜度进入 tracking、holding、return-center 或 fault；
6. 通过 simulated 或 PCA9685 后端输出；
7. 以 5 Hz 回传在线状态、模式、实际脉宽和故障。

把安全控制放在 K2 上意味着视觉端崩溃时，舵机不依赖 Windows 继续发送“回中”命令。

## 从摄像头到舵机的数据流

```text
USB 摄像头
    │
    ▼
OpenCV 采集线程
    │ 最新帧
    ▼
Ultralytics YOLO + ByteTrack
    │ 检测框、类别、track_id
    ▼
类别过滤与目标选择
    │ 目标中心点
    ▼
归一化误差 error_x / error_y
    │ 固定 20 Hz JSON/UDP
    ▼
NanoPi K2 消息校验
    │
    ▼
状态机 + 死区 + 平滑 + 最大步进 + 脉宽限位
    │
    ▼
Pca9685ServoBackend
    │ CH0 / CH1 PWM
    ▼
Pan / Tilt 舵机
```

归一化误差通常以画面中心为零点。视觉端只表达“目标偏离中心多少”，不直接指定绝对角度。K2 根据增益、方向和安全范围计算下一次脉宽，这样电气与机械限制不会散落在视觉代码中。

## UDP 控制与状态回传

控制与状态使用严格的版本化 JSON/UDP：

- 视觉主机到 K2：默认 UDP 6000，固定 20 Hz；
- K2 到视觉主机：默认 UDP 6001，固定 5 Hz；
- 每次进程启动生成新的 `instance_id`；
- 序号只在同一个实例内单调递增；
- 数据报最大 4096 字节；
- 未知字段、错误类型、过旧或明显来自未来的消息会被拒绝。

UDP 不提供连接或自动重传，因此系统采用“持续发送最新状态”，而不是补发历史控制消息。旧的目标误差没有控制价值，晚到的数据不应覆盖更新的数据。

跨设备 Unix 时间只用于拒绝明显异常的报文。本地超时和调度使用单调时钟，避免系统时间校准导致保持或回中计时跳变。

## 四种安全状态

### tracking

收到合法且足够新的目标控制消息时，根据误差更新 Pan/Tilt。输出仍受到死区、平滑、最大步进和安全脉宽限制。

### holding

超过保持阈值没有收到新控制消息时，维持最近的安全输出，不继续追随陈旧目标。示例配置的保持阈值是 500 ms。

### return-center

失联持续超过回中阈值后，输出以受限步进逐渐靠近中心脉宽，而不是瞬间跳回中位。示例配置阈值为 2000 ms。代码状态有时显示为 `returning_center`，本文统一用概念名称 `return-center` 描述该阶段。

### fault

舵机后端写入失败等硬件异常会锁存 fault，控制器不继续发送新的偏转。当前版本需要人工排障或重启服务恢复，不能用无限重试掩盖电源、总线或机械故障。

非法远端数据包只会被拒绝和计数，不会因为网络噪声直接把云台锁进 fault。

## 为什么推理与控制分离

YOLO 推理 FPS 会随模型、输入分辨率和硬件负载变化。如果把舵机更新直接绑定到每次推理完成：

- 推理抖动会转化为不均匀舵机运动；
- 模型阻塞会让安全超时逻辑一起阻塞；
- Windows 进程崩溃后没有本地执行器负责回中；
- 摄像头和 I²C 故障难以分别定位。

当前架构让推理线程产生“最新结果”，发送循环固定 20 Hz 读取最新结果；K2 再以固定 20 Hz 执行安全控制。监控网页不在实时闭环中，浏览器断开或 Web 服务失败不应停止 UDP 控制核心。

## 失联与退出行为

典型故障及预期行为：

| 故障 | 预期行为 |
|---|---|
| 摄像头短暂断开 | 视觉端退避重连，不发送无限期陈旧目标 |
| YOLO 推理变慢 | 发送循环仍按固定频率工作，并报告帧年龄和性能 |
| 浏览器断开 | 不影响视觉控制与 K2 |
| 单次 UDP 发送失败 | 记录错误，后续周期继续发送最新状态 |
| 视觉端停止或网络中断 | K2 先 holding，随后 return-center |
| K2 停止 | 视觉端约在状态离线阈值后显示 K2 离线 |
| PCA9685 写入异常 | K2 进入 fault，停止继续偏转 |

“代码包含回中状态机”不等于实机已经完成断网回中验收。机械安装、舵机电源和安全脉宽确定后，仍需按硬件验收清单逐项验证。

## 项目目录与配置入口

主要入口：

```text
apps/n100_vision/       视觉主机应用
apps/k2_gimbal/         K2 控制应用
packages/protocol/      双向 UDP 协议
configs/n100.example.yaml
configs/k2.example.yaml
deploy/install/         Linux 安装脚本
deploy/systemd/         systemd 单元
```

命令行入口：

```bash
yolo-vision --config configs/n100.local.yaml --check-config
k2-gimbal --config configs/k2.local.yaml --check-config
```

首次联调应保持 `servo.backend: simulated`。网络、状态机和配置稳定后，再在断电状态接入 PCA9685 和单个舵机。

## 已验证与待验证

### 已从代码或合并记录确认

- Linux/Windows 相机后端选择；
- YOLO、ByteTrack、类别过滤和目标切换滞回；
- 固定 20 Hz 控制消息与 5 Hz K2 状态回传；
- simulated/PCA9685 后端；
- tracking、holding、return-center、fault 安全逻辑；
- YOLO26 性能聚合日志；
- Python 3.10 `asyncio.TimeoutError` 兼容修复。

### 本次实机已验证

- 在旧版 NanoPi K2 系统启用排针 I²C；
- 新总线能在地址 `0x40` 检测到 PCA9685。

### 仍待实机验证

- 项目 Python 后端对实物 PCA9685 的初始化；
- CH0/CH1 单舵机小范围运动；
- 两轴安全最小值、中心值和最大值标定；
- 断网自动回中；
- 双机持续运行和多浏览器耐久测试。

## 参考资料

- 项目仓库：<https://github.com/zh19990906/yolo-gimbal-tracker>
- Ultralytics 跟踪模式：<https://docs.ultralytics.com/modes/track/>
- OpenCV VideoCapture：<https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html>
- Linux I²C 用户空间接口：<https://docs.kernel.org/i2c/dev-interface.html>
- NXP PCA9685 数据手册：<https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf>
