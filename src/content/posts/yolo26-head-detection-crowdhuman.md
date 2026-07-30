---
title: YOLO26 人头检测与人数统计：CrowdHuman 清洗、训练和对比
published: 2026-07-30
updated: 2026-07-30
description: 使用 CrowdHuman 的 head box 标注清洗出 YOLO 单类别数据集，训练 YOLO26n、YOLO26s 和 YOLO26m，并用统一样本对比检测效果。
tags: [YOLO, YOLO26, CrowdHuman, Computer Vision, Python]
category: AI
draft: false
contentType: docs
docGroup: yolo
docSection: 项目实战
docOrder: 110
---

这篇文章记录一次人头检测模型训练过程：从 CrowdHuman 原始标注中只提取 `hbox`，转换为 YOLO 单类别数据集，然后分别训练 YOLO26n、YOLO26s 和 YOLO26m，最后用同一批验证图片做画框与计数对比。

项目第一阶段只关注两个目标：

```text
图片或视频输入
    ↓
YOLO 人头检测
    ↓
绘制 head 框
    ↓
统计 count
```

这里不训练人体框，也不训练可见身体框。最终模型只有一个类别：

```text
0: head
```

## 1. 数据集来源

本次使用 [CrowdHuman](https://www.crowdhuman.org/) 数据集。CrowdHuman 面向密集人群检测，包含大量多人、遮挡、小目标和拥挤场景，适合做人头检测与人数统计的基线数据。

CrowdHuman 每个 `person` 标注里通常包含三类框：

| 字段 | 含义 | 本项目是否使用 |
| --- | --- | --- |
| `hbox` | head box，头部框 | 使用 |
| `fbox` | full body box，完整人体框 | 不使用 |
| `vbox` | visible body box，可见人体框 | 不使用 |

示例标注结构如下：

```json
{
  "ID": "example_image_id",
  "gtboxes": [
    {
      "tag": "person",
      "hbox": [123, 129, 63, 64],
      "head_attr": {
        "ignore": 0,
        "occ": 1,
        "unsure": 0
      },
      "fbox": [61, 123, 191, 453],
      "vbox": [62, 126, 154, 446],
      "extra": {
        "box_id": 0,
        "occ": 1
      }
    }
  ]
}
```

因为目标是人头计数，转换时只读取 `gtboxes[*].hbox`，并把所有有效头框写成 YOLO 的 `class 0`。

## 2. YOLO 数据结构

转换后的数据集结构如下：

```text
yolo_head/
├── images/
│   ├── train/
│   └── val/
├── labels/
│   ├── train/
│   └── val/
├── crowdhuman_head.yaml
└── README.md
```

YOLO 通过文件名建立图片与标签的对应关系：

```text
images/train/example.jpg
labels/train/example.txt
```

每个标签文件中一行表示一个头部框：

```text
class_id x_center y_center width height
```

坐标是归一化后的比例值，不是像素值。对于本项目，标签行格式始终是：

```text
0 x_center y_center width height
```

`crowdhuman_head.yaml` 使用相对路径，便于移动和分享：

```yaml
path: .
train: images/train
val: images/val

names:
  0: head
```

如果训练框架没有按 YAML 所在目录解析 `path: .`，可以在本地训练时把 `path` 改成数据集根目录的绝对路径。提交或分享数据集时仍建议保留相对路径版本。

## 3. 数据清洗与格式转换

下面脚本会读取 CrowdHuman 的 `annotation_train.odgt` 和 `annotation_val.odgt`，只提取有效 `hbox`，并生成 YOLO 标签。

清洗规则：

- `tag != "person"` 的框不使用；
- 缺少 `hbox` 的框不使用；
- `head_attr.ignore == 1` 的框不使用；
- `head_attr.unsure == 1` 的框不使用；
- `extra.ignore == 1` 的框不使用；
- 裁剪到图片范围后宽高过小的框不使用。

```python
import argparse
import json
import shutil
from pathlib import Path

from PIL import Image


MIN_BOX_SIZE = 2


def should_skip_gtbox(gtbox):
    if gtbox.get("tag") != "person":
        return True

    if "hbox" not in gtbox:
        return True

    head_attr = gtbox.get("head_attr", {})
    extra = gtbox.get("extra", {})

    if head_attr.get("ignore", 0) == 1:
        return True

    if head_attr.get("unsure", 0) == 1:
        return True

    if extra.get("ignore", 0) == 1:
        return True

    return False


def hbox_to_yolo(hbox, img_w, img_h, min_box_size=MIN_BOX_SIZE):
    x, y, w, h = hbox

    x1 = max(0, x)
    y1 = max(0, y)
    x2 = min(img_w, x + w)
    y2 = min(img_h, y + h)

    box_w = x2 - x1
    box_h = y2 - y1

    if box_w <= min_box_size or box_h <= min_box_size:
        return None

    cx = (x1 + box_w / 2) / img_w
    cy = (y1 + box_h / 2) / img_h
    norm_w = box_w / img_w
    norm_h = box_h / img_h

    return cx, cy, norm_w, norm_h


def copy_image(src_path, dst_path):
    if not dst_path.exists():
        shutil.copy2(src_path, dst_path)


def convert_split(split_name, ann_path, image_dir, output_root, skip_empty):
    output_image_dir = output_root / "images" / split_name
    output_label_dir = output_root / "labels" / split_name
    output_image_dir.mkdir(parents=True, exist_ok=True)
    output_label_dir.mkdir(parents=True, exist_ok=True)

    image_count = 0
    box_count = 0
    empty_label_count = 0
    missing_image_count = 0

    with ann_path.open("r", encoding="utf-8") as ann_file:
        for line in ann_file:
            item = json.loads(line)
            image_id = item["ID"]
            image_path = image_dir / f"{image_id}.jpg"

            if not image_path.exists():
                missing_image_count += 1
                continue

            with Image.open(image_path) as image:
                img_w, img_h = image.size

            label_lines = []
            for gtbox in item.get("gtboxes", []):
                if should_skip_gtbox(gtbox):
                    continue

                yolo_box = hbox_to_yolo(gtbox["hbox"], img_w, img_h)
                if yolo_box is None:
                    continue

                cx, cy, w, h = yolo_box
                label_lines.append(f"0 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")

            if skip_empty and not label_lines:
                empty_label_count += 1
                continue

            copy_image(image_path, output_image_dir / image_path.name)
            (output_label_dir / f"{image_id}.txt").write_text(
                "\n".join(label_lines),
                encoding="utf-8",
            )

            image_count += 1
            box_count += len(label_lines)
            if not label_lines:
                empty_label_count += 1

    return {
        "split": split_name,
        "images": image_count,
        "boxes": box_count,
        "empty_labels": empty_label_count,
        "missing_images": missing_image_count,
    }


def write_yaml(output_root):
    yaml_text = """path: .
train: images/train
val: images/val

names:
  0: head
"""
    (output_root / "crowdhuman_head.yaml").write_text(yaml_text, encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert CrowdHuman head boxes to YOLO format."
    )
    parser.add_argument("--raw-root", default="raw/CrowdHuman/crowdhuman")
    parser.add_argument("--output-root", default="yolo_head")
    parser.add_argument("--skip-empty", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    raw_root = Path(args.raw_root)
    output_root = Path(args.output_root)

    splits = {
        "train": {
            "ann": raw_root / "annotation_train.odgt",
            "image_dir": raw_root / "train" / "Images",
        },
        "val": {
            "ann": raw_root / "annotation_val.odgt",
            "image_dir": raw_root / "val" / "Images",
        },
    }

    for split_name, cfg in splits.items():
        result = convert_split(
            split_name,
            cfg["ann"],
            cfg["image_dir"],
            output_root,
            args.skip_empty,
        )
        print(result)

    write_yaml(output_root)
    print("done")


if __name__ == "__main__":
    main()
```

安装依赖并执行：

```bash
python -m pip install pillow
python convert_crowdhuman_head.py --raw-root raw/CrowdHuman/crowdhuman --output-root yolo_head
```

如果数据在 OSS、NFS 或其他网络挂载盘上，批量复制图片会比较慢。训练时更建议把转换后的训练集放到本地盘或高速块存储，再从本地读取图片。

## 4. 训练脚本

训练使用 Ultralytics Python API。相比把所有参数写在命令行里，Python 脚本更容易复用，也方便把结果目录和实验名规范化。

```python
import argparse
from pathlib import Path

from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser(description="Train a YOLO head detector.")
    parser.add_argument("--data", default="yolo_head/crowdhuman_head.yaml")
    parser.add_argument("--model", default="yolo26m.pt")
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--device", default="0")
    parser.add_argument("--project", default="runs/head")
    parser.add_argument("--name", default="yolo26m_crowdhuman_head")
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    data_path = Path(args.data)

    if not data_path.exists():
        raise FileNotFoundError(f"Data yaml not found: {data_path}")

    model = YOLO(args.model)
    model.train(
        data=str(data_path),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        workers=args.workers,
        device=args.device,
        project=args.project,
        name=args.name,
        resume=args.resume,
    )


if __name__ == "__main__":
    main()
```

单卡训练示例：

```bash
python train_head.py \
  --data yolo_head/crowdhuman_head.yaml \
  --model yolo26m.pt \
  --imgsz 1280 \
  --epochs 100 \
  --batch 32 \
  --workers 8 \
  --device 0 \
  --name yolo26m_crowdhuman_head
```

多卡训练示例：

```bash
python train_head.py \
  --data yolo_head/crowdhuman_head.yaml \
  --model yolo26s.pt \
  --imgsz 1280 \
  --epochs 100 \
  --batch 96 \
  --workers 16 \
  --device 0,1,2,3,4,5,6,7 \
  --name yolo26s_crowdhuman_head_8gpu
```

多卡训练时，`batch` 可以按单卡 batch 线性放大。例如四卡总 batch 为 48，八卡可以先试 96。如果数据加载或 DDP 初始化过慢，可以先降低 `workers`。

## 5. 训练结果对比

本次分别训练了 YOLO26n、YOLO26s 和 YOLO26m。验证集为 CrowdHuman val，共 4,370 张图片，约 97,244 个有效 head 实例。

| 模型 | 参数量 | GFLOPs | P | R | mAP50 | mAP50-95 | 权重大小 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| YOLO26n | 2.38M | 5.2 | 0.845 | 0.732 | 0.819 | 0.532 | 5.5 MB |
| YOLO26s | 9.47M | 20.5 | 0.856 | 0.741 | 0.834 | 0.552 | 20.4 MB |
| YOLO26m | 20.35M | 67.8 | 0.840 | 0.763 | 0.849 | 0.570 | 44.1 MB |

从验证指标看，YOLO26m 的召回率、mAP50 和 mAP50-95 都最高，更适合作为主模型。YOLO26s 的精度与体积折中更好，适合作为轻量部署候选。YOLO26n 体积最小，适合快速验证流程，但漏检风险更高。

对人数统计任务而言，召回率非常关键。漏检会直接导致人数少算，因此不能只看 precision 或推理速度。

## 6. 测试效果脚本

训练完成后，先把不同模型的 `best.pt` 统一放到一个模型目录中，并用同一批图片做横向对比。下面脚本会对每个模型分别生成画框图片，并写出 `summary.csv`，记录每张图的检测数量。

```python
import argparse
import csv
from pathlib import Path

import cv2
from ultralytics import YOLO


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def model_name_from_path(model_path):
    return Path(model_path).stem


def parse_model_args(model_args):
    parsed = []
    for item in model_args:
        if "=" in item:
            name, path = item.split("=", 1)
        else:
            path = item
            name = model_name_from_path(path)
        parsed.append((name, path))
    return parsed


def list_images(source_dir):
    source_path = Path(source_dir)
    return sorted(
        path
        for path in source_path.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def draw_count_label(image, count, model_name):
    text = f"{model_name} count={count}"
    cv2.rectangle(image, (8, 8), (8 + 18 * len(text), 42), (0, 0, 0), -1)
    cv2.putText(
        image,
        text,
        (16, 33),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def run_model(model_name, model_path, image_paths, output_root, imgsz, conf, iou, device):
    model = YOLO(model_path)
    output_dir = Path(output_root) / model_name
    output_dir.mkdir(parents=True, exist_ok=True)

    summary_rows = []

    for image_path in image_paths:
        results = model.predict(
            source=str(image_path),
            imgsz=imgsz,
            conf=conf,
            iou=iou,
            device=device,
            verbose=False,
        )
        result = results[0]
        count = 0 if result.boxes is None else len(result.boxes)
        plotted = result.plot()
        draw_count_label(plotted, count, model_name)

        output_path = output_dir / image_path.name
        cv2.imwrite(str(output_path), plotted)

        summary_rows.append(
            {
                "model": model_name,
                "image": image_path.name,
                "count": count,
                "output": str(output_path),
            }
        )

    return summary_rows


def write_summary(output_root, rows):
    summary_path = Path(output_root) / "summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["model", "image", "count", "output"])
        writer.writeheader()
        writer.writerows(rows)
    return summary_path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Compare multiple YOLO head models on the same images."
    )
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", default="predict_compare")
    parser.add_argument("--models", nargs="+", required=True)
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--device", default="0")
    return parser.parse_args()


def main():
    args = parse_args()
    image_paths = list_images(args.source)

    if not image_paths:
        raise SystemExit(f"No images found in {args.source}")

    Path(args.output).mkdir(parents=True, exist_ok=True)

    all_rows = []
    for model_name, model_path in parse_model_args(args.models):
        print(f"Running {model_name} on {len(image_paths)} images")
        rows = run_model(
            model_name=model_name,
            model_path=model_path,
            image_paths=image_paths,
            output_root=args.output,
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            device=args.device,
        )
        all_rows.extend(rows)

    summary_path = write_summary(args.output, all_rows)
    print(f"Done. Summary: {summary_path}")


if __name__ == "__main__":
    main()
```

运行示例：

```bash
python compare_head_models.py \
  --source test_samples/crowdhuman_val_100 \
  --output predict_compare/crowdhuman_val_100_conf025 \
  --models \
    m=models/head_crowdhuman/yolo26m_head_crowdhuman_best.pt \
    s=models/head_crowdhuman/yolo26s_head_crowdhuman_best.pt \
    n=models/head_crowdhuman/yolo26n_head_crowdhuman_best.pt \
  --imgsz 1280 \
  --conf 0.25 \
  --iou 0.7 \
  --device 0
```

输出结构：

```text
predict_compare/
└── crowdhuman_val_100_conf025/
    ├── m/
    ├── s/
    ├── n/
    └── summary.csv
```

校验时优先观察：

- 远处小头是否漏检；
- 密集人群是否出现重复框；
- 遮挡头部是否还能检出；
- 是否把灯、海报、圆形物体误检为头；
- `count` 与肉眼估计是否接近。

还可以用不同置信度重复测试：

```bash
python compare_head_models.py \
  --source test_samples/crowdhuman_val_100 \
  --output predict_compare/crowdhuman_val_100_conf020 \
  --models m=models/head_crowdhuman/yolo26m_head_crowdhuman_best.pt \
  --imgsz 1280 \
  --conf 0.20 \
  --iou 0.7 \
  --device 0
```

`conf` 越低，召回通常越高，但误检会增加；`conf` 越高，误检减少，但更容易漏检。人头计数场景一般先从 `0.20` 到 `0.30` 之间找平衡点。

## 7. 本地视频检测

图片测试通过后，可以对本地视频逐帧检测并输出带框视频。

```python
import argparse
from pathlib import Path

import cv2
from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser(description="Detect heads in a local video.")
    parser.add_argument("--model", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", default="output_head_detect.mp4")
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--device", default="0")
    return parser.parse_args()


def draw_count(frame, count):
    text = f"count={count}"
    cv2.rectangle(frame, (10, 10), (190, 50), (0, 0, 0), -1)
    cv2.putText(
        frame,
        text,
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def main():
    args = parse_args()

    model = YOLO(args.model)
    cap = cv2.VideoCapture(args.source)

    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {args.source}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )

    frame_id = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        results = model.predict(
            source=frame,
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            device=args.device,
            verbose=False,
        )

        result = results[0]
        count = 0 if result.boxes is None else len(result.boxes)
        plotted = result.plot()
        draw_count(plotted, count)

        writer.write(plotted)
        frame_id += 1

        if frame_id % 30 == 0:
            print(f"processed frames={frame_id}, current_count={count}")

    cap.release()
    writer.release()
    print(f"Done. Output saved to: {output_path}")


if __name__ == "__main__":
    main()
```

运行示例：

```bash
python detect_video_head_count.py \
  --model models/head_crowdhuman/yolo26m_head_crowdhuman_best.pt \
  --source videos/input.mp4 \
  --output video_results/input_head_count.mp4 \
  --imgsz 1280 \
  --conf 0.25 \
  --iou 0.7 \
  --device 0
```

视频统计最好不要只看单帧 `count`。真实视频中会有遮挡、运动模糊和短时漏检，后续可以加入跟踪器或滑动窗口平滑，让人数统计更稳定。

## 8. 小结

这次实验的关键不是简单地把 CrowdHuman 转成 YOLO，而是明确任务边界：只训练 `head` 类，避免人体框和头部框混在一起。训练结果表明，YOLO26m 在召回率和整体 mAP 上更适合作为主模型；YOLO26s 可以作为轻量部署模型；YOLO26n 更适合快速验证。

下一步应当使用真实业务场景图片继续测试。如果 CrowdHuman 上指标不错，但实际图片漏检明显，就需要收集少量目标场景图片进行二阶段微调。
