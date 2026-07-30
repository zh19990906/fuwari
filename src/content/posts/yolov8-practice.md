---
title: YOLOv8 训练、验证与推理实践
published: 2023-01-10
updated: 2026-07-30
description: 使用统一 Ultralytics API 完成 YOLOv8 环境准备、训练、验证和预测。
tags: [YOLOv8, Ultralytics, 目标检测]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 版本实践
docOrder: 30
draft: false
---

YOLOv8 于 2023 年 1 月 10 日发布，它把检测、分割、姿态、分类等任务统一到 `ultralytics` 包中。已有 YOLOv8 项目可以继续稳定维护，但应固定环境版本，避免包升级改变训练或导出行为。

## 环境准备

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ultralytics
```

记录环境：

```bash
yolo checks
python -c "import ultralytics; print(ultralytics.__version__)"
python -m pip freeze > requirements-lock.txt
```

历史项目应安装当时验证过的 `ultralytics` 版本，而不是无条件使用最新版。

## 推理

CLI：

```bash
yolo detect predict model=yolov8n.pt source=images/ imgsz=640 conf=0.25
```

Python：

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
results = model.predict(source="images/", imgsz=640, conf=0.25)

for result in results:
    print(result.boxes.xyxy)
```

## 数据集配置

```yaml
path: /data/example
train: images/train
val: images/val
test: images/test
names:
  0: person
  1: vehicle
```

开始正式训练前，先用少量样本检查：

- 图像和标签是否一一对应；
- 类别 ID 是否与 `names` 一致；
- 检测框是否归一化且没有负数；
- 训练集和验证集是否存在重复或泄漏；
- 类别是否严重不平衡。

## 训练

```bash
yolo detect train \
  model=yolov8n.pt \
  data=data.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  device=0 \
  project=runs/example \
  name=yolov8n-baseline
```

Python：

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
model.train(
    data="data.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
    device=0,
    project="runs/example",
    name="yolov8n-baseline",
)
```

先建立可复现基线，再调整增强、学习率和模型尺寸。不要在第一轮同时改变大量参数。

## 验证

```bash
yolo detect val \
  model=runs/example/yolov8n-baseline/weights/best.pt \
  data=data.yaml \
  imgsz=640
```

除了总体 mAP，还要检查每类指标、混淆矩阵、误检漏检样本，以及目标尺寸分布。

## 导出

```bash
yolo export \
  model=runs/example/yolov8n-baseline/weights/best.pt \
  format=onnx \
  imgsz=640 \
  dynamic=True
```

导出后必须使用目标推理引擎复测预处理、输出解析、阈值和 NMS。PyTorch 验证通过不代表 ONNX 或 TensorRT 结果完全一致。

## 维护注意事项

- 固定训练代码、包版本、随机种子和数据集版本。
- 保存 `args.yaml`、指标曲线和最佳权重。
- 重新训练前确认默认参数是否随包版本变化。
- 迁移到 YOLO11 或 YOLO26 时，用同一验证集和硬件比较。

## 参考资料

- [YOLOv8 官方文档](https://docs.ultralytics.com/zh/models/yolov8/)
- [Ultralytics 训练模式](https://docs.ultralytics.com/zh/modes/train/)
