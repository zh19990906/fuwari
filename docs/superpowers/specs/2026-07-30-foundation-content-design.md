# Foundation Documentation Content Design

**Date:** 2026-07-30

## Goal

Replace the Fuwari demo posts with a practical Chinese documentation library organized by the documentation-series feature.

## Document groups

- `linux`: common commands, files and permissions, processes/services/logs, networking and disks.
- `python`: environment setup, language essentials, virtual environments and packages, debugging and logging.
- `docker`: concepts and installation, images and containers, Compose practice, storage and troubleshooting.
- `postgresql`: installation and deployment, roles/backups, indexes and EXPLAIN, configuration and optimization.
- `yolo`: version timeline, YOLOv5, YOLOv8, YOLO11, YOLO26, and deployment guidance.

## Content rules

- Every article uses `contentType: docs`, `docGroup`, `docSection`, and `docOrder`.
- Document article URLs remain under `/posts/` and are discoverable through `/docs/`.
- Articles are practical reference notes rather than exhaustive textbooks.
- Commands that can delete data or alter security settings include warnings.
- Version-sensitive claims include an official reference section.
- Publication dates are distributed from 2023 through 2026. YOLO version articles use their release-era date and `updated: 2026-07-30` to show the current editorial pass.
- Demo posts and the guide cover asset are removed.

## Initial batch

The first batch contains foundation and daily-use documents only. Advanced topics such as Kubernetes, PostgreSQL replication/high availability, Python web frameworks, and model serving clusters remain out of scope.
