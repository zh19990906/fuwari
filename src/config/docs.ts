import type { DocGroupConfig } from "@utils/docs-core";

export const docsGroups: DocGroupConfig[] = [
	{
		slug: "linux",
		title: "Linux",
		description: "命令行、权限、服务、日志、网络与磁盘排障笔记",
		order: 10,
	},
	{
		slug: "python",
		title: "Python",
		description: "Python 环境、语法、依赖管理与调试基础",
		order: 20,
	},
	{
		slug: "docker",
		title: "Docker",
		description: "容器、镜像、Compose、数据持久化与排障笔记",
		order: 30,
	},
	{
		slug: "postgresql",
		title: "PostgreSQL",
		description: "数据库部署、备份恢复、索引与性能优化笔记",
		order: 40,
	},
	{
		slug: "yolo",
		title: "YOLO",
		description: "YOLO 版本演进、训练、推理与部署笔记",
		order: 50,
	},
	{
		slug: "nginx",
		title: "Nginx",
		description: "反向代理、HTTPS、证书管理与负载均衡实践",
		order: 60,
	},
	{
		slug: "ai-llm",
		title: "AI / LLM",
		description: "NLP、注意力机制、Transformer 与大语言模型基础",
		order: 70,
	},
	{
		slug: "devops",
		title: "DevOps",
		description: "版本控制、CI/CD、发布、可观测性与自动化实践",
		order: 80,
	},
];
