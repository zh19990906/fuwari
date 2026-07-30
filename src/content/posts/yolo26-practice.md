---
title: YOLO26 快速入门、训练与任务选择
published: 2026-01-14
updated: 2026-07-30
description: 使用当前 Ultralytics YOLO26 完成推理、训练、验证和多任务模型选择。
tags: [YOLO26, Ultralytics, 端到端检测, 边缘部署]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 版本实践
docOrder: 50
draft: false
---

YOLO26 于 2026 年 1 月 14 日发布，是当前最新的 Ultralytics YOLO 系列。它采用原生端到端、默认无需 NMS 的推理路径，并针对 CPU、边缘设备和导出流程进行了简化。

## 安装与检查

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade ultralytics

yolo checks
python -c "import ultralytics; print(ultralytics.__version__)"
```

YOLO26 需要支持该模型的新版 `ultralytics` 包。生产项目应固定测试通过的版本，不要在构建过程中自动升级到任意最新版。

## 模型与任务

常见模型命名：

- 检测：`yolo26n.pt`、`yolo26s.pt` 等。
- 实例分割：`yolo26n-seg.pt`。
- 语义分割：`yolo26n-sem.pt`。
- 深度估计：`yolo26n-depth.pt`。
- 姿态：`yolo26n-pose.pt`。
- OBB：`yolo26n-obb.pt`。
- 分类：`yolo26n-cls.pt`。

先根据任务选择正确模型家族，再选择 `n/s/m/l/x` 尺寸。不同任务的标注格式、输出对象和评估指标不同。

## 快速推理

CLI：

```bash
yolo predict model=yolo26n.pt source=images/ imgsz=640 conf=0.25
```

Python：

```python
from ultralytics import YOLO

model = YOLO("yolo26n.pt")
results = model.predict(
    source="images/example.jpg",
    imgsz=640,
    conf=0.25,
)

for result in results:
    print(result.boxes.xyxy)
    print(result.boxes.conf)
```

YOLO26 默认端到端推理路径与旧版本后处理可能不同。迁移时不要假设历史 NMS 参数、输出张量和插件代码可以原样复用。

## 训练检测模型

```bash
yolo detect train \
  model=yolo26n.pt \
  data=data.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  device=0 \
  project=runs/yolo26 \
  name=baseline
```

Python：

```python
from ultralytics import YOLO

model = YOLO("yolo26n.pt")
model.train(
    data="data.yaml",
    epochs=100,
    imgsz=640,
    batch=16,
    device=0,
    project="runs/yolo26",
    name="baseline",
)
```

官方预训练检查点已经包含对应训练配方信息。微调时先从默认值建立基线，再根据数据规模和错误类型调整增强、学习率或模型尺寸。

## 验证

```bash
yolo detect val \
  model=runs/yolo26/baseline/weights/best.pt \
  data=data.yaml \
  imgsz=640 \
  plots=True
```

除 mAP 外，还应检查：

- 每类召回率和误检；
- 小目标、遮挡、低照度场景；
- 置信度分布；
- 与 YOLO11 或旧生产模型的同集对比；
- 目标设备上的端到端延迟。

## P2 与 P6 结构

官方提供 `yolo26-p2.yaml` 和 `yolo26-p6.yaml` 等架构配置，用于更小目标或更大输入场景。它们是架构 YAML，并不代表每个尺寸都有现成预训练 `.pt` 权重。使用前应确认初始化方式和训练成本。

## YOLOE-26

YOLOE-26 用于开放词汇检测与分割，可通过文本或视觉提示处理训练时未固定的类别。它适合动态类别场景，但与普通闭集检测的数据、评估和部署需求不同，应单独验证。

## 迁移到 YOLO26

- 用同一数据集重新训练，而不是只比较官方指标。
- 检查端到端输出和后处理接口变化。
- 重新测试 ONNX、TensorRT、OpenVINO 等导出。
- 保存新旧模型并进行灰度验证。
- 对延迟、功耗、内存和精度同时做基准。
- 阅读许可证，确认商业和分发方式符合要求。

## 参考资料

- [YOLO26 官方文档](https://docs.ultralytics.com/zh/models/yolo26/)
- [YOLO26 训练配方](https://docs.ultralytics.com/zh/guides/yolo26-training-recipe/)
