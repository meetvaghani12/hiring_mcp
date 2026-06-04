import { db, pool } from "./index.js";
import { positions } from "./schema.js";

const SAMPLE_POSITIONS = [
  {
    title: "Senior Cloud Platform Engineer",
    location: "Remote",
    description: [
      "## Senior Cloud Platform Engineer",
      "",
      "We're building cloud-native data platforms at scale. You'll own infrastructure-as-code,",
      "CI/CD, and production reliability across our GCP estate.",
      "",
      "### Responsibilities",
      "- Design and operate Terraform-driven GKE / Compute Engine deployments",
      "- Build and maintain CI/CD pipelines (Cloud Build, GitHub Actions)",
      "- Own IAM, networking, and Cloud Monitoring across production",
      "",
      "### Qualifications",
      "- 4+ years in cloud / platform engineering",
      "- Deep GCP (or AWS) experience, strong with Terraform + Docker",
      "- Comfortable scripting in Python / Bash",
    ].join("\n"),
  },
  {
    title: "Backend Engineer (Go)",
    location: "Hybrid — Bengaluru",
    description: [
      "## Backend Engineer (Go)",
      "",
      "Join the core services team building high-throughput APIs.",
      "",
      "### Responsibilities",
      "- Design and ship Go services backed by Postgres",
      "- Care about test discipline, observability, and clean error handling",
      "",
      "### Qualifications",
      "- 3+ years building production backends",
      "- Strong Go + SQL; bonus for gRPC and event-driven systems",
    ].join("\n"),
  },
  {
    title: "AI Agent Engineer",
    location: "Remote",
    description: [
      "## AI Agent Engineer",
      "",
      "Build production AI agents and MCP integrations on top of LLMs.",
      "",
      "### Responsibilities",
      "- Design RAG pipelines and tool-using agents",
      "- Build and operate MCP servers / clients",
      "",
      "### Qualifications",
      "- Experience with LLM application development",
      "- Familiarity with MCP, vector retrieval, and prompt engineering",
    ].join("\n"),
  },
];

async function main() {
  console.log("Seeding positions…");
  for (const p of SAMPLE_POSITIONS) {
    await db.insert(positions).values(p);
    console.log(`  + ${p.title}`);
  }
  console.log("Seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
