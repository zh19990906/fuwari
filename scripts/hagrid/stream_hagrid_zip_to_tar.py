#!/usr/bin/env python3
"""
HaGRID 低磁盘流式清洗器

直接从手势 ZIP 中读取被选中的图片：
ZIP -> 内存 -> YOLO 标签 -> TAR

不会完整解压图片，也不会在本地生成成千上万个碎文件。
每次只处理一个类别，并输出一个可合并的 tar 包。

要求：
- 5 个手势 zip，例如 like.zip / fist.zip / palm.zip / peace.zip / no_gesture.zip
- 官方 annotations.zip（必须，用于 train/val/test 划分和 bbox）

输出 tar 内部统一为：
images/train/<class>_<name>.jpg
labels/train/<class>_<name>.txt
images/val/...
labels/val/...
images/test/...
labels/test/...
manifests/<class>.json
data.yaml

多个类别 tar 可解压到同一目录自动合并。
"""

from __future__ import annotations

import argparse
import io
import json
import random
import tarfile
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from PIL import Image
from tqdm import tqdm


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
DEFAULT_CLASS_ORDER = ["fist", "palm", "peace", "like", "no_gesture"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="直接从 HaGRID ZIP 流式筛选图片并输出 YOLO tar。"
    )
    p.add_argument("--class-name", required=True)
    p.add_argument("--image-zip", type=Path, required=True)
    p.add_argument("--annotations-zip", type=Path, required=True)
    p.add_argument("--output-tar", type=Path, required=True)
    p.add_argument("--train-limit", type=int, default=4000)
    p.add_argument("--val-limit", type=int, default=500)
    p.add_argument("--test-limit", type=int, default=500)
    p.add_argument("--no-gesture-train-limit", type=int, default=1464)
    p.add_argument("--no-gesture-val-limit", type=int, default=200)
    p.add_argument("--no-gesture-test-limit", type=int, default=500)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument(
        "--class-order",
        nargs="+",
        default=DEFAULT_CLASS_ORDER,
        help="所有类别 tar 必须使用完全相同的顺序",
    )
    p.add_argument(
        "--compression",
        choices=["none", "gz"],
        default="none",
        help="JPG 已压缩，默认不再压缩；gz 通常只省很少空间",
    )
    p.add_argument(
        "--overwrite",
        action="store_true",
    )
    return p.parse_args()


def normalize_split(name: str) -> str | None:
    aliases = {
        "train": "train",
        "training": "train",
        "val": "val",
        "valid": "val",
        "validation": "val",
        "test": "test",
        "testing": "test",
    }
    return aliases.get(name.lower())


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

        parts = [part.lower() for part in path.parts]
        if any(normalize_split(part) == split for part in parts):
            matches.append(name)

    if not matches:
        raise FileNotFoundError(
            f"annotations.zip 中没有找到 {split}/{class_name}.json"
        )

    matches.sort(key=lambda x: (len(PurePosixPath(x).parts), len(x)))
    return matches[0]


def extract_image_id(entry: dict[str, Any]) -> str | None:
    for key in ("image_id", "image", "file_name", "filename", "name", "id"):
        value = entry.get(key)
        if value is not None:
            return Path(str(value)).stem
    return None


def iter_entries(data: Any) -> Iterable[tuple[str, dict[str, Any]]]:
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                image_id = extract_image_id(item)
                if image_id:
                    yield image_id, item
        return

    if not isinstance(data, dict):
        return

    annotations = data.get("annotations")
    if isinstance(annotations, list):
        for item in annotations:
            if isinstance(item, dict):
                image_id = extract_image_id(item)
                if image_id:
                    yield image_id, item
        return

    for key, value in data.items():
        if isinstance(value, dict):
            yield Path(str(key)).stem, value


def first_present(mapping: dict[str, Any], keys: tuple[str, ...], default=None):
    for key in keys:
        if key in mapping and mapping[key] is not None:
            return mapping[key]
    return default


