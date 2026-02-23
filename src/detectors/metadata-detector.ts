import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

export interface MetadataResult {
  name: string;
  shortDescription?: string;
  description?: string;
  status?: "Completed" | "In Progress" | "Archived";
  dateCompleted?: string;
  links?: { liveDemo?: string; docs?: string };
}

function cleanRepoName(dirName: string): string {
  return dirName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function gitCommand(dir: string, cmd: string): string | null {
  try {
    return execSync(cmd, { cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function inferStatus(lastCommitDate: Date | null): "Completed" | "In Progress" | "Archived" {
  if (!lastCommitDate) return "Completed";
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  return lastCommitDate < oneYearAgo ? "Archived" : "Completed";
}

function toYearMonth(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function detectMetadata(dir: string): Promise<MetadataResult> {
  const name = cleanRepoName(basename(dir));

  // Git last commit date
  const lastCommitStr = gitCommand(dir, "git log -1 --format=%ci");
  const lastCommitDate = lastCommitStr ? new Date(lastCommitStr) : null;

  // Git latest tag date
  const latestTag = gitCommand(dir, "git tag -l --sort=-creatordate --format=%(creatordate:iso)");
  const tagDate = latestTag?.split("\n")[0];

  // Use tag date if available, otherwise last commit
  const dateStr = tagDate || lastCommitStr;
  const dateCompleted = dateStr ? toYearMonth(dateStr) : undefined;

  const status = inferStatus(lastCommitDate);

  // Check package.json for homepage
  let links: MetadataResult["links"] = undefined;
  try {
    const pkgRaw = await readFile(join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);
    if (pkg.homepage) {
      links = { liveDemo: pkg.homepage };
    }
  } catch {
    // no package.json or invalid
  }

  return {
    name,
    status,
    dateCompleted: dateCompleted || undefined,
    links: links || undefined,
  };
}
