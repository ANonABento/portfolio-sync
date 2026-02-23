import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface ReadmeResult {
  description?: string;
  shortDescription?: string;
}

const README_NAMES = ["README.md", "README", "README.rst", "readme.md", "Readme.md"];

async function findReadme(dir: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  for (const name of README_NAMES) {
    if (entries.includes(name)) return join(dir, name);
  }

  // Case-insensitive fallback
  const lower = entries.find((e) => e.toLowerCase() === "readme.md" || e.toLowerCase() === "readme");
  return lower ? join(dir, lower) : null;
}

function isBadge(line: string): boolean {
  return line.startsWith("[![") || line.startsWith("![") && line.includes("badge");
}

function isHeading(line: string): boolean {
  return line.startsWith("#");
}

function isHtml(line: string): boolean {
  return line.startsWith("<") && !line.startsWith("<a");
}

function isSkippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || isBadge(trimmed) || isHeading(trimmed) || isHtml(trimmed);
}

function extractSection(content: string, headings: string[]): string | null {
  const lines = content.split("\n");
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      const headingText = line.replace(/^#+\s*/, "").trim().toLowerCase();
      if (headings.includes(headingText)) {
        capturing = true;
        continue;
      } else if (capturing) {
        break; // hit next heading
      }
    }
    if (capturing && line.trim()) {
      captured.push(line.trim());
    }
  }

  return captured.length > 0 ? captured.join(" ") : null;
}

function extractFirstParagraph(content: string): string | null {
  const lines = content.split("\n");
  const paragraph: string[] = [];
  let pastTitle = false;

  for (const line of lines) {
    if (!pastTitle) {
      if (isHeading(line)) {
        pastTitle = true;
        continue;
      }
      if (isSkippable(line)) continue;
      pastTitle = true;
    }

    if (isSkippable(line)) {
      if (paragraph.length > 0) break;
      continue;
    }

    paragraph.push(line.trim());
  }

  return paragraph.length > 0 ? paragraph.join(" ") : null;
}

function firstSentence(text: string, maxLen = 120): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  const sentence = match ? match[0].trim() : text;
  return sentence.length > maxLen ? sentence.slice(0, maxLen - 3) + "..." : sentence;
}

export async function parseReadme(dir: string): Promise<ReadmeResult> {
  const readmePath = await findReadme(dir);
  if (!readmePath) return {};

  let content;
  try {
    content = await readFile(readmePath, "utf-8");
  } catch {
    return {};
  }

  // Try specific sections first
  const description =
    extractSection(content, ["description", "about", "overview"]) ||
    extractFirstParagraph(content);

  if (!description) return {};

  return {
    description,
    shortDescription: firstSentence(description),
  };
}
