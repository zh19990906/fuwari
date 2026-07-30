---
title: YOLO11 生产基线与迁移实践
published: 2024-09-10
updated: 2026-07-30
description: 使用 YOLO11 建立检测基线，并从 YOLOv8 迁移时验证精度、延迟和导出兼容性。
tags: [YOLO11, Ultralytics, 模型迁移]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 版本实践
docOrder: 40
draft: false
---

YOLO11 于 2024 年 9 月 10 日发布，延续了 Ultralytics 的统一 API，同时优化了模型效率。对于已经使用 YOLOv8 的团队，迁移通常不难，但不能只替换权重文件后直接上线。

## 环境与模型

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade ultralytics
```

推理：

```bash
yolo predict model=yolo11n.pt source=images/ imgsz=640 conf=0.25
```

Python：

```python
from ultralytics import YOLO

model = YOLO("yolo11n.pt")
results = model("images/example.jpg", imgsz=640, conf=0.25)
```

## 训练基线

```bash
yolo detect train \
  model=yolo11n.pt \
  data=data.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  device=0 \
  project=runs/yolo11 \
  name=baseline
```

先保持数据、图像尺寸、训练轮数、设备和评估脚本与旧模型一致，建立公平比较。

## 从 YOLOv8 迁移

至少比较：

- 同一验证集上的每类 AP、召回率和混淆矩阵；
- 真实业务图片和视频中的误检、漏检；
- PyTorch、ONNX、TensorRT 等实际后端延迟；
- CPU、GPU、边缘设备上的内存峰值；
- 批量大小为 1 和真实并发下的吞吐；
- 预处理、输出张量、NMS 与阈值行为。

不要使用官方 COCO 指标替代自己的业务验证。

## 模型尺寸

- `n`：最轻，适合快速基线与资源受限设备。
- `s`：常见的速度和精度折中。
- `m`：需要更高精度且有足够算力。
- `l`、`x`：更大模型，需评估显存、延迟和部署成本。

模型越大不一定业务效果越好。小数据集、标注噪声或域偏移可能成为主要瓶颈。

## 验证与错误分析

```bash
yolo detect val \
  model=runs/yolo11/baseline/weights/best.pt \
  data=data.yaml \
  imgsz=640 \
  plots=True
```

把错误按场景分组：

- 小目标和密集目标；
- 遮挡、模糊和低照度；
- 新设备或新摄像头；
- 背景相似导致误检；
- 类别定义重叠或标注不一致。

错误分析通常比盲目增加 epoch 更能改善模型。

## 导出与回归

```bash
yolo export model=best.pt format=onnx imgsz=640 dynamic=True simplify=True
```

导出后建立回归样本集，比较：

- 检测数量；
- 类别 ID；
- 置信度偏差；
- 坐标偏差；
- 端到端延迟。

## 何时继续使用 YOLO11

- 已经通过完整生产验证；
- 现有硬件和导出后端稳定；
- YOLO26 的收益尚未覆盖迁移成本；
- 项目需要成熟而不是追逐最新版本。

## 参考资料

- [YOLO11 官方文档](https://docs.ultralytics.com/zh/models/yolo11/)
- [Ultralytics 验证模式](https://docs.ultralytics.com/zh/modes/val/)
