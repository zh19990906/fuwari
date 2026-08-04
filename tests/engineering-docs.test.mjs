import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const postsDir = path.join(root, "src/content/posts");

const expectedDocs = {
	"fastapi-authentication-authorization.md": {
		group: "python",
		section: "Web 工程",
		order: 110,
		required: ["OAuth2PasswordBearer", "Argon2", "Refresh Token", "资源所有者", "生产检查清单"],
		official: ["fastapi.tiangolo.com"],
	},
	"fastapi-testing-pytest.md": {
		group: "python",
		section: "Web 工程",
		order: 120,
		required: ["TestClient", "dependency_overrides", "事务回滚", "pytest", "生产检查清单"],
		official: ["fastapi.tiangolo.com", "pytest.org"],
	},
	"fastapi-sqlalchemy-alembic.md": {
		group: "python",
		section: "Web 工程",
		order: 130,
		required: ["SQLAlchemy 2", "sessionmaker", "Alembic", "N+1", "生产检查清单"],
		official: ["docs.sqlalchemy.org", "alembic.sqlalchemy.org"],
	},
	"postgresql-transactions-locks.md": {
		group: "postgresql",
		section: "事务与并发",
		order: 60,
		required: ["Read Committed", "FOR UPDATE", "pg_locks", "死锁", "生产检查清单"],
		official: ["postgresql.org/docs/current"],
	},
	"python-opentelemetry-observability.md": {
		group: "python",
		section: "可观测性",
		order: 140,
		required: ["OpenTelemetry", "OTLP", "Trace ID", "高基数", "生产检查清单"],
		official: ["opentelemetry.io/docs/languages/python"],
	},
	"docker-compose-production.md": {
		group: "docker",
		section: "生产部署",
		order: 70,
		required: ["compose.production.yaml", "service_healthy", "healthcheck", "回滚", "生产检查清单"],
		official: ["docs.docker.com/compose"],
	},
	"dockerfile-production-security.md": {
		group: "docker",
		section: "镜像构建",
		order: 80,
		required: ["multi-stage", ".dockerignore", "USER", "SBOM", "生产检查清单"],
		official: ["docs.docker.com/build", "docs.docker.com/engine/security/rootless"],
	},
	"github-actions-secure-cicd.md": {
		group: "devops",
		section: "CI/CD",
		order: 10,
		required: ["GITHUB_TOKEN", "full-length commit SHA", "id-token: write", "concurrency", "生产检查清单"],
		official: ["docs.github.com/en/actions"],
	},
};

function frontmatterValue(content, key) {
	const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	return match?.[1]?.trim();
}

for (const [filename, requirements] of Object.entries(expectedDocs)) {
	test(`${filename} follows engineering documentation contract`, async () => {
		const content = await readFile(path.join(postsDir, filename), "utf8");
		assert.match(content, /^---\n[\s\S]*?\n---\n/);
		assert.equal(frontmatterValue(content, "contentType"), "docs");
		assert.equal(frontmatterValue(content, "docGroup"), requirements.group);
		assert.equal(frontmatterValue(content, "docSection"), requirements.section);
		assert.equal(Number(frontmatterValue(content, "docOrder")), requirements.order);
		assert.equal(frontmatterValue(content, "updated"), "2026-08-04");
		assert.equal(frontmatterValue(content, "draft"), "false");
		assert.doesNotMatch(content, /^author:/m);
		for (const phrase of requirements.required) {
			assert.ok(content.includes(phrase), `${filename} missing ${phrase}`);
		}
		for (const domain of requirements.official) {
			assert.ok(content.includes(domain), `${filename} missing official reference ${domain}`);
		}
		assert.doesNotMatch(content, /(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}/);
		assert.doesNotMatch(content, /(?:password|secret|api[_-]?key|access[_-]?key|token)\s*[=:]\s*["'][A-Za-z0-9_\-]{8,}["']/i);
		assert.doesNotMatch(content, /minioadmin|changeme|password123|admin123/i);
		const fenceCount = (content.match(/```/g) ?? []).length;
		assert.equal(fenceCount % 2, 0, `${filename} has unclosed code fence`);
	});
}

test("registers the DevOps documentation group", async () => {
	const config = await readFile(path.join(root, "src/config/docs.ts"), "utf8");
	assert.match(
		config,
		/slug: "devops"[\s\S]*?title: "DevOps"[\s\S]*?order: 80/,
	);
});
