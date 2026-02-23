import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const gameSchema = z.object({
  type: z.enum(["unity-webgl", "itch"]),
  url: z.string().url(),
});

const mediaSchema = z.object({
  video: z.string().url().optional(),
  website: z.string().url().optional(),
  pdf: z.string().optional(),
  game: gameSchema.optional(),
});

const linksSchema = z.object({
  liveDemo: z.string().url().optional(),
  docs: z.string().url().optional(),
});

export const portfolioConfigSchema = z.object({
  name: z.string().min(1),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  status: z.enum(["Completed", "In Progress", "Archived"]).optional(),
  dateCompleted: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format")
    .optional(),
  models: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  thumbnail: z.string().optional(),
  media: mediaSchema.optional(),
  links: linksSchema.optional(),
  featured: z.boolean().optional(),
  exclude: z.boolean().optional(),
});

export type PortfolioConfig = z.infer<typeof portfolioConfigSchema>;

export function validateConfig(data: unknown):
  | { success: true; data: PortfolioConfig }
  | { success: false; errors: string[] } {
  const result = portfolioConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    ),
  };
}

const CONFIG_FILENAME = ".portfolio.json";

export async function writePortfolioConfig(
  config: PortfolioConfig,
  dir: string
): Promise<void> {
  const filepath = join(dir, CONFIG_FILENAME);
  await writeFile(filepath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export async function readPortfolioConfig(
  dir: string
): Promise<PortfolioConfig> {
  const filepath = join(dir, CONFIG_FILENAME);
  const raw = await readFile(filepath, "utf-8");
  const data = JSON.parse(raw);
  const result = portfolioConfigSchema.parse(data);
  return result;
}
