---
title: YOLO26 手势大战：从 HaGRID 清洗到双模型训练
published: 2026-07-30
updated: 2026-07-30
description: 记录在小磁盘与 OSS 挂载盘环境中流式清洗 HaGRID 数据，并使用两张 RTX PRO 5000 分别训练 YOLO26n 与 YOLO26s 的完整过程。
tags: [YOLO, Computer Vision, Deep Learning, HaGRID, Python]
category: AI
draft: false
contentType: docs
docGroup: yolo
docSection: 项目实战
docOrder: 100
---

这篇文章记录一个完整的小型计算机视觉项目：从 HaGRID 原始压缩包中筛选手势数据，转换为 YOLO 检测格式，训练 YOLO26n 与 YOLO26s，再根据验证结果选择适合实时摄像头游戏的模型。

最终希望实现的链路是：

```text
摄像头画面
    ↓
YOLO 手势检测
    ↓
连续帧稳定与技能冷却
    ↓
游戏状态机
    ↓
玩家通过手势完成对战
```

## 1. 项目目标与类别设计

第一版游戏使用四个明确手势作为操作输入：

| 类别编号 | HaGRID 类别 | 游戏含义 |
| ---: | --- | --- |
| 0 | `fist` | 握拳，可映射为石头或攻击 |
| 1 | `palm` | 张开手掌，可映射为布或防御 |
| 2 | `peace` | V 字手势，可映射为剪刀或技能 |
| 3 | `like` | 点赞，可映射为确认或特殊技能 |
| 4 | `no_gesture` | 自然手部姿态，用于降低误触发 |

这里没有只训练四个有效动作，而是把 `no_gesture` 也作为检测类别。原因是游戏中的输入并不总是标准手势：手刚进入画面、动作切换、摸脸、拿东西以及自然放松的手都可能被误判成技能。

> [!NOTE]
> 后续仍可以尝试只训练四个有效手势，并把低置信度或没有检测框视为 `no_gesture`。第一版先显式训练负类，便于观察误触发情况。

## 2. HaGRID 数据集介绍