def extract_boxes_labels(
    entry: dict[str, Any],
    fallback_class: str,
) -> tuple[list[list[float]], list[str]]:
    raw_boxes = first_present(entry, ("bboxes", "bbox", "boxes", "box"), [])
    raw_labels = first_present(
        entry,
        (
            "labels",
            "label",
            "categories",
            "category",
            "classes",
            "class",
            "gestures",
            "gesture",
        ),
        None,
    )

    if raw_boxes is None:
        raw_boxes = []

    if (
        isinstance(raw_boxes, (list, tuple))
        and len(raw_boxes) == 4
        and not isinstance(raw_boxes[0], (list, tuple))
    ):
        raw_boxes = [raw_boxes]

    boxes = [
        [float(v) for v in box]
        for box in raw_boxes
        if isinstance(box, (list, tuple)) and len(box) == 4
    ]

    if raw_labels is None:
        labels = [fallback_class] * len(boxes)
    elif isinstance(raw_labels, (str, int, float)):
        labels = [str(raw_labels)] * len(boxes)
    else:
        labels = [str(v) for v in raw_labels]

    if len(labels) == 1 and len(boxes) > 1:
        labels *= len(boxes)
    if len(labels) < len(boxes):
        labels += [fallback_class] * (len(boxes) - len(labels))

    return boxes, labels[: len(boxes)]


def bbox_to_yolo(
    box: list[float],
    width: int,
    height: int,
) -> tuple[float, float, float, float] | None:
    x, y, a, b = map(float, box)

    # HaGRID 通常是归一化 xywh。
    if all(0.0 <= v <= 1.0 for v in box):
        cx = x + a / 2.0
        cy = y + b / 2.0
        bw = a
        bh = b
    else:
        looks_xywh = (
            a > 0
            and b > 0
            and x + a <= width * 1.05
            and y + b <= height * 1.05
        )
        if looks_xywh:
            cx = (x + a / 2.0) / width
            cy = (y + b / 2.0) / height
            bw = a / width
            bh = b / height
        else:
            x1, y1, x2, y2 = x, y, a, b
            cx = ((x1 + x2) / 2.0) / width
            cy = ((y1 + y2) / 2.0) / height
            bw = (x2 - x1) / width
            bh = (y2 - y1) / height

    cx = min(max(cx, 0.0), 1.0)
    cy = min(max(cy, 0.0), 1.0)
    bw = min(max(bw, 0.0), 1.0)
    bh = min(max(bh, 0.0), 1.0)

    if bw <= 0 or bh <= 0:
        return None

    return cx, cy, bw, bh


def add_bytes_to_tar(
    tf: tarfile.TarFile,
    archive_name: str,
    payload: bytes,
) -> None:
    info = tarfile.TarInfo(name=archive_name)
    info.size = len(payload)
    info.mtime = 0
    info.mode = 0o644
    tf.addfile(info, io.BytesIO(payload))


def build_zip_image_index(zf: zipfile.ZipFile) -> dict[str, str]:
    index: dict[str, str] = {}
    duplicates = 0

    for name in zf.namelist():
        path = PurePosixPath(name)
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue

        image_id = path.stem
        if image_id in index:
            duplicates += 1
            continue
        index[image_id] = name

    if not index:
        raise RuntimeError("图片 ZIP 中没有找到图片")

    if duplicates:
        print(f"警告：ZIP 中发现 {duplicates} 个重复图片 ID，使用首次出现项。")

    return index


def get_limits(args: argparse.Namespace, class_name: str) -> dict[str, int]:
    if class_name == "no_gesture":
        return {
            "train": args.no_gesture_train_limit,
            "val": args.no_gesture_val_limit,
            "test": args.no_gesture_test_limit,
        }

    return {
        "train": args.train_limit,
        "val": args.val_limit,
        "test": args.test_limit,
    }


