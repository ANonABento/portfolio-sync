import { Octokit } from "octokit";

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  topics: string[];
  language: string | null;
  archived: boolean;
  pushedAt: string;
  defaultBranch: string;
}

export interface PortfolioEntry {
  name: string;
  shortDescription?: string;
  description?: string;
  category?: string;
  technologies?: string[];
  status?: string;
  dateCompleted?: string;
  models?: string[];
  images?: string[];
  featured?: boolean;
  github: string;
  links?: { liveDemo?: string; docs?: string };
  media?: { video?: string; website?: string };
  enabled: boolean; // UI toggle
}

export type OutputFormat = "json" | "yaml" | "markdown";

const TOPIC_MAP: Record<string, string> = {
  react: "React", nextjs: "Next.js", vue: "Vue", angular: "Angular",
  svelte: "Svelte", typescript: "TypeScript", python: "Python",
  rust: "Rust", go: "Go", "machine-learning": "Machine Learning",
  "three-js": "Three.js", threejs: "Three.js", tailwindcss: "Tailwind CSS",
  docker: "Docker", kubernetes: "Kubernetes", graphql: "GraphQL",
  tensorflow: "TensorFlow", pytorch: "PyTorch",
};

function inferTech(lang: string | null, topics: string[]): string[] {
  const techs: string[] = [];
  if (lang) techs.push(lang);
  for (const t of topics) {
    if (TOPIC_MAP[t]) techs.push(TOPIC_MAP[t]);
  }
  return [...new Set(techs)];
}

function inferCategory(topics: string[], lang: string | null): string {
  const t = new Set(topics);
  if (t.has("game") || t.has("gamedev") || t.has("unity")) return "Game Development";
  if (t.has("machine-learning") || t.has("deep-learning") || t.has("ai")) return "Machine Learning";
  if (t.has("robotics") || t.has("arduino") || t.has("embedded")) return "Robotics";
  if (t.has("three-js") || t.has("threejs") || t.has("webgl") || t.has("3d")) return "Web 3D";
  if (t.has("react") || t.has("vue") || t.has("angular") || t.has("nextjs")) return "Web App";
  if (t.has("api") || t.has("backend") || t.has("server")) return "Backend/API";
  if (t.has("mobile") || t.has("react-native") || t.has("flutter")) return "Mobile App";
  if (t.has("cli") || t.has("tool")) return "CLI Tool";
  if (lang === "C#") return "Game Development";
  if (lang === "Rust") return "Systems Programming";
  if (lang === "Go") return "Backend/API";
  if (lang === "Python") return "Python";
  return "Software";
}

function inferStatus(repo: RepoInfo): string {
  if (repo.archived) return "Archived";
  const pushed = new Date(repo.pushedAt);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return pushed < oneYearAgo ? "Archived" : "Completed";
}

function toYearMonth(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function getFileContent(octokit: Octokit, owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if ("content" in data && data.content) {
      return atob(data.content);
    }
    return null;
  } catch {
    return null;
  }
}

async function getTree(octokit: Octokit, owner: string, repo: string, branch: string): Promise<string[]> {
  try {
    const { data } = await octokit.rest.git.getTree({ owner, repo, tree_sha: branch, recursive: "1" });
    return data.tree.filter((i) => i.type === "blob" && i.path).map((i) => i.path!);
  } catch {
    return [];
  }
}

const MODEL_EXTS = [".stl", ".gltf", ".glb", ".obj", ".fbx", ".3mf"];
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const IMAGE_DIRS = ["docs/", "assets/", "images/", "screenshots/", "media/"];

export async function fetchRepos(token: string): Promise<RepoInfo[]> {
  const octokit = new Octokit({ auth: token });
  const repos: RepoInfo[] = [];

  const { data: user } = await octokit.rest.users.getAuthenticated();

  const iterator = octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "pushed",
    affiliation: "owner",
  });

  for await (const { data } of iterator) {
    for (const repo of data) {
      repos.push({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description ?? null,
        url: repo.html_url,
        homepage: repo.homepage || null,
        topics: repo.topics || [],
        language: repo.language ?? null,
        archived: repo.archived ?? false,
        pushedAt: repo.pushed_at ?? "",
        defaultBranch: repo.default_branch ?? "main",
      });
    }
  }

  return repos;
}

