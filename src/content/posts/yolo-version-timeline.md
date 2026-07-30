---
title: YOLO 版本演进与选型时间线
published: 2026-01-15
updated: 2026-07-30
description: 从 YOLOv5、YOLOv8、YOLO11 到 YOLO26，梳理工程定位、兼容性和选型原则。
tags: [YOLO, 计算机视觉, 目标检测, 版本演进]
category: YOLO
contentType: docs
docGroup: yolo
docSection: 版本时间线
docOrder: 10
draft: false
---

YOLO 并不是一条由单一组织连续发布的统一产品线。工程选型时要同时确认模型来源、代码仓库、许可证、任务类型和导出目标，不能只比较版本数字。

本文重点整理 Ultralytics 工程体系中仍常见的四个节点：YOLOv5、YOLOv8、YOLO11 和 YOLO26。

## 2020：YOLOv5

YOLOv5 以 PyTorch 工程化体验、清晰的训练脚本和丰富部署实践获得广泛使用。大量历史项目、教程和行业代码仍基于 `ultralytics/yolov5` 仓库。

适合：

- 维护已有 YOLOv5 项目；
- 复现实验或继续使用已验证的旧部署链路；
- 依赖特定社区插件和旧格式输出的系统。

需要注意：原始 YOLOv5 仓库训练的权重，不应默认认为可以直接由现代 `ultralytics` 包加载。官方文档中的 YOLOv5u 是采用现代 Ultralytics 检测头的变体，与历史仓库模型需要区分。

## 2023-01-10：YOLOv8

YOLOv8 将检测、分割、姿态、分类等任务统一到 `ultralytics` Python 包和 CLI 中，形成了更一致的训练、验证、预测和导出接口。

适合：

- 已有 YOLOv8 数据集和成熟部署；
- 需要大量社区资料和稳定工具链；
- 不急于迁移但仍需要现代多任务接口的项目。

## 2024-09-10：YOLO11

YOLO11 在 YOLOv8 的统一接口基础上继续优化精度、速度和参数效率。官方将其定位为适用于检测、实例分割、姿态、分类和 OBB 等任务的通用模型。

适合：

- 追求成熟生产稳定性；
- 希望比 YOLOv8 使用更高效的新模型；
- 部署环境尚不需要 YOLO26 的端到端特性。

## 2026-01-14：YOLO26

YOLO26 是当前最新的 Ultralytics YOLO 系列。它采用原生端到端、默认无需 NMS 的推理路径，并针对边缘与低功耗环境简化检测头和导出流程。

当前官方模型系列覆盖检测、实例分割、语义分割、深度估计、姿态、分类和 OBB，并提供 YOLOE-26 开放词汇扩展。

适合：

- 新建项目并希望采用当前模型体系；
- CPU、边缘设备或简化部署链路是重要目标；
- 需要语义分割、深度估计等新任务支持；
- 能够完整验证数据、精度和导出后端兼容性。

## 如何选择

### 维护旧系统

优先保持原版本和原仓库，先补测试、数据集版本和部署基准。模型升级不应与业务改造同时进行。

### 新建稳定项目

优先评估 YOLO26 与 YOLO11。官方当前同时推荐两者用于稳定生产工作负载。应以自己的数据集、硬件和导出格式测试结果决定。

### 社区教程项目

教程使用哪个版本，就先在隔离环境中复现对应版本。不要把 YOLOv5 仓库命令、YOLOv8 API 和 YOLO26 模型文件混用。

## 迁移检查清单

- 固定 Python、PyTorch、CUDA 与 `ultralytics` 版本。
- 保存数据集 YAML、类别顺序和标注转换脚本。
- 在同一验证集比较 mAP、召回率、延迟和显存。
- 对预处理、后处理、坐标格式和阈值做回归测试。
- 重新验证 ONNX、TensorRT、OpenVINO 或其他导出后端。
- 检查许可证是否符合项目分发方式。
- 保留旧模型和可回滚部署包。

## 参考资料

- [Ultralytics 支持的模型](https://docs.ultralytics.com/zh/models/)
- [YOLOv5](https://docs.ultralytics.com/zh/models/yolov5/)
- [YOLOv8](https://docs.ultralytics.com/zh/models/yolov8/)
- [YOLO11](https://docs.ultralytics.com/zh/models/yolo11/)
- [YOLO26](https://docs.ultralytics.com/zh/models/yolo26/)
