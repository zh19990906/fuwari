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
    parts = [p.strip() for p in value.split(",") if p.strip()]
    if not parts:
        raise argparse.ArgumentTypeError("device 不能为空")
    try:
        ids = [int(p) for p in parts]
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "device 应为 0、1、0,1 或 cpu"
        ) from exc
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

    cache = False if args.cache == "false" else args.cache

    if args.resume:
        checkpoint = Path(args.resume)
        if not checkpoint.is_file():
            raise FileNotFoundError(f"找不到断点文件：{checkpoint}")
        model = YOLO(str(checkpoint))
        model.train(resume=True)
        return

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