本项目使用 [HaGRID（HAnd Gesture Recognition Image Dataset）](https://github.com/hukenovs/hagrid)。它既可以用于整图分类，也提供了手势检测所需的边界框标注。

截至本次实验，官方仓库对 HaGRIDv2-1M 的描述包括：

- 约 1.5 TB 数据；
- 1,086,158 张 Full HD RGB 图片；
- 33 个手势类别以及单独的 `no_gesture` 类别；
- 65,977 名参与者；
- 按 `user_id` 划分 train、val、test，比例约为 76%、9%、15%。

对这个项目而言，最重要的不是把完整数据集全部下载下来，而是保留官方划分，从而尽量避免同一个人同时出现在训练集和验证集里。否则模型可能记住人物、背景或拍摄环境，得到过于乐观的验证结果。

我们只准备六个输入文件：

```text
/root/dadaset/
├── fist.zip
├── palm.zip
├── peace.zip
├── like.zip
├── no_gesture.zip
└── annotations.zip
```

五个手势压缩包提供图片，`annotations.zip` 提供官方 train、val、test 划分、图片 ID、类别和边界框。

### 2.1 抽样规模

为了避免后期重新读取几十 GB 的原始压缩包，四个主要类别一次多保留一部分数据：

| 类别 | Train | Val | Test |
| --- | ---: | ---: | ---: |
| fist | 8,000 | 1,000 | 1,000 |
| palm | 8,000 | 1,000 | 1,000 |
| peace | 8,000 | 1,000 | 1,000 |
| like | 8,000 | 1,000 | 1,000 |
| no_gesture | 1,464 | 200 | 500 |

`no_gesture` 的独立图片数量较少，但其他手势图片中的第二只自然状态手也可能带有 `no_gesture` 标注。因此最终验证日志中，`no_gesture` 的图片数和实例数会高于单独压缩包的验证抽样数。

清洗并合并后的数据集约为 52 GB。

## 3. 为什么不能完整解压后再清洗

处理阶段的机器有以下限制：

```text
本地磁盘：约 100 GB
内存：350 GB
原始数据：多个约 40 GB 的手势 ZIP
存储环境：OSS 网络挂载盘
```

如果采用传统流程：

```text
ZIP
→ 完整解压
→ 扫描几万张图片
→ 复制选中图片
→ 删除其余图片
→ 再打包
```

会出现三个问题：

1. ZIP 与完整解压目录可能同时占满本地磁盘；
2. OSS 挂载盘处理大量小文件时，`stat`、`open`、`create` 和 `close` 的成本很高；
3. 大部分图片解压后马上又会被删除，产生大量无意义 I/O。

因此最终采用流式方案：

```text
annotations.zip
    ↓ 读取标注并在内存中抽样
得到需要保留的 image_id 集合
    ↓
手势 ZIP 中建立文件名索引
    ↓
只读取被选中的图片字节
    ↓
内存中读取宽高并转换边界框
    ↓
直接顺序写入一个 TAR 大文件
```

这个流程不会完整解压图片。内存中每次只保留当前图片字节、尺寸和标签，磁盘上只新增一个连续写入的 TAR 文件。

## 4. 流式清洗脚本

完整脚本保存在：

- [`scripts/hagrid/stream_hagrid_zip_to_tar.py`](https://github.com/zh19990906/fuwari/blob/main/scripts/hagrid/stream_hagrid_zip_to_tar.py)

安装依赖：

```bash
pip install pillow tqdm
```

脚本的核心工作分为五步。

### 4.1 从 annotations.zip 定位类别标注

```python
from pathlib import PurePosixPath
import zipfile


def find_annotation_member(
    zf: zipfile.ZipFile,
    split: str,
    class_name: str,
) -> str:
    matches: list[str] = []

    for name in zf.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() != ".json":
            continue
        if path.stem.lower() != class_name.lower():
            continue
        if split in [part.lower() for part in path.parts]:
            matches.append(name)

    if not matches:
        raise FileNotFoundError(
            f"annotations.zip 中没有找到 {split}/{class_name}.json"
        )

    matches.sort(key=lambda item: (len(PurePosixPath(item).parts), len(item)))
    return matches[0]
```

### 4.2 保留官方 split，并固定随机种子抽样

```python
rng = random.Random(seed)
selected: dict[str, tuple[str, dict]] = {}

with zipfile.ZipFile(annotations_zip, "r") as annotation_archive:
    for split in ("train", "val", "test"):
        member = find_annotation_member(
            annotation_archive,
            split,
            class_name,
        )
        data = json.loads(annotation_archive.read(member).decode("utf-8"))
        entries = list(iter_entries(data))
        rng.shuffle(entries)
        entries = entries[: limits[split]]

        for image_id, entry in entries:
            selected[image_id] = (split, entry)
```

固定 `seed=42` 的意义是让第一次清洗可复现。脚本还会在每个 TAR 内写入 `manifests/<class>.json`，记录选中图片、来源、目标路径、边界框数量和缺失样本。

### 4.3 边界框转换为 YOLO 格式

YOLO 标签格式为：

```text
class_id center_x center_y width height
```

四个坐标都归一化到 0～1。HaGRID 常见标注是归一化 `xywh`，转换方式为：

```python
def bbox_to_yolo(box: list[float]):
    x, y, width, height = map(float, box)
    center_x = x + width / 2.0
    center_y = y + height / 2.0
    return center_x, center_y, width, height
```

实际脚本还兼容像素 `xywh` 和像素 `xyxy`，并对坐标范围、空框和损坏图片进行检查。

### 4.4 图片不落地，直接写入 TAR

```python
import io
import tarfile


def add_bytes_to_tar(
    archive: tarfile.TarFile,
    archive_name: str,
    payload: bytes,
) -> None:
    info = tarfile.TarInfo(name=archive_name)
    info.size = len(payload)
    info.mtime = 0
    info.mode = 0o644
    archive.addfile(info, io.BytesIO(payload))
```

图片从 ZIP 读取到内存后，直接写到以下路径：

```text
images/train/<class>_<image_id>.jpg
labels/train/<class>_<image_id>.txt
```

文件名增加类别前缀，避免五个压缩包中出现相同图片 ID 时互相覆盖。

### 4.5 生成 data.yaml 和 manifest

每个类别 TAR 都带有同一份类别配置：

```yaml
path: .
train: images/train
val: images/val
test: images/test

names:
  0: fist
  1: palm
  2: peace
  3: like
  4: no_gesture
```

五个 TAR 解压到同一目录时，`images`、`labels` 和 `manifests` 会自然合并。

## 5. 执行数据清洗

先处理单个类别进行验证：

```bash
cd /root/dadaset

python stream_hagrid_zip_to_tar.py \
  --class-name like \
  --image-zip /root/dadaset/like.zip \
  --annotations-zip /root/dadaset/annotations.zip \
  --output-tar /root/dadaset/like_clean.tar \
  --train-limit 8000 \
  --val-limit 1000 \
  --test-limit 1000 \
  --overwrite
```

`no_gesture` 使用独立上限：

```bash
python stream_hagrid_zip_to_tar.py \
  --class-name no_gesture \
  --image-zip /root/dadaset/no_gesture.zip \
  --annotations-zip /root/dadaset/annotations.zip \
  --output-tar /root/dadaset/no_gesture_clean.tar \
  --no-gesture-train-limit 1464 \
  --no-gesture-val-limit 200 \
  --no-gesture-test-limit 500 \
  --overwrite
```

四个主要手势可以循环处理：

```bash
cd /root/dadaset

for cls in fist palm peace like; do
  python stream_hagrid_zip_to_tar.py \
    --class-name "$cls" \
    --image-zip "/root/dadaset/${cls}.zip" \
    --annotations-zip /root/dadaset/annotations.zip \
    --output-tar "/root/dadaset/${cls}_clean.tar" \
    --train-limit 8000 \
    --val-limit 1000 \
    --test-limit 1000 \
    --overwrite

  tar -tf "/root/dadaset/${cls}_clean.tar" >/dev/null
  sha256sum "/root/dadaset/${cls}_clean.tar" \
    > "/root/dadaset/${cls}_clean.tar.sha256"
done
```

JPEG 已经经过压缩，因此默认使用普通 `.tar`，不再使用 gzip。普通 TAR 生成更快，也更适合向 OSS 顺序传输。

## 6. 合并五个 TAR 为 YOLO 数据集

清洗后的五个 TAR 位于：

```text
/mnt/model/code/hagrid/clean/
```

把它们解压到同一目录：

```bash
mkdir -p /mnt/model/code/hagrid/dataset_yolo
cd /mnt/model/code/hagrid/dataset_yolo

for file in /mnt/model/code/hagrid/clean/*_clean.tar; do
  echo "正在解压：$file"
  tar -xf "$file"
done
```

最终目录：

```text
/mnt/model/code/hagrid/dataset_yolo/
├── images/
│   ├── train/
│   ├── val/
│   └── test/
├── labels/
│   ├── train/
│   ├── val/
│   └── test/
├── manifests/
└── data.yaml
```

将 `data.yaml` 的根路径改为绝对路径：

```bash
sed -i \
  's|^path:.*|path: /mnt/model/code/hagrid/dataset_yolo|' \
  /mnt/model/code/hagrid/dataset_yolo/data.yaml
```

检查图片和标签数量是否一致：

```bash
cd /mnt/model/code/hagrid/dataset_yolo

for split in train val test; do
  echo "===== $split ====="
  echo -n "images: "
  find "images/$split" -type f | wc -l
  echo -n "labels: "
  find "labels/$split" -type f -name '*.txt' | wc -l
done
```

## 7. 训练环境

实际训练环境：

```text
Ultralytics: 8.4.104
Python: 3.11.11
PyTorch: 2.9.0+cu128
GPU: 2 × NVIDIA RTX PRO 5000 72GB Blackwell
System memory: 350 GB
Dataset size: 52 GB
Image size: 640
Task: object detection
```

两张显卡没有用于同一个 DDP 任务，而是分别训练两个模型：

- GPU 0：YOLO26n，测试轻量模型的实时能力；
- GPU 1：YOLO26s，测试更大模型是否能明显提升精度。

这样可以在同一时间完成两组实验，而不是先后等待。

## 8. Python 训练脚本

完整脚本保存在：

- [`scripts/hagrid/train_yolo26.py`](https://github.com/zh19990906/fuwari/blob/main/scripts/hagrid/train_yolo26.py)

脚本内容如下：

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

DEFAULT_DATA = "/mnt/model/code/hagrid/dataset_yolo/data.yaml"
DEFAULT_PROJECT = "/mnt/model/code/hagrid/runs"


def parse_device(value: str):
    value = value.strip()
    if value.lower() == "cpu":
        return "cpu"

    ids = [int(item.strip()) for item in value.split(",") if item.strip()]
    return ids[0] if len(ids) == 1 else ids


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="训练 YOLO26 手势检测模型")
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--model", default="yolo26s.pt")
    parser.add_argument("--device", type=parse_device, default=[0, 1])
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--patience", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--name", default="gesture_yolo26s_dual")
    parser.add_argument(
        "--cache",
        choices=["false", "ram", "disk"],
        default="false",
    )
    parser.add_argument("--resume", default=None)
    parser.add_argument("--exist-ok", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    data_path = Path(args.data)

    if not data_path.is_file():
        raise FileNotFoundError(f"找不到数据配置：{data_path}")

    if args.resume:
        checkpoint = Path(args.resume)
        if not checkpoint.is_file():
            raise FileNotFoundError(f"找不到断点文件：{checkpoint}")
        YOLO(str(checkpoint)).train(resume=True)
        return

    cache = False if args.cache == "false" else args.cache
    model = YOLO(args.model)

    model.train(
        task="detect",
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        project=args.project,
        name=args.name,
        exist_ok=args.exist_ok,
        pretrained=True,
        optimizer="auto",
        patience=args.patience,
        seed=args.seed,
        deterministic=True,
        amp=True,
        cos_lr=True,
        close_mosaic=10,
        plots=True,
        save=True,
        val=True,
        cache=cache,
    )


if __name__ == "__main__":
    main()
```

安装训练依赖：

```bash
pip install -U ultralytics
```

## 9. 启动两个训练任务

YOLO26n 更小，因此使用更大的 batch；YOLO26s 更大，单张图片和中间特征占用更多显存。

### 9.1 GPU 0：YOLO26n

```bash
cd /mnt/model/code/hagrid

nohup python train_yolo26.py \
  --model yolo26n.pt \
  --device 0 \
  --batch 256 \
  --epochs 120 \
  --imgsz 640 \
  --workers 16 \
  --patience 25 \
  --cache false \
  --name gesture_yolo26n \
  > gesture_yolo26n.log 2>&1 &
```

### 9.2 GPU 1：YOLO26s

```bash
cd /mnt/model/code/hagrid

nohup python train_yolo26.py \
  --model yolo26s.pt \
  --device 1 \
  --batch 192 \
  --epochs 150 \
  --imgsz 640 \
  --workers 16 \
  --patience 35 \
  --cache ram \
  --name gesture_yolo26s \
  > gesture_yolo26s.log 2>&1 &
```

数据集位于网络或挂载存储时，RAM cache 可以减少后续 epoch 的读取等待。这里让较慢的 YOLO26s 使用 RAM cache，YOLO26n 不缓存，避免两个进程各自缓存一份数据。

查看运行状态：

```bash
ps -ef | grep train_yolo26.py | grep -v grep
watch -n 2 nvidia-smi
```

查看日志：

```bash
tail -f /mnt/model/code/hagrid/gesture_yolo26n.log
tail -f /mnt/model/code/hagrid/gesture_yolo26s.log
```

断点续训：

```bash
python train_yolo26.py \
  --resume /mnt/model/code/hagrid/runs/gesture_yolo26s/weights/last.pt
```

## 10. 验证结果

验证集共有 4,200 张图片、5,203 个实例。

### 10.1 总体指标

| 模型 | 参数量 | GFLOPs | Precision | Recall | mAP50 | mAP50-95 | 推理耗时/图 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| YOLO26n | 2,375,811 | 5.2 | 0.995 | 0.993 | 0.994 | 0.855 | 0.3 ms |
| YOLO26s | 9,467,115 | 20.5 | 0.990 | 0.990 | 0.994 | 0.858 | 0.6 ms |

这里的推理耗时是 Ultralytics 在 RTX PRO 5000 上的验证统计，不代表摄像头采集、缩放、绘制和游戏逻辑全部完成后的端到端延迟。

### 10.2 各类别 mAP50-95

| 类别 | YOLO26n | YOLO26s |
| --- | ---: | ---: |
| fist | 0.843 | 0.843 |
| palm | 0.934 | 0.932 |
| peace | 0.878 | 0.880 |
| like | 0.869 | 0.871 |
| no_gesture | 0.752 | 0.762 |

四个标准手势都获得了较高指标，`no_gesture` 明显更难。原因也很直观：标准手势具有明确形状，而自然手部姿态内部差异很大，可能包含半握拳、侧手、遮挡、拿东西以及动作过渡帧。

## 11. 最终模型选择

YOLO26s 的 mAP50-95 比 YOLO26n 高 0.003，但代价是：

- 参数量约为 YOLO26n 的 4 倍；
- 计算量约为 YOLO26n 的 4 倍；
- 当前验证硬件上的推理耗时约为 2 倍；
- 总体 Precision 和 Recall 并没有超过 YOLO26n。

因此第一版实时游戏优先采用 YOLO26n：

```text
/mnt/model/code/hagrid/runs/gesture_yolo26n/weights/best.pt
```

YOLO26s 保留为精度对照和后续困难场景备选。最终是否切换到 YOLO26s，不应只看验证集 mAP，而应通过真实摄像头测试暗光、侧手、远距离和动作切换表现。

## 12. 模型归档与改名

```bash
mkdir -p /mnt/model/code/hagrid/models

cp /mnt/model/code/hagrid/runs/gesture_yolo26n/weights/best.pt \
  /mnt/model/code/hagrid/models/gesture_yolo26n_640_v1.pt

cp /mnt/model/code/hagrid/runs/gesture_yolo26s/weights/best.pt \
  /mnt/model/code/hagrid/models/gesture_yolo26s_640_v1.pt

cd /mnt/model/code/hagrid/models
sha256sum gesture_yolo26n_640_v1.pt \
          gesture_yolo26s_640_v1.pt \
  > SHA256SUMS
```

保留训练目录中的原始 `best.pt` 和 `last.pt`，发布目录只保存命名明确、带版本号的模型副本。

## 13. 接入游戏前还需要解决什么

高验证指标不等于游戏体验稳定。推理层至少需要增加：

1. **连续帧投票**：例如最近 5 帧中至少 4 帧类别一致；
2. **置信度阈值**：有效手势可从 `0.6～0.75` 范围开始测试；
3. **技能冷却**：同一手势触发后等待约 0.5 秒；
4. **状态切换保护**：从一个手势切换到另一个手势时，先经过 `no_gesture` 或稳定窗口；
5. **真实负样本回收**：记录误触发画面，后续加入自然手势和动作过渡数据；
6. **双手规则**：明确只取置信度最高的手、面积最大的手，还是允许双手组合技能。

一个简单的稳定器可以维护最近若干帧结果：

```python
from collections import Counter, deque

history = deque(maxlen=5)


def stable_gesture(label: str | None) -> str | None:
    history.append(label)
    gesture, count = Counter(history).most_common(1)[0]
    return gesture if gesture is not None and count >= 4 else None
```

## 14. 总结

这次实验最有价值的部分不只是训练出了两个高指标模型，而是完成了一条适应实际基础设施限制的数据工程链路：

```text
大体积 HaGRID ZIP
→ 保留官方人员隔离划分
→ 按 ID 流式读取选中图片
→ 内存中转换 YOLO 标签
→ 顺序写入 TAR
→ 在训练机合并数据集
→ 双 GPU 并行训练两个模型
→ 根据精度与计算成本选择实时版本
```

在小磁盘和 OSS 挂载盘环境中，避免完整解压与碎文件搬运比单纯增加 CPU 或内存更重要。模型部分则说明：对于只有五类、类别形状较明确的任务，更大的模型不一定带来足以抵消计算成本的收益。
