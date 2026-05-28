// ═══════════════════════════════════════════════════════════════════════════
// Static content rendered by the terminal commands. Plain data only —
// the React components consume these and decide how to render.
// ═══════════════════════════════════════════════════════════════════════════

export const ASCII_NAME = `
 ____  ____      _    _   _    _    __     __
|  _ \\|  _ \\    / \\  | \\ | |  / \\   \\ \\   / /
| |_) | |_) |  / _ \\ |  \\| | / _ \\   \\ \\ / /
|  __/|  _ <  / ___ \\| |\\  |/ ___ \\   \\ V /
|_|   |_| \\_\\/_/   \\_\\_| \\_/_/   \\_\\   \\_/
`;

export type WhoamiSegment = {
  c: "accent" | "accent2" | "dim" | "fg";
  t: string;
};

export const WHOAMI: WhoamiSegment[] = [
  { c: "accent", t: "pranav" },
  { c: "dim", t: "@" },
  { c: "accent2", t: "dev" },
  { c: "dim", t: ":~$ " },
  { c: "fg", t: "Software Engineer at Cisco · AI agents, backend, DevX · Bangalore" },
];

export const ABOUT = `Software engineer at Cisco's Engineering Productivity team,
on the CoDE (Cisco Developer Experience) platform — an internal
DevOps platform with 100+ microservices serving hundreds of
engineering teams.

Focus: production AI agents (LangGraph, MCP), event-driven backends,
release engineering, and full-stack feature delivery across the
microservice platform.

Try \`ask\` to chat with an on-device LLM about my work.
Type \`help\` to see all commands.`;

export type Skills = Record<string, readonly string[]>;

export const SKILLS: Skills = {
  languages: ["Python", "Go", "Java", "TypeScript", "Kotlin", "Bash"],
  ai: ["LangGraph", "LangChain", "MCP", "LLMs", "RAG", "OAuth 2.0 + PKCE"],
  backend: ["Spring Boot", "FastAPI", "Kafka", "gRPC", "Event-driven"],
  frontend: ["React 18", "Remix", "Nx", "Vite", "TypeScript"],
  infra: ["Kubernetes", "OpenShift", "Docker", "ArgoCD", "Jenkins"],
  data: ["MongoDB", "Redis", "PostgreSQL", "BigQuery"],
  observability: ["Splunk", "Prometheus", "Grafana"],
};

export type Project = {
  name: string;
  blurb: string;
  stack: readonly string[];
  status: string;
};

export const PROJECTS: readonly Project[] = [
  {
    name: "ai-sre-agent",
    blurb:
      "Production LangGraph ReAct agent with multi-turn conversation, per-user OAuth 2.0 + PKCE, and MCP-based tool orchestration powering automated L0 incident resolution for an internal support team.",
    stack: ["Python", "LangGraph", "LangChain", "MCP", "Kubernetes"],
    status: "internal · production",
  },
  {
    name: "ai-sre-pipeline",
    blurb:
      "Kafka-based incident processing pipeline that consumes ITSM events in real time and applies LLM-based triage to filter unresolvable cases and post automated resolutions.",
    stack: ["Python", "Kafka", "LLMs", "Kubernetes"],
    status: "internal · production",
  },
  {
    name: "release-platform",
    blurb:
      "Native release-management platform replacing a third-party tool — 5 categories of automated compliance guardrails (Quality, SOX, Security, Change, Capability) across a microservice architecture. Led the 9-month effort as technical lead.",
    stack: ["Go", "Java", "React", "MongoDB", "Kafka"],
    status: "internal · shipped",
  },
  {
    name: "bigquery-cicd",
    blurb:
      "Pre-packaged CI/CD pipeline for Google BigQuery enabling ~100 data applications to deploy DDL scripts with automated validation — ~70% productivity improvement.",
    stack: ["Jenkins", "BigQuery", "Python"],
    status: "internal · shipped",
  },
];

export type Contact = { k: string; v: string; href: string };

export const CONTACTS: readonly Contact[] = [
  { k: "github", v: "github.com/ghpranav", href: "https://github.com/ghpranav" },
  { k: "linkedin", v: "linkedin.com/in/ghpranav", href: "https://linkedin.com/in/ghpranav" },
  { k: "email", v: "bedrepranav@gmail.com", href: "mailto:bedrepranav@gmail.com" },
];
