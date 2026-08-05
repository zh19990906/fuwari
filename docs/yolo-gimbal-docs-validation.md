# YOLO 云台项目文档验证记录

日期：2026-08-05

## 分支范围

分支：`agent/yolo-gimbal-docs`

本分支新增：

- 一个 `YOLO 云台项目` 文档分组；
- 八篇文档文章；
- 一份系列索引；
- 一份设计文档；
- 一份实施计划；
- 一个聚焦静态测试文件，并接入现有 `test:docs` 入口。

## 内容检查

- 八篇文章均使用 `contentType: docs` 和 `docGroup: yolo-gimbal`；
- 发布与更新日期统一为 `2026-08-05`；
- 文章顺序为 10、20、30、40、50、60、70、80；
- 未设置单篇 `author`；
- 网络示例使用 `VISION_HOST_IP`、`K2_HOST_IP` 等占位符；
- 舵机测试从 1500 微秒中位开始，只给出 1475/1525 微秒小范围动作；
- 设备树文档明确限定 Ubuntu 16.04.7、Linux 3.14.29 和对应 `nanopi-k2.dtb`；
- 已实机验证、从代码确认、环境相关推断和待验证事项均已区分；
- 硬件文档明确区分 VCC、V+、GND、OE，并要求板上丝印优先；
- 文档包含 DTB 备份和离线恢复流程。

## 待 CI 验证

Draft PR 创建后由 GitHub Actions 验证：

- Code quality；
- documentation tests；
- Astro Check；
- Astro production build；
- 仓库现有 Node.js 22/23 测试矩阵。

若 CI 暴露格式、Frontmatter、类型或构建问题，修复提交继续追加到同一分支。
