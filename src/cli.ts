import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { detectTechStack } from "./detectors/tech-detector.js";
import { detectAssets } from "./detectors/asset-detector.js";
import { parseReadme } from "./detectors/readme-parser.js";
import { detectMetadata } from "./detectors/metadata-detector.js";
import {
  validateConfig,
  writePortfolioConfig,
  readPortfolioConfig,
  type PortfolioConfig,
} from "./schema.js";
import { generate, type OutputFormat } from "./generate.js";

const program = new Command();

program
  .name("portfolio-sync")
  .description("Auto-generate portfolio data from your repos")
  .version("0.1.0");

// --- init ---
program
  .command("init")
  .description("Generate .portfolio.json from detected project metadata")
  .option("-d, --dir <path>", "Target directory", ".")
  .action(async (opts: { dir: string }) => {
    const dir = resolve(opts.dir);

    // Check if .portfolio.json already exists
    try {
      await access(resolve(dir, ".portfolio.json"));
      console.log(
        chalk.yellow("A .portfolio.json already exists. Use `update` to refresh it.")
      );
      process.exit(1);
    } catch {
      // Good — doesn't exist yet
    }

    console.log(chalk.blue("\nScanning project...\n"));

    const [tech, assets, readme, meta] = await Promise.all([
      detectTechStack(dir),
      detectAssets(dir),
      parseReadme(dir),
      detectMetadata(dir),
    ]);

    const config: PortfolioConfig = {
      name: meta.name,
      shortDescription: readme.shortDescription || meta.shortDescription,
      description: readme.description || meta.description,
      category: tech.category,
      technologies: tech.technologies.length > 0 ? tech.technologies : undefined,
      status: meta.status,
      dateCompleted: meta.dateCompleted,
      models: assets.models.length > 0 ? assets.models : undefined,
      images: assets.images.length > 0 ? assets.images : undefined,
      thumbnail: assets.thumbnail,
      links: meta.links,
    };

    // Clean undefined fields
    const cleaned = JSON.parse(JSON.stringify(config)) as PortfolioConfig;

    console.log(chalk.bold("  Detected:"));
    console.log(chalk.gray(`    Name:         ${cleaned.name}`));
    console.log(chalk.gray(`    Category:     ${cleaned.category || "—"}`));
    console.log(chalk.gray(`    Technologies: ${cleaned.technologies?.join(", ") || "—"}`));
    console.log(chalk.gray(`    Status:       ${cleaned.status || "—"}`));
    console.log(chalk.gray(`    Models:       ${cleaned.models?.length || 0} found`));
    console.log(chalk.gray(`    Images:       ${cleaned.images?.length || 0} found`));
    console.log(chalk.gray(`    Description:  ${cleaned.shortDescription || "—"}`));
    console.log();

    await writePortfolioConfig(cleaned, dir);
    console.log(chalk.green("Created .portfolio.json"));
    console.log(
      chalk.gray("Edit it to add featured, media links, or fix any auto-detected values.\n")
    );
  });

// --- validate ---
program
  .command("validate")
  .description("Validate an existing .portfolio.json file")
  .option("-d, --dir <path>", "Directory with .portfolio.json", ".")
  .action(async (opts: { dir: string }) => {
    const dir = resolve(opts.dir);

    let raw: unknown;
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(resolve(dir, ".portfolio.json"), "utf-8");
      raw = JSON.parse(content);
    } catch (err) {
      console.log(chalk.red(`Could not read .portfolio.json: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }

    const result = validateConfig(raw);
    if (result.success) {
      console.log(chalk.green("\n.portfolio.json is valid!\n"));
    } else {
      console.log(chalk.red("\nValidation errors:\n"));
      for (const err of result.errors) {
        console.log(chalk.red(`  - ${err}`));
      }
      console.log();
      process.exit(1);
    }
  });

// --- update ---
program
  .command("update")
  .description("Re-detect and update auto fields without overwriting manual edits")
  .option("-d, --dir <path>", "Directory with .portfolio.json", ".")
  .action(async (opts: { dir: string }) => {
    const dir = resolve(opts.dir);

    let existing: PortfolioConfig;
    try {
      existing = await readPortfolioConfig(dir);
    } catch (err) {
      console.log(
        chalk.red(`Could not read .portfolio.json: ${err instanceof Error ? err.message : err}`)
      );
      console.log(chalk.gray("Run `portfolio-sync init` first.\n"));
      process.exit(1);
    }

    console.log(chalk.blue("\nRe-scanning project...\n"));

    const [tech, assets, readme, meta] = await Promise.all([
      detectTechStack(dir),
      detectAssets(dir),
      parseReadme(dir),
      detectMetadata(dir),
    ]);

    // Only update fields that weren't manually set (heuristic: update auto-detectable fields)
    const updated: PortfolioConfig = { ...existing };

    // Always refresh these if they were auto-detected
    if (!existing.technologies || existing.technologies.length === 0) {
      updated.technologies = tech.technologies.length > 0 ? tech.technologies : undefined;
    }
    if (!existing.category) updated.category = tech.category;
    if (!existing.shortDescription) {
      updated.shortDescription = readme.shortDescription || meta.shortDescription;
    }
    if (!existing.description) {
      updated.description = readme.description || meta.description;
    }

    // Refresh models/images (these are always auto-detected)
    updated.models = assets.models.length > 0 ? assets.models : undefined;
    updated.images = assets.images.length > 0 ? assets.images : undefined;
    if (!existing.thumbnail) updated.thumbnail = assets.thumbnail;

    const cleaned = JSON.parse(JSON.stringify(updated)) as PortfolioConfig;

    await writePortfolioConfig(cleaned, dir);
    console.log(chalk.green("Updated .portfolio.json\n"));
  });

// --- generate ---
program
  .command("generate")
  .description("Scan a GitHub user's repos and generate a combined portfolio.json")
  .requiredOption("-u, --user <username>", "GitHub username")
  .option("-o, --output <path>", "Output file path", "portfolio.json")
  .option("-f, --format <format>", "Output format: json, yaml, markdown", "json")
  .option("-t, --token <token>", "GitHub token (or set GITHUB_TOKEN env var)")
  .option("-e, --exclude <repos...>", "Repos to exclude")
  .option("--dry-run", "Preview output without writing file")
  .action(
    async (opts: {
      user: string;
      output: string;
      format: string;
      token?: string;
      exclude?: string[];
      dryRun?: boolean;
    }) => {
      const validFormats = ["json", "yaml", "markdown"];
      if (!validFormats.includes(opts.format)) {
        console.log(chalk.red(`Invalid format "${opts.format}". Use: json, yaml, markdown`));
        process.exit(1);
      }
      await generate({
        user: opts.user,
        output: resolve(opts.output),
        format: opts.format as OutputFormat,
        token: opts.token || process.env.GITHUB_TOKEN,
        exclude: opts.exclude,
        dryRun: opts.dryRun,
      });
    }
  );

program.parse();
