---
title: YOLOv5 历史项目复现与维护
published: 2020-06-25
updated: 2026-07-30
description: 面向遗留系统说明 YOLOv5 原始仓库的环境隔离、训练、推理和迁移注意事项。
tags: [YOLOv5, PyTorch, 遗留系统]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 版本实践
docOrder: 20
draft: false
---

YOLOv5 仍广泛存在于历史项目、行业部署和教学代码中。维护它时最重要的是保持原仓库、依赖和权重格式一致，不要直接套用新版本 `ultralytics` 包的命令。

## 建立隔离环境

```bash
git clone https://github.com/ultralytics/yolov5.git
cd yolov5
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

如果项目记录了具体提交或标签，应切换到对应版本：

```bash
git checkout <tag-or-commit>
```

同时保存：

```bash
git rev-parse HEAD
python --version
python -m pip freeze > environment-lock.txt
```

## 数据集结构

```text
datasets/example/
├── images/
│   ├── train/
│   └── val/
└── labels/
    ├── train/
    └── val/
```

YOLO 检测标签通常每行表示：

```text
class_id x_center y_center width height
```

坐标按图像宽高归一化到 `0-1`。训练前检查类别 ID 连续、框未越界、空标签符合预期。

`data.yaml` 示例：

```yaml
path: /data/example
train: images/train
val: images/val
names:
  0: person
  1: vehicle
```

## 训练与验证

历史仓库常见命令：

```bash
python train.py \
  --img 640 \
  --batch 16 \
  --epochs 100 \
  --data data.yaml \
  --weights yolov5s.pt \
  --name example-v5
```

验证：

```bash
python val.py \
  --weights runs/train/example-v5/weights/best.pt \
  --data data.yaml \
  --img 640
```

推理：

```bash
python detect.py \
  --weights runs/train/example-v5/weights/best.pt \
  --source images/
```

具体参数以项目锁定版本的 `--help` 和仓库文档为准。

## 权重兼容性

官方当前文档中的 YOLOv5u 属于现代 `ultralytics` 包中的变体。原始 `ultralytics/yolov5` 仓库训练权重与现代包不应默认互换。

迁移前应明确：

- 权重来自哪个仓库和提交；
- 模型结构 YAML 是否自定义；
- 推理输出和 NMS 逻辑是否被修改；
- 导出脚本使用哪个版本；
- 类别顺序、预处理和缩放方式是否一致。

## 维护建议

- 将原环境构建成容器或可复现脚本。
- 为关键图片保存期望检测结果和容差。
- 不在原项目中直接升级全部依赖。
- 新旧模型并行评估，再决定是否迁移。
- 对外分发时重新确认当前许可证要求。

## 参考资料

- [Ultralytics YOLOv5 仓库](https://github.com/ultralytics/yolov5)
- [YOLOv5 官方指南](https://docs.ultralytics.com/yolov5/)