def main() -> None:
    args = parse_args()

    class_name = args.class_name.strip().lower()
    class_order = [x.strip().lower() for x in args.class_order]

    if class_name not in class_order:
        raise ValueError(f"{class_name} 不在 class-order 中：{class_order}")
    if not args.image_zip.exists():
        raise FileNotFoundError(args.image_zip)
    if not args.annotations_zip.exists():
        raise FileNotFoundError(args.annotations_zip)
    if args.output_tar.exists() and not args.overwrite:
        raise FileExistsError(
            f"{args.output_tar} 已存在；如需覆盖请添加 --overwrite"
        )

    args.output_tar.parent.mkdir(parents=True, exist_ok=True)

    class_to_id = {name: i for i, name in enumerate(class_order)}
    limits = get_limits(args, class_name)
    rng = random.Random(args.seed)

    selected: dict[str, tuple[str, dict[str, Any]]] = {}
    annotation_members: dict[str, str] = {}

    with zipfile.ZipFile(args.annotations_zip, "r") as az:
        for split in ("train", "val", "test"):
            member = find_annotation_member(az, split, class_name)
            annotation_members[split] = member
            data = json.loads(az.read(member).decode("utf-8"))

            entries = list(iter_entries(data))
            rng.shuffle(entries)
            entries = entries[: limits[split]]

            for image_id, entry in entries:
                if image_id in selected:
                    raise RuntimeError(
                        f"图片 ID {image_id} 同时出现在多个 split 中"
                    )
                selected[image_id] = (split, entry)

            print(
                f"{split}: 标注={member}, 计划保留={len(entries)}"
            )

    mode = "w" if args.compression == "none" else "w:gz"
    counters = Counter()
    records: list[dict[str, Any]] = []

    with zipfile.ZipFile(args.image_zip, "r") as iz:
        image_index = build_zip_image_index(iz)
        missing = sorted(set(selected) - set(image_index))
        print(
            f"ZIP 图片数={len(image_index):,}，"
            f"计划保留={len(selected):,}，缺失={len(missing):,}"
        )

        with tarfile.open(args.output_tar, mode=mode) as tf:
            for image_id, (split, entry) in tqdm(
                selected.items(),
                total=len(selected),
                desc=f"处理 {class_name}",
            ):
                member = image_index.get(image_id)
                if member is None:
                    counters["missing_image"] += 1
                    continue

                try:
                    image_bytes = iz.read(member)
                    with Image.open(io.BytesIO(image_bytes)) as im:
                        width, height = im.size
                except Exception:
                    counters["broken_image"] += 1
                    continue

                boxes, labels = extract_boxes_labels(
                    entry,
                    fallback_class=class_name,
                )

                yolo_lines: list[str] = []

                for box, label in zip(boxes, labels):
                    label = label.strip().lower()
                    if label not in class_to_id:
                        label = class_name

                    converted = bbox_to_yolo(box, width, height)
                    if converted is None:
                        counters["invalid_bbox"] += 1
                        continue

                    cx, cy, bw, bh = converted
                    yolo_lines.append(
                        f"{class_to_id[label]} "
                        f"{cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}"
                    )
                    counters[f"box_{label}"] += 1

                if not yolo_lines:
                    counters["empty_label"] += 1
                    continue

                suffix = PurePosixPath(member).suffix.lower()
                output_base = f"{class_name}_{image_id}"

                image_tar_name = f"images/{split}/{output_base}{suffix}"
                label_tar_name = f"labels/{split}/{output_base}.txt"

                add_bytes_to_tar(tf, image_tar_name, image_bytes)
                add_bytes_to_tar(
                    tf,
                    label_tar_name,
                    ("\n".join(yolo_lines) + "\n").encode("utf-8"),
                )

                counters[f"kept_{split}"] += 1
                records.append(
                    {
                        "image_id": image_id,
                        "zip_member": member,
                        "split": split,
                        "image_path": image_tar_name,
                        "label_path": label_tar_name,
                        "boxes": len(yolo_lines),
                    }
                )

            yaml_lines = [
                "path: .",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "",
                "names:",
            ]
            for idx, name in enumerate(class_order):
                yaml_lines.append(f"  {idx}: {name}")

            add_bytes_to_tar(
                tf,
                "data.yaml",
                ("\n".join(yaml_lines) + "\n").encode("utf-8"),
            )

            manifest = {
                "class_name": class_name,
                "image_zip": str(args.image_zip),
                "annotations_zip": str(args.annotations_zip),
                "annotation_members": annotation_members,
                "limits": limits,
                "class_order": class_order,
                "planned_selected": len(selected),
                "missing_examples": missing[:100],
                "counters": dict(counters),
                "records": records,
            }

            add_bytes_to_tar(
                tf,
                f"manifests/{class_name}.json",
                json.dumps(
                    manifest,
                    ensure_ascii=False,
                    indent=2,
                ).encode("utf-8"),
            )

    print("\n完成：", args.output_tar)
    print(json.dumps(dict(counters), ensure_ascii=False, indent=2))
    print(f"输出大小：{args.output_tar.stat().st_size / 1024**3:.2f} GiB")


if __name__ == "__main__":
    main()
