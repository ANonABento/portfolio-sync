import chalk from "chalk";
import { writeFile } from "node:fs/promises";
import {
  createClient,
  listRepos,
  getFileContent,
  getRepoTree,
  type RepoInfo,
  type GitHubClient,
} from "./github.js";
import { validateConfig, type PortfolioConfig } from "./schema.js";

export type OutputFormat = "json" | "yaml" | "markdown";

interface GenerateOptions {
  user: string;
  output: string;
  format: OutputFormat;
  token?: string;
  exclude?: string[];
  dryRun?: boolean;
}

interface PortfolioEntry {
  name: string;
  shortDescription?: string;
  description?: string;
  category?: string;
  technologies?: string[];
  status?: string;
  dateCompleted?: string;
  models?: string[];
  images?: string[];
  thumbnail?: string;
  media?: PortfolioConfig["media"];
  links?: PortfolioConfig["links"];
  featured?: boolean;
  github: string;
}

const MODEL_EXTS = new Set([".stl", ".gltf", ".glb", ".obj", ".fbx", ".3mf"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const IMAGE_DIRS = ["docs/", "assets/", "images/", "screenshots/", "media/"];

function inferTechFromLanguage(lang: string | null, topics: string[]): string[] {
  const techs: string[] = [];
  if (lang) techs.push(lang);

  const topicMap: Record<string, string> = {
    react: "React", nextjs: "Next.js", vue: "Vue", angular: "Angular",
    svelte: "Svelte", typescript: "TypeScript", python: "Python",
    rust: "Rust", go: "Go", "machine-learning": "Machine Learning",
    "three-js": "Three.js", threejs: "Three.js", tailwindcss: "Tailwind CSS",
    docker: "Docker", kubernetes: "Kubernetes", graphql: "GraphQL",
    tensorflow: "TensorFlow", pytorch: "PyTorch",
  };

  for (const topic of topics) {
    if (topicMap[topic]) techs.push(topicMap[topic]);
  }

  return [...new Set(techs)];
}

function inferCategoryFromTopics(
  topics: string[],
  lang: string | null
): string {
  const t = new Set(topics);
  if (t.has("game") || t.has("gamedev") || t.has("unity") || t.has("unreal"))
    return "Game Development";
  if (t.has("machine-learning") || t.has("deep-learning") || t.has("ai"))
    return "Machine Learning";
  if (t.has("robotics") || t.has("arduino") || t.has("embedded"))
    return "Robotics";
  if (t.has("three-js") || t.has("threejs") || t.has("webgl") || t.has("3d"))
    return "Web 3D";
  if (t.has("react") || t.has("vue") || t.has("angular") || t.has("nextjs") || t.has("webapp"))
    return "Web App";
  if (t.has("api") || t.has("backend") || t.has("server"))
    return "Backend/API";
  if (t.has("mobile") || t.has("react-native") || t.has("flutter"))
    return "Mobile App";
  if (t.has("cli") || t.has("tool")) return "CLI Tool";

  if (lang === "C#") return "Game Development";
  if (lang === "Rust") return "Systems Programming";
  if (lang === "Go") return "Backend/API";
  if (lang === "Python") return "Python";

  return "Software";
}

function inferStatus(repo: RepoInfo): "Completed" | "In Progress" | "Archived" {
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

function findAssetsInTree(files: string[]): { models: string[]; images: string[] } {
  const models: string[] = [];
  const images: string[] = [];

  for (const file of files) {
    const ext = "." + file.split(".").pop()?.toLowerCase();
    if (MODEL_EXTS.has(ext)) {
      models.push(file);
    }
    if (IMAGE_EXTS.has(ext)) {
      const inImageDir = IMAGE_DIRS.some((d) => file.startsWith(d));
      if (inImageDir) images.push(file);
    }
  }

  return { models, images };
}

async function processRepo(
  client: GitHubClient,
  repo: RepoInfo
): Promise<PortfolioEntry | null> {
  // Check for .portfolio.json first
  const configRaw = await getFileContent(client, repo.name, ".portfolio.json");

  if (configRaw) {
    try {
      const parsed = JSON.parse(configRaw);
      const result = validateConfig(parsed);
      if (result.success) {
        return {
          ...result.data,
          github: repo.url,
          technologies: result.data.technologies || inferTechFromLanguage(repo.language, repo.topics),
          category: result.data.category || inferCategoryFromTopics(repo.topics, repo.language),
          status: result.data.status || inferStatus(repo),
        };
      }
    } catch {
      // invalid config, fall through to auto-detect
    }
  }

  // Auto-detect from repo metadata
  const readmeRaw = await getFileContent(client, repo.name, "README.md");

  let description = repo.description || undefined;
  let shortDescription = description;

  if (readmeRaw) {
    const lines = readmeRaw.split("\n");
    const paragraphs: string[] = [];
    let pastTitle = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        if (pastTitle && paragraphs.length > 0) break;
        pastTitle = true;
        continue;
      }
      if (!trimmed || trimmed.startsWith("[![") || trimmed.startsWith("<")) continue;
      if (pastTitle) paragraphs.push(trimmed);
      if (paragraphs.length >= 3) break;
    }

    if (paragraphs.length > 0) {
      const readme = paragraphs.join(" ");
      if (!description || readme.length > description.length) {
        description = readme;
      }
      if (!shortDescription) {
        const match = readme.match(/^[^.!?]+[.!?]/);
        shortDescription = match ? match[0].trim() : readme.slice(0, 120);
      }
    }
  }

  // Get file tree for asset detection
  const tree = await getRepoTree(client, repo.name, repo.defaultBranch);
  const { models, images } = findAssetsInTree(tree);

  const name = repo.name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const entry: PortfolioEntry = {
    name,
    shortDescription,
    description,
    category: inferCategoryFromTopics(repo.topics, repo.language),
    technologies: inferTechFromLanguage(repo.language, repo.topics),
    status: inferStatus(repo),
    dateCompleted: toYearMonth(repo.pushedAt),
    github: repo.url,
  };

  if (models.length > 0) entry.models = models;
  if (images.length > 0) entry.images = images;

  if (repo.homepage) {
    entry.links = { liveDemo: repo.homepage };
  }

  return entry;
}

function toYaml(entries: PortfolioEntry[]): string {
  const lines: string[] = ["projects:"];
  for (const entry of entries) {
    lines.push(`  - name: "${entry.name}"`);
    if (entry.shortDescription) lines.push(`    shortDescription: "${entry.shortDescription}"`);
    if (entry.description) lines.push(`    description: "${entry.description}"`);
    if (entry.category) lines.push(`    category: ${entry.category}`);
    if (entry.technologies?.length) {
      lines.push(`    technologies: [${entry.technologies.join(", ")}]`);
    }
    if (entry.status) lines.push(`    status: ${entry.status}`);
    if (entry.dateCompleted) lines.push(`    dateCompleted: ${entry.dateCompleted}`);
    lines.push(`    github: ${entry.github}`);
    if (entry.featured) lines.push(`    featured: true`);
    if (entry.models?.length) {
      lines.push(`    models:`);
      for (const m of entry.models) lines.push(`      - ${m}`);
    }
    if (entry.images?.length) {
      lines.push(`    images:`);
      for (const i of entry.images) lines.push(`      - ${i}`);
    }
    if (entry.links?.liveDemo) lines.push(`    liveDemo: ${entry.links.liveDemo}`);
    if (entry.media?.video) lines.push(`    video: ${entry.media.video}`);
    lines.push("");
  }
  return lines.join("\n");
}

function toMarkdown(entries: PortfolioEntry[]): string {
  const lines: string[] = [`# Portfolio — ${entries.length} projects\n`];

  const categories = new Map<string, PortfolioEntry[]>();
  for (const entry of entries) {
    const cat = entry.category || "Other";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(entry);
  }

  for (const [category, projects] of categories) {
    lines.push(`## ${category}\n`);
    for (const p of projects) {
      const featured = p.featured ? " ⭐" : "";
      lines.push(`### ${p.name}${featured}\n`);
      if (p.shortDescription) lines.push(`${p.shortDescription}\n`);
      if (p.technologies?.length) {
        lines.push(`- **Tech:** ${p.technologies.join(", ")}`);
      }
      if (p.status) lines.push(`- **Status:** ${p.status}`);
      if (p.dateCompleted) lines.push(`- **Date:** ${p.dateCompleted}`);
      lines.push(`- **GitHub:** ${p.github}`);
      if (p.links?.liveDemo) lines.push(`- **Live:** ${p.links.liveDemo}`);
      if (p.media?.video) lines.push(`- **Video:** ${p.media.video}`);
      if (p.models?.length) lines.push(`- **3D Models:** ${p.models.length} file(s)`);
      if (p.images?.length) lines.push(`- **Images:** ${p.images.length} file(s)`);
      if (p.description && p.description !== p.shortDescription) {
        lines.push(`\n${p.description}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatOutput(entries: PortfolioEntry[], format: OutputFormat): string {
  switch (format) {
    case "yaml":
      return toYaml(entries);
    case "markdown":
      return toMarkdown(entries);
    case "json":
    default:
      return JSON.stringify({ projects: entries }, null, 2);
  }
}

const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
  json: ".json",
  yaml: ".yaml",
  markdown: ".md",
};

export async function generate(options: GenerateOptions): Promise<void> {
  const { user, output, format, token, exclude = [], dryRun = false } = options;

  console.log(chalk.blue(`\nFetching repos for ${chalk.bold(user)}...\n`));

  const client = createClient(user, token);
  const repos = await listRepos(client);

  const excludeSet = new Set(exclude);
  const filtered = repos.filter(
    (r) => !excludeSet.has(r.name) && !r.name.startsWith(".")
  );

  console.log(
    chalk.gray(`Found ${repos.length} repos, processing ${filtered.length}...\n`)
  );

  const entries: PortfolioEntry[] = [];
  let withConfig = 0;
  let autoDetected = 0;

  for (const repo of filtered) {
    process.stdout.write(chalk.gray(`  ${repo.name}...`));

    try {
      const entry = await processRepo(client, repo);
      if (entry) {
        if (entry.featured !== undefined) withConfig++;
        else autoDetected++;
        entries.push(entry);
        console.log(chalk.green(" done"));
      } else {
        console.log(chalk.yellow(" skipped"));
      }
    } catch (err) {
      console.log(chalk.red(` error: ${err instanceof Error ? err.message : err}`));
    }
  }

  // Sort: featured first, then by date
  entries.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (b.dateCompleted || "").localeCompare(a.dateCompleted || "");
  });

  const formatted = formatOutput(entries, format);

  // Fix output extension if it doesn't match format
  let finalOutput = output;
  const expectedExt = FORMAT_EXTENSIONS[format];
  if (!output.endsWith(expectedExt)) {
    finalOutput = output.replace(/\.[^.]+$/, expectedExt);
  }

  if (dryRun) {
    console.log(chalk.yellow("\n--- DRY RUN ---\n"));
    console.log(formatted);
  } else {
    await writeFile(finalOutput, formatted + "\n", "utf-8");
    console.log(chalk.green(`\nWrote ${entries.length} projects to ${finalOutput}`));
  }

  console.log(
    chalk.gray(
      `\n  ${withConfig} with .portfolio.json, ${autoDetected} auto-detected\n`
    )
  );
}
