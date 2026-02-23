import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";

export interface TechResult {
  technologies: string[];
  category: string;
  languages: string[];
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".next", ".cache", "vendor", ".venv", "venv",
]);

const PACKAGE_MAP: Record<string, string> = {
  react: "React", "react-dom": "React", next: "Next.js",
  vue: "Vue", nuxt: "Nuxt", angular: "Angular",
  svelte: "Svelte", three: "Three.js",
  "@react-three/fiber": "React Three Fiber",
  "@react-three/drei": "React Three Fiber",
  express: "Express", fastify: "Fastify", koa: "Koa",
  tailwindcss: "Tailwind CSS", "@prisma/client": "Prisma",
  prisma: "Prisma", mongoose: "MongoDB", "socket.io": "Socket.io",
  electron: "Electron", "react-native": "React Native",
  tensorflow: "TensorFlow", pytorch: "PyTorch",
  vite: "Vite", webpack: "Webpack", esbuild: "esbuild",
  typescript: "TypeScript", zod: "Zod",
};

const PYTHON_PACKAGE_MAP: Record<string, string> = {
  tensorflow: "TensorFlow", torch: "PyTorch", pytorch: "PyTorch",
  flask: "Flask", django: "Django", fastapi: "FastAPI",
  "scikit-learn": "scikit-learn", pandas: "Pandas",
  numpy: "NumPy", opencv: "OpenCV", keras: "Keras",
};

const EXT_LANGUAGE: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
  ".jsx": "JavaScript", ".py": "Python", ".rs": "Rust",
  ".go": "Go", ".cs": "C#", ".cpp": "C++", ".c": "C",
  ".java": "Java", ".kt": "Kotlin", ".swift": "Swift",
  ".rb": "Ruby", ".php": "PHP", ".lua": "Lua",
  ".ino": "Arduino", ".dart": "Dart",
};

async function scanExtensions(
  dir: string,
  counts: Map<string, number>
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanExtensions(fullPath, counts);
    } else {
      const ext = extname(entry.name).toLowerCase();
      if (EXT_LANGUAGE[ext]) {
        counts.set(ext, (counts.get(ext) || 0) + 1);
      }
    }
  }
}

async function readJsonSafe(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTextSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function detectTechStack(dir: string): Promise<TechResult> {
  const technologies: Set<string> = new Set();
  const languages: Set<string> = new Set();

  // package.json
  const pkg = await readJsonSafe(join(dir, "package.json"));
  if (pkg) {
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };
    for (const dep of Object.keys(deps)) {
      if (PACKAGE_MAP[dep]) technologies.add(PACKAGE_MAP[dep]);
    }
    languages.add("JavaScript");
  }

  // Cargo.toml
  const cargo = await readTextSafe(join(dir, "Cargo.toml"));
  if (cargo) {
    languages.add("Rust");
    if (cargo.includes("bevy")) technologies.add("Bevy");
    if (cargo.includes("tokio")) technologies.add("Tokio");
    if (cargo.includes("actix")) technologies.add("Actix");
    if (cargo.includes("wasm")) technologies.add("WebAssembly");
  }

  // requirements.txt
  const requirements = await readTextSafe(join(dir, "requirements.txt"));
  if (requirements) {
    languages.add("Python");
    for (const line of requirements.split("\n")) {
      const pkg = line.split("==")[0].split(">=")[0].trim().toLowerCase();
      if (PYTHON_PACKAGE_MAP[pkg]) technologies.add(PYTHON_PACKAGE_MAP[pkg]);
    }
  }

  // pyproject.toml
  const pyproject = await readTextSafe(join(dir, "pyproject.toml"));
  if (pyproject) {
    languages.add("Python");
    for (const [key, name] of Object.entries(PYTHON_PACKAGE_MAP)) {
      if (pyproject.includes(key)) technologies.add(name);
    }
  }

  // go.mod
  if (await readTextSafe(join(dir, "go.mod"))) {
    languages.add("Go");
  }

  // File extension scan
  const extCounts = new Map<string, number>();
  await scanExtensions(dir, extCounts);
  for (const [ext, count] of extCounts) {
    if (count > 0 && EXT_LANGUAGE[ext]) {
      languages.add(EXT_LANGUAGE[ext]);
    }
  }
  // TypeScript supersedes JavaScript
  if (languages.has("TypeScript") && languages.has("JavaScript")) {
    languages.delete("JavaScript");
  }

  const category = inferCategory(technologies, languages);

  return {
    technologies: [...technologies],
    category,
    languages: [...languages],
  };
}

function inferCategory(
  tech: Set<string>,
  langs: Set<string>
): string {
  const has = (name: string) => tech.has(name);

  // 3D / WebGL
  if (has("Three.js") || has("React Three Fiber")) return "Web 3D";

  // Game engines
  if (langs.has("C#")) return "Game Development";
  if (has("Bevy")) return "Game Development";

  // ML
  if (has("TensorFlow") || has("PyTorch") || has("scikit-learn") || has("Keras"))
    return "Machine Learning";

  // Embedded
  if (langs.has("Arduino")) return "Robotics";

  // Mobile
  if (has("React Native")) return "Mobile App";
  if (langs.has("Swift") || langs.has("Kotlin") || langs.has("Dart"))
    return "Mobile App";

  // Desktop
  if (has("Electron")) return "Desktop App";

  // Frontend frameworks
  if (has("React") || has("Vue") || has("Angular") || has("Svelte") || has("Next.js") || has("Nuxt"))
    return "Web App";

  // Backend only
  if (has("Express") || has("Fastify") || has("Koa") || has("Flask") || has("Django") || has("FastAPI"))
    return "Backend/API";

  // Language-based fallbacks
  if (langs.has("Rust")) return "Systems Programming";
  if (langs.has("Go")) return "Backend/API";
  if (langs.has("Python")) return "Python";
  if (langs.has("C++") || langs.has("C")) return "Systems Programming";

  return "Software";
}