export async function processRepo(
  token: string,
  repo: RepoInfo
): Promise<PortfolioEntry> {
  const octokit = new Octokit({ auth: token });
  const owner = repo.fullName.split("/")[0];

  // Check for .portfolio.json
  const configRaw = await getFileContent(octokit, owner, repo.name, ".portfolio.json");
  if (configRaw) {
    try {
      const config = JSON.parse(configRaw);
      return {
        name: config.name || repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        shortDescription: config.shortDescription,
        description: config.description || repo.description || undefined,
        category: config.category || inferCategory(repo.topics, repo.language),
        technologies: config.technologies || inferTech(repo.language, repo.topics),
        status: config.status || inferStatus(repo),
        dateCompleted: config.dateCompleted || toYearMonth(repo.pushedAt),
        featured: config.featured,
        github: repo.url,
        links: config.links || (repo.homepage ? { liveDemo: repo.homepage } : undefined),
        media: config.media,
        models: config.models,
        images: config.images,
        enabled: config.exclude !== true,
      };
    } catch { /* fall through */ }
  }

  // Auto-detect
  const readmeRaw = await getFileContent(octokit, owner, repo.name, "README.md");
  let description = repo.description || undefined;
  let shortDescription = description;

  if (readmeRaw) {
    const lines = readmeRaw.split("\n");
    const paragraphs: string[] = [];
    let pastTitle = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) { pastTitle = true; continue; }
      if (!trimmed || trimmed.startsWith("[![") || trimmed.startsWith("<")) continue;
      if (pastTitle) paragraphs.push(trimmed);
      if (paragraphs.length >= 3) break;
    }
    if (paragraphs.length > 0) {
      const readme = paragraphs.join(" ");
      if (!description || readme.length > description.length) description = readme;
      if (!shortDescription) {
        const match = readme.match(/^[^.!?]+[.!?]/);
        shortDescription = match ? match[0].trim() : readme.slice(0, 120);
      }
    }
  }

  const tree = await getTree(octokit, owner, repo.name, repo.defaultBranch);
  const models = tree.filter((f) => MODEL_EXTS.some((e) => f.endsWith(e)));
  const images = tree.filter((f) => IMAGE_EXTS.some((e) => f.endsWith(e)) && IMAGE_DIRS.some((d) => f.startsWith(d)));

  return {
    name: repo.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    shortDescription,
    description,
    category: inferCategory(repo.topics, repo.language),
    technologies: inferTech(repo.language, repo.topics),
    status: inferStatus(repo),
    dateCompleted: toYearMonth(repo.pushedAt),
    github: repo.url,
    links: repo.homepage ? { liveDemo: repo.homepage } : undefined,
    models: models.length > 0 ? models : undefined,
    images: images.length > 0 ? images : undefined,
    enabled: true,
  };
}

// Format helpers
export function toJson(entries: PortfolioEntry[]): string {
  const clean = entries.map(({ enabled, ...rest }) => rest);
  return JSON.stringify({ projects: clean }, null, 2);
}

export function toYaml(entries: PortfolioEntry[]): string {
  const lines: string[] = ["projects:"];
  for (const e of entries) {
    lines.push(`  - name: "${e.name}"`);
    if (e.shortDescription) lines.push(`    shortDescription: "${e.shortDescription}"`);
    if (e.category) lines.push(`    category: ${e.category}`);
    if (e.technologies?.length) lines.push(`    technologies: [${e.technologies.join(", ")}]`);
    if (e.status) lines.push(`    status: ${e.status}`);
    if (e.dateCompleted) lines.push(`    dateCompleted: ${e.dateCompleted}`);
    lines.push(`    github: ${e.github}`);
    if (e.featured) lines.push(`    featured: true`);
    if (e.links?.liveDemo) lines.push(`    liveDemo: ${e.links.liveDemo}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function toMarkdown(entries: PortfolioEntry[]): string {
  const lines: string[] = [`# Portfolio — ${entries.length} projects\n`];
  const categories = new Map<string, PortfolioEntry[]>();
  for (const e of entries) {
    const cat = e.category || "Other";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(e);
  }
  for (const [category, projects] of categories) {
    lines.push(`## ${category}\n`);
    for (const p of projects) {
      lines.push(`### ${p.name}${p.featured ? " *" : ""}\n`);
      if (p.shortDescription) lines.push(`${p.shortDescription}\n`);
      if (p.technologies?.length) lines.push(`- **Tech:** ${p.technologies.join(", ")}`);
      if (p.status) lines.push(`- **Status:** ${p.status}`);
      lines.push(`- **GitHub:** ${p.github}`);
      if (p.links?.liveDemo) lines.push(`- **Live:** ${p.links.liveDemo}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function formatEntries(entries: PortfolioEntry[], format: OutputFormat): string {
  const enabled = entries.filter((e) => e.enabled);
  switch (format) {
    case "yaml": return toYaml(enabled);
    case "markdown": return toMarkdown(enabled);
    default: return toJson(enabled);
  }
}
