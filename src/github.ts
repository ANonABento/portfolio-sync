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

export interface GitHubClient {
  octokit: Octokit;
  username: string;
}

export function createClient(username: string, token?: string): GitHubClient {
  const octokit = new Octokit(token ? { auth: token } : {});
  return { octokit, username };
}

export async function listRepos(client: GitHubClient): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];

  const iterator = client.octokit.paginate.iterator(
    client.octokit.rest.repos.listForUser,
    { username: client.username, per_page: 100, sort: "pushed" }
  );

  for await (const { data } of iterator) {
    for (const repo of data) {
      repos.push({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
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

export async function getFileContent(
  client: GitHubClient,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await client.octokit.rest.repos.getContent({
      owner: client.username,
      repo,
      path,
    });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function getRepoTree(
  client: GitHubClient,
  repo: string,
  branch: string
): Promise<string[]> {
  try {
    const { data } = await client.octokit.rest.git.getTree({
      owner: client.username,
      repo,
      tree_sha: branch,
      recursive: "1",
    });
    return data.tree
      .filter((item) => item.type === "blob" && item.path)
      .map((item) => item.path!);
  } catch {
    return [];
  }
}
