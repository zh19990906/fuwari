---
title: Windows/N100 视觉端：相机、YOLO、ByteTrack 与性能诊断
published: 2026-08-05
updated: 2026-08-05
description: 配置跨平台摄像头、Ultralytics YOLO、ByteTrack、目标选择、固定频率 UDP 和 vision perf 性能日志。
tags: [Windows, N100, YOLO26, ByteTrack, OpenCV]
category: YOLO 云台
contentType: docs
docGroup: yolo-gimbal
docSection: 视觉端
docOrder: 20
draft: false
---

视觉主机完成从摄像头到归一化目标误差的全部工作。它可以运行在 Windows 电脑，也可以运行在 Linux N100 上。两种平台共用同一套 YAML 结构和控制协议，只在 OpenCV 相机源解析与采集后端上有所不同。

项目正式支持 Python 3.11+。合并后的 WebSocket 修复兼容 Python 3.10 的 `asyncio.TimeoutError` 语义，但这不代表 Python 3.10 已成为安装或 CI 支持版本。

## 数据处理链路

```text
OpenCV 摄像头
  -> 最新帧缓存
  -> Ultralytics YOLO model.track()
  -> ByteTrack track_id
  -> 配置类别过滤
  -> 主目标选择与切换滞回
  -> 归一化 error_x / error_y
  -> 固定 20 Hz JSON/UDP
```

采集、推理、发送和 Web 展示不是同一个频率：摄像头可能采集 30 FPS，YOLO 只完成 8 FPS，UDP 仍以 20 Hz 发送最新有效结果，MJPEG 又可能限制为 15 FPS。排查性能时必须区分这些速率。

## 安装与配置检查

Windows PowerShell：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install ".[n100]"
yolo-vision --config configs\n100.windows.yaml --check-config
```

Linux/N100：

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install '.[n100]'
cp configs/n100.example.yaml configs/n100.local.yaml
yolo-vision --config configs/n100.local.yaml --check-config
```

`--check-config` 只验证配置，不打开摄像头和模型。先通过静态检查，再启动完整服务，可以把路径、类型和字段错误与运行时硬件问题分开。

## Windows 相机源与 DirectShow

Windows 配置中的数字摄像头索引应写成字符串：

```yaml
camera:
  device: "0"
  width: 640
  height: 480
  fps: 30
  pixel_format: MJPG
  buffer_size: 1
```

项目会把全十进制字符串转换为整数索引并选择 OpenCV `CAP_DSHOW`。例如 `"0"` 和 `"1"` 会被视为本机摄像头编号；非数字字符串保持原样。

推荐使用原生 Windows Python，而不是依赖 Docker Desktop 或 WSL2 透传 USB 摄像头。首次启动前先关闭可能占用设备的会议软件、浏览器相机页面或厂商预览程序。

Windows 防火墙至少要允许：

```powershell
New-NetFirewallRule -DisplayName "YOLO Gimbal Web" `
  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow

New-NetFirewallRule -DisplayName "YOLO Gimbal K2 Status" `
  -Direction Inbound -Protocol UDP -LocalPort 6001 -Action Allow
```

视觉主机使用固定局域网地址或 DHCP 静态租约。配置示例应使用 `VISION_HOST_IP`、`K2_HOST_IP` 之类的占位符，不把真实地址提交到公开仓库。

## Linux/N100 相机源与 V4L2

Linux 的 `/dev/video*` 和 `/dev/v4l/by-id/*` 源会选择 OpenCV `CAP_V4L2`。长期运行推荐使用稳定的 by-id 路径，而不是可能随插拔变化的 `/dev/video0`。

```yaml
camera:
  device: /dev/v4l/by-id/REPLACE_WITH_CAMERA_ID
  width: 1280
  height: 720
  fps: 30
  pixel_format: MJPG
  buffer_size: 1
  reconnect_initial_ms: 250
  reconnect_max_ms: 5000
```

可先检查设备：

```bash
v4l2-ctl --list-devices
v4l2-ctl --device /dev/video0 --list-formats-ext
```

请求的分辨率、FPS 和 MJPG 不一定被摄像头完全接受。运行后应观察实际分辨率和采集速率，而不是只看 YAML 期望值。

