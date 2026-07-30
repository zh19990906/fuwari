---
title: YOLO 模型导出、基准测试与部署检查
published: 2026-06-20
updated: 2026-07-30
description: 将 YOLO 模型导出到 ONNX、TensorRT 或 OpenVINO，并验证精度、延迟和运行环境。
tags: [YOLO, ONNX, TensorRT, OpenVINO, 部署]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 部署
docOrder: 60
draft: false
---

模型训练完成不等于部署完成。真正的部署链路包括预处理、推理运行时、输出解析、阈值、后处理、并发、监控和回滚。

## 保存部署基线

导出前记录：

- 模型权重 SHA256；
- `ultralytics`、PyTorch、CUDA 和驱动版本；
- 输入尺寸、颜色空间和归一化方式；
- 类别名称和顺序；
- 置信度与 IoU 阈值；
- 一组固定回归图片及 PyTorch 输出；
- 目标硬件上的基准命令。

```bash
sha256sum best.pt
python -m pip freeze > deployment-requirements.txt
```

## 导出 ONNX

```bash
yolo export \
  model=best.pt \
  format=onnx \
  imgsz=640 \
  dynamic=True \
  simplify=True
```

Python：

```python
from ultralytics import YOLO

model = YOLO("best.pt")
model.export(format="onnx", imgsz=640, dynamic=True, simplify=True)
```

动态尺寸更灵活，但可能影响运行时优化。输入尺寸固定的生产服务可以同时评估静态模型。

## TensorRT

```bash
yolo export model=best.pt format=engine imgsz=640 device=0 half=True
```

TensorRT 引擎通常与 GPU 架构、CUDA、TensorRT 版本和构建环境相关。不要默认把一台机器生成的引擎复制到所有设备后都能正常运行。

FP16 通常是常见折中。INT8 需要代表性校准数据，并必须重新验证精度。

## OpenVINO

```bash
yolo export model=best.pt format=openvino imgsz=640 half=True
```

OpenVINO 适合 Intel CPU、GPU 和部分 NPU 场景。应在真实目标设备上测试线程、批量大小和异步请求配置。

## 导出后验证

对固定回归集运行 PyTorch 与目标后端，比较：

- 预处理后输入张量；
- 检测数量与类别；
- 置信度差异；
- 坐标或掩码误差；
- 是否仍需要 NMS；
- 冷启动和热运行延迟；
- 峰值内存和显存。

允许浮点误差，但业务关键结果不能出现不可解释的明显偏差。

## 基准测试

区分以下指标：

- 模型纯推理时间；
- 预处理 + 推理 + 后处理端到端时间；
- 单张延迟与批量吞吐；
- P50、P95、P99 延迟；
- 冷启动时间；
- CPU/GPU 利用率、内存和功耗。

简单平均值可能掩盖长尾问题。实时视频应用还要观察积压、丢帧和流关闭时的资源释放。

## 服务化建议

- 启动时加载一次模型，不要每次请求重新加载。
- 限制上传文件大小、图像尺寸和并发。
- 为队列、推理和外部存储设置超时。
- 对 GPU 推理使用有上限的工作队列。
- 记录模型版本、请求耗时、错误和置信度统计。
- 健康检查区分“进程存活”和“模型可推理”。
- 保留上一个可用模型，支持快速回滚。

## 容器化

Dockerfile 中固定运行时和系统依赖版本。不要把训练数据、密钥和大量中间文件放进镜像。

GPU 容器还需要宿主机驱动和 NVIDIA Container Toolkit 配合。镜像包含 CUDA 用户态库，不会替代宿主机 GPU 驱动。

## 上线检查清单

1. 在目标硬件完成精度和性能测试。
2. 验证错误输入、超大图片和空结果。
3. 固定模型、运行时和配置版本。
4. 配置资源限制、超时、日志和指标。
5. 执行压力测试和长时间稳定性测试。
6. 准备灰度、回滚和模型文件完整性校验。
7. 确认模型、代码和依赖许可证。

## 参考资料

- [Ultralytics 导出模式](https://docs.ultralytics.com/zh/modes/export/)
- [Ultralytics 基准测试模式](https://docs.ultralytics.com/zh/modes/benchmark/)
