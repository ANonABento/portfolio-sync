import { readdir } from "node:fs/promises";
import { join, extname, relative } from "node:path";

export interface AssetResult {
  models: string[];
  images: string[];
  thumbnail?: string;
}

const MODEL_EXTENSIONS = new Set([".stl", ".gltf", ".glb", ".obj", ".fbx", ".3mf"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const IMAGE_DIRS = new Set(["docs", "assets", "images", "screenshots", "public", "media"]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".next", ".cache", "vendor", ".venv", "venv",
]);
const THUMBNAIL_PATTERNS = [/^thumb/i, /^cover/i, /^hero/i, /^banner/i, /^preview/i];

async function walkDir(
  dir: string,
  rootDir: string,
  filter: (ext: string) => boolean,
  restrictToDirs?: Set<string>,
  depth = 0
): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // If restricted to specific dirs, only recurse into those at top level
      if (restrictToDirs && depth === 0 && !restrictToDirs.has(entry.name.toLowerCase())) {
        continue;
      }
      const found = await walkDir(fullPath, rootDir, filter, undefined, depth + 1);
      results.push(...found);
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (filter(ext)) {
        results.push(relative(rootDir, fullPath).replace(/\\/g, "/"));
      }
    }
  }

  return results;
}

function pickThumbnail(images: string[]): string | undefined {
  if (images.length === 0) return undefined;

  for (const pattern of THUMBNAIL_PATTERNS) {
    const match = images.find((img) => {
      const filename = img.split("/").pop() || "";
      return pattern.test(filename);
    });
    if (match) return match;
  }

  return images[0];
}

export async function detectAssets(dir: string): Promise<AssetResult> {
  // Models: search everywhere
  const models = await walkDir(
    dir, dir,
    (ext) => MODEL_EXTENSIONS.has(ext)
  );

  // Images: search only in designated directories
  const images = await walkDir(
    dir, dir,
    (ext) => IMAGE_EXTENSIONS.has(ext),
    IMAGE_DIRS
  );

  const thumbnail = pickThumbnail(images);

  return { models, images, thumbnail };
}