## Ultralytics YOLO 与 YOLO26 版本边界

项目依赖约束为：

```text
ultralytics>=8.4.102,<8.5
```

该约束来自项目对 YOLO26 模型使用的验证版本线。模型文件不提交到 Git，配置指向本机路径：

```yaml
vision:
  model_path: C:/code/yolo-gimbal-tracker/models/target.pt
  target_classes: [target_class]
  confidence_threshold: 0.5
  tracker: bytetrack.yaml
```

启动前确认：

- 模型路径存在且当前用户可读；
- 模型类别名称与 `target_classes` 完全一致；
- CPU 环境不要默认采用过大的模型或分辨率；
- 安装后的 Ultralytics 版本位于约束范围；
- 不把模型推理 FPS 与摄像头采集 FPS 混为一谈。

可检查环境：

```bash
python - <<'PY'
import platform
import ultralytics

print("python:", platform.python_version())
print("ultralytics:", ultralytics.__version__)
PY
```

## ByteTrack 与目标 ID

视觉端调用 Ultralytics 跟踪模式，并使用 ByteTrack 维护 `track_id`。跟踪 ID 用于减少多目标之间的频繁切换，但不是永久身份：遮挡、检测中断或场景变化仍可能导致 ID 重建。

目标选择包含：

- 只保留 YAML 配置类别；
- 按目标面积和画面下方位置计算评分；
- 使用 `switch_improvement_ratio` 要求新目标明显更优；
- 使用 `switch_confirmation_frames` 要求连续多帧确认；
- 使用 `lost_timeout_ms` 在短暂遮挡时保留当前目标。

示例参数：

```yaml
vision:
  lost_timeout_ms: 500
  switch_improvement_ratio: 1.2
  switch_confirmation_frames: 5
  area_weight: 0.8
  bottom_weight: 0.2
  result_ttl_ms: 300
```

滞回可以减少跳转，但设置过强会让系统过久坚持错误目标；设置过弱则会在相邻对象之间抖动。调整前先录制日志和视频证据。

## 归一化误差

视觉端以画面中心为零点，将目标中心偏移转换为归一化误差：

```text
error_x < 0：目标在画面左侧
error_x > 0：目标在画面右侧
error_y < 0：目标在画面上方
error_y > 0：目标在画面下方
```

视觉端不直接输出舵机角度或脉宽。方向反转、增益、中心值和安全范围属于 K2 配置。这样更换相机分辨率时，控制接口仍然保持统一。

## 固定 20 Hz UDP 发送

推理线程完成一帧后更新“最新结果”，独立发送循环以配置频率读取：

```yaml
control:
  host: K2_HOST_IP
  port: 6000
  send_rate_hz: 20
```

固定发送频率有三个作用：

1. 避免推理耗时抖动直接变成舵机更新时间抖动；
2. K2 可以用稳定节拍判断消息新鲜度；
3. 性能降低时仍能发送最近一次有效状态或明确的无目标状态。

`result_ttl_ms` 用于限制结果寿命。超过期限的检测不能无限期作为当前目标继续发送。视觉端异常退出后，K2 应依靠本地 holding 和 return-center 处理失联。

## vision perf 聚合日志

项目每 5 秒输出一行低频性能摘要，而不是逐帧刷日志。典型形式：

```text
vision perf fps=8.17 track_call_ms_avg=121.6 track_call_ms_max=137.2 input_age_ms_avg=18.4 preprocess_ms=3.1 inference_ms=104.7 postprocess_ms=7.8 other_ms=6.0 detections_avg=1.20
```

字段含义：

| 字段 | 含义 |
|---|---|
| `fps` | 实际完成推理/跟踪的速率 |
| `track_call_ms_avg` | `model.track()` 平均总耗时 |
| `track_call_ms_max` | 统计周期内最大总耗时 |
| `input_age_ms_avg` | 推理开始时输入帧已经等待的平均时间 |
| `preprocess_ms` | Ultralytics 预处理耗时 |
| `inference_ms` | 模型推理耗时 |
| `postprocess_ms` | 后处理耗时 |
| `other_ms` | 总调用时间中未计入前三阶段的部分 |
| `detections_avg` | 每次结果的平均检测数量 |

诊断思路：

