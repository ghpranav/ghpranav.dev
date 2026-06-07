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
  href?: string;
};

export const PROJECTS: readonly Project[] = [
  {
    name: "ask-cody-agent",
    blurb:
      "Production LangGraph ReAct agent with multi-turn conversation, per-user OAuth 2.0 + PKCE, and MCP-based tool orchestration, powering a chatbot and automated L0 incident resolution for an internal Cisco product.",
    stack: ["Python", "Go", "LangGraph", "LangChain", "MCP", "Kubernetes"],
    status: "internal · production",
  },
  {
    name: "vocabgenie",
    blurb:
      "AI-powered vocabulary flashcard app for GRE prep — generates meanings, usage, and mnemonics on the fly via Groq-hosted LLaMA 3, over a deck scraped from Magoosh.",
    stack: ["Next.js", "TypeScript", "Groq", "LLaMA 3", "Tailwind"],
    status: "open source · live demo",
    href: "https://vocabgenie.vercel.app",
  },
  {
    name: "link_preview_generator",
    blurb:
      "Cross-platform Flutter package that turns any URL into a rich preview card, with a robust parsing/scraping engine for broader link support, result caching, and full widget customization.",
    stack: ["Dart", "Flutter"],
    status: "open source · pub.dev",
    href: "https://pub.dev/packages/link_preview_generator",
  },
];

export type Contact = { k: string; v: string; href: string };

export const CONTACTS: readonly Contact[] = [
  { k: "github", v: "github.com/ghpranav", href: "https://github.com/ghpranav" },
  { k: "linkedin", v: "linkedin.com/in/ghpranav", href: "https://linkedin.com/in/ghpranav" },
  { k: "email", v: "bedrepranav@gmail.com", href: "mailto:bedrepranav@gmail.com" },
];
