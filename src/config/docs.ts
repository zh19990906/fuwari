import type { DocGroupConfig } from "@utils/docs-core";

export const docsGroups: DocGroupConfig[] = [
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
