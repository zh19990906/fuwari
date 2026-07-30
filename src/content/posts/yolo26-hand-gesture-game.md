---
title: YOLO26 手势大战：从数据集清洗到模型训练
published: 2026-07-30
description: 记录使用 HaGRID 数据集训练 YOLO26 手势识别模型，并用于摄像头交互游戏的完整过程。
tags: [YOLO, Computer Vision, Deep Learning, HaGRID]
category: AI
image: ./cover.jpg
draft: false
---

# YOLO26 手势大战：从数据集清洗到模型训练

这次尝试的目标不是单纯训练一个目标检测模型，而是利用摄像头和视觉模型制作一个简单的交互游戏。

玩家通过手势控制游戏逻辑，例如：

- ✊ 石头（fist）
- ✋ 布（palm）
- ✌️ 剪刀（peace）
- 👍 点赞（like）

模型负责理解摄像头中的手势，游戏程序负责响应。

## 数据集选择

使用开源手势数据集：

- HaGRID (HAnd Gesture Recognition Image Dataset)

选择原因：

- 数据规模较大
- 包含多种真实环境
- 有公开标注
- 适合目标检测任务

最终选择五个类别：

```text
fist
palm
peace
like
no_gesture
```

其中 `no_gesture` 用于减少游戏中的误触发。

## 数据处理

由于原始数据包含大量图片文件，并且训练服务器使用云盘环境，直接处理大量碎文件效率较低。

因此采用流式清洗方案：

1. 单个 zip 文件解压处理
2. 根据类别筛选图片
3. 保留 YOLO 所需图片和标签
4. 直接打包为 tar
5. 上传到训练环境

最终生成标准 YOLO 数据结构：

```text
images/
├── train
├── val
└── test

labels/
├── train
├── val
└── test
```

## 模型训练

硬件环境：

```text
GPU: 2 × NVIDIA RTX PRO 5000 72GB
Memory: 350GB
Dataset: 52GB
```

分别训练两个版本：

- YOLO26n
- YOLO26s

训练目标是比较实时性和识别效果。

## 实验结果

验证集结果：

| Model | Params | mAP50 | mAP50-95 | Inference |
| --- | ---: | ---: | ---: | ---: |
| YOLO26n | 2.38M | 0.994 | 0.855 | 0.3ms |
| YOLO26s | 9.47M | 0.994 | 0.858 | 0.6ms |

两个模型精度非常接近。

考虑到摄像头游戏更加关注实时响应，因此优先选择 YOLO26n。

## 后续计划

下一步将模型接入实时摄像头：

- 多帧稳定预测
- 手势状态切换
- 游戏逻辑设计
- Web 或桌面端交互

这个项目的重点不是训练一个最高分模型，而是探索如何把 AI 模型变成一个真正可以体验的小应用。
