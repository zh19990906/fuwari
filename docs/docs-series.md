# 文档系列使用说明

Fuwari 的文档系列继续使用现有的 `src/content/posts` Markdown 文件，不需要移动文章，也不会改变已有文章地址。

## 配置文档分组

在 `src/config/docs.ts` 中添加分组：

```ts
export const docsGroups = [
	{
		slug: "yolo",
		title: "YOLO",
		description: "目标检测、训练与部署笔记",
		order: 10,
	},
	{
		slug: "docker",
		title: "Docker",
		description: "容器、镜像与 Compose 使用笔记",
		order: 20,
	},
];
```

- `slug`：稳定标识，同时用于 `/docs/<slug>/` 地址和文章 Frontmatter。
- `title`：页面显示名称。
- `description`：文档首页中的说明文字。
- `order`：分组顺序，数字越小越靠前。

## 将文章加入文档系列

在普通文章 Frontmatter 中增加四个字段：

```yaml
---
title: YOLO 环境搭建
published: 2026-07-30
category: YOLO
tags:
  - YOLO
  - Python
contentType: docs
docGroup: yolo
docSection: 快速开始
docOrder: 10
---
```

- `contentType: docs`：将文章标记为文档。
- `docGroup`：必须匹配 `src/config/docs.ts` 中的分组 `slug`。
- `docSection`：一层章节名称，例如“快速开始”或“部署”；不填写时放在无标题章节，并显示在命名章节之后。
- `docOrder`：组内顺序，数字越小越靠前；不填写时排在显式排序的文章之后。

文件仍放在 `src/content/posts`，文章地址仍然是：

```text
/posts/<文章 slug>/
```

结构化入口是：

```text
/docs/
/docs/yolo/
/docs/docker/
```

文档仍会出现在博客首页、归档、分类、标签和搜索中。文档文章的左侧栏会显示当前系列目录，上一篇和下一篇只在当前文档系列中移动。

## 配置校验

以下情况会直接使构建失败，并在错误中指出对应文章：

- `contentType: docs` 但没有 `docGroup`；
- `docGroup` 不存在于 `src/config/docs.ts`；
- 两个文档分组使用相同的 `slug`。