- `inference_ms` 高：优先检查模型大小、输入分辨率、设备选择和硬件能力；
- `preprocess_ms` 高：检查图像尺寸转换、像素格式和 CPU；
- `postprocess_ms` 高：检查候选框数量、置信度阈值和类别；
- `other_ms` 高：可能来自 ByteTrack、Python 调度、数据转换或 Ultralytics 其他开销；
- `input_age_ms_avg` 高：采集速度快于消费速度，处理的是陈旧帧；
- 浏览器流畅但 `fps` 低：MJPEG 与推理是不同链路，不能用网页观感代替推理测量。

先记录同一模型和分辨率下的基线，再逐项修改。不要同时改变模型、输入尺寸、线程数和摄像头格式，否则无法确定收益来源。

## Python 3.10 WebSocket 超时问题

状态 WebSocket 使用 `asyncio.wait_for()` 的超时作为轮询节拍。Python 3.10 抛出 `asyncio.TimeoutError`，较新 Python 版本的异常语义发生变化。原实现只捕获内置 `TimeoutError`，导致 Python 3.10 上正常的轮询超时逃逸为 ASGI 错误。

合并后的修复显式捕获：

```python
except asyncio.TimeoutError:
    pass
```

这个问题与 YOLO 推理慢没有直接因果关系，但大量 WebSocket 异常会干扰性能排查。正式环境仍应升级到 Python 3.11+，而不是以兼容修复为理由长期停留在 3.10。

## 启动与观察

Windows：

```powershell
yolo-vision --config configs\n100.windows.yaml
```

Linux：

```bash
yolo-vision --config configs/n100.local.yaml
```

浏览器访问：

```text
http://VISION_HOST_IP:8000
```

检查顺序：

1. 摄像头是否持续采集；
2. 实际分辨率和采集 FPS 是否合理；
3. 模型是否正确加载；
4. 检测类别和目标 ID 是否符合预期；
5. `vision perf` 的耗时主要位于哪一阶段；
6. UDP 发送是否成功；
7. K2 心跳是否在线；
8. 网页显示的 K2 模式和脉宽是否更新。

## 常见性能决策

### CPU 推理不足

按风险从低到高尝试：

1. 减小输入分辨率；
2. 使用更小的模型；
3. 降低不必要的网页流帧率；
4. 检查是否使用 MJPG，避免高成本原始格式传输；
5. 使用有支持的 GPU/加速后端；
6. 针对目标硬件做专门导出和部署。

每一步都用相同测试场景比较 `inference_ms`、`track_call_ms_avg` 和 `input_age_ms_avg`。

### ID 跳变

先检查检测是否连续，再调整 `lost_timeout_ms`、切换改进比例和确认帧数。目标长期消失后重建 ID 属于正常现象，不能把所有 ID 变化都归因于 ByteTrack 故障。

### 延迟不断累积

项目采用最新帧和小缓冲设计。若 `input_age_ms_avg` 持续增长，检查实际采集实现是否仍只保留最新帧、摄像头驱动是否忽略缓冲配置，以及是否有额外队列保存历史帧。

## 已验证与待验证

已从主分支或合并记录确认：

- Windows 数字索引使用 `CAP_DSHOW`；
- Linux 设备路径使用 `CAP_V4L2`；
- Ultralytics YOLO + ByteTrack；
- 固定 20 Hz UDP 发送；
- 每 5 秒 `vision perf` 聚合日志；
- YOLO26 对应的 Ultralytics 版本约束；
- Python 3.10 `asyncio.TimeoutError` 修复。

仍需在目标机器验证：

- 实际相机可用格式与稳定编号；
- 目标模型在 Windows/N100 上的长期 FPS 和温度；
- 多目标切换参数；
- 与 K2、舵机连接后的端到端延迟和稳定性。

## 参考资料

- 项目仓库：<https://github.com/zh19990906/yolo-gimbal-tracker>
- Ultralytics Track 模式：<https://docs.ultralytics.com/modes/track/>
- Ultralytics Predict 模式：<https://docs.ultralytics.com/modes/predict/>
- OpenCV VideoCapture：<https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html>
- Python `asyncio.wait_for`：<https://docs.python.org/3/library/asyncio-task.html#asyncio.wait_for>
