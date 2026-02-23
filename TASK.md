# Portfolio Sync

Automatically pull project data from GitHub repos into a portfolio site — no manual JSON editing.

## The Problem

Portfolio project data (names, descriptions, tech stacks, 3D models, images) is manually maintained in `portfolio.json`. Every new project or update requires editing this file by hand.

## The Solution

Two pieces that work together:

### 1. Per-Repo Config: `.portfolio.json`

A small JSON file you drop into any repo you want on your portfolio. It describes the project for portfolio purposes.

```json
{
  "name": "My Robot Arm",
  "category": "Robotics",
  "shortDescription": "6-DOF robot arm with inverse kinematics",
  "description": "Longer description pulled from README or written manually",
  "featured": true,
  "status": "Completed",
  "dateCompleted": "2025-08",
  "models": [
    "cad/arm-assembly.stl"
  ],
  "images": [
    "docs/demo.png",
    "docs/side-view.jpg"
  ],
  "media": {
    "video": "https://youtube.com/watch?v=...",
    "website": "https://my-project.vercel.app",
    "pdf": "docs/report.pdf",
    "game": {
      "type": "itch",
      "url": "https://itch.io/my-game"
    }
  },
  "links": {
    "liveDemo": "https://my-project.vercel.app",
    "docs": "https://docs.my-project.com"
  }
}
```

**All fields are optional except `name`.** The generator CLI fills in as much as possible automatically.

### 2. Generator CLI: `portfolio-sync`

A CLI tool you run inside any repo to auto-generate the `.portfolio.json` file.

```bash
npx portfolio-sync init
```

#### What it auto-detects

| Data | How |
|------|-----|
| **Name** | Repo name (cleaned up: `my-robot-arm` → `My Robot Arm`) |
| **Description** | GitHub repo description, or first paragraph of README |
| **Technologies** | Scans for `package.json` (JS/TS deps), `Cargo.toml` (Rust), `requirements.txt` (Python), `go.mod` (Go), file extensions, GitHub language stats |
| **Category** | Inferred from topics/tags or tech stack (e.g., `react` + `three.js` → `Web 3D`) |
| **Status** | GitHub archive status, last commit date, presence of releases |
| **3D Models** | Finds `.stl`, `.gltf`, `.glb`, `.obj` files anywhere in the repo |
| **Images** | Finds `.png`, `.jpg`, `.gif` in `docs/`, `assets/`, `images/`, `screenshots/` folders |
| **Links** | GitHub homepage field, `package.json` homepage |
| **Date** | Last release date, or latest meaningful commit |

#### What you manually add (optional)

- `featured: true` to highlight on the portfolio
- Custom `shortDescription` if the auto-generated one isn't great
- `media.video`, `media.game` links
- Override `category` if the auto-detection got it wrong

### 3. Sync Script (lives in the portfolio site repo)

A script in the portfolio site (e.g., `mumbai-v2`) that aggregates all your repos:

```bash
npm run sync-repos
```

#### What it does

1. **Fetch repos** — Calls GitHub API to list all repos for the configured user
2. **Filter** — Only processes repos that have a `.portfolio.json` file
3. **Read configs** — Fetches each repo's `.portfolio.json` via GitHub API
4. **Download assets** — Downloads referenced 3D models and images to `public/models/` and `public/images/projects/`
5. **Build portfolio.json** — Merges all repo configs into the portfolio site's `src/content/portfolio.json`
6. **Preserve manual entries** — Any projects in `portfolio.json` without a matching repo are kept (for non-GitHub projects)

#### Config (in the portfolio site)

```json
// sync.config.json
{
  "github_user": "ANonABento",
  "output": "src/content/portfolio.json",
  "assets_dir": "public",
  "include_private": false,
  "exclude_repos": ["dotfiles", "portfolio-sync"],
  "auto_download_models": true,
  "auto_download_images": true,
  "max_model_size_mb": 50
}
```

---

## Data Flow

```
Repo: robot-arm/                    Repo: my-game/
├── src/...                         ├── Assets/...
├── cad/arm.stl                     ├── builds/webgl/
└── .portfolio.json                 └── .portfolio.json

        ↓ GitHub API                        ↓ GitHub API

                    Sync Script
                    (npm run sync-repos)
                        │
                        ├── Downloads arm.stl → public/models/robot-arm/arm.stl
                        ├── Downloads images → public/images/projects/robot-arm/
                        │
                        ↓
            src/content/portfolio.json  (auto-generated)
                        │
                        ├── projects-data.ts (typed access)
                        ├── portfolio-context.ts (AI chatbot context)
                        └── UI components (ProjectsModal, Viewfinder, etc.)
```

---

## Build Tasks

### Phase 1: Generator CLI (`portfolio-sync`)

This repo. A Node.js CLI tool.

- [ ] **Project setup** — TypeScript, `tsup` for bundling, `bin` entry in package.json
- [ ] **Tech detection** — Scan for package managers, config files, file extensions
- [ ] **Model/image discovery** — Find 3D models and images in the repo
- [ ] **README parsing** — Extract first paragraph or summary section
- [ ] **GitHub metadata** — Fetch repo description, topics, language stats (optional, works offline too)
- [ ] **Schema validation** — Validate generated `.portfolio.json` against the schema
- [ ] **`init` command** — Generates `.portfolio.json` interactively (shows detected values, lets you confirm/edit)
- [ ] **`validate` command** — Checks an existing `.portfolio.json` for errors
- [ ] **`update` command** — Re-scans and updates auto-detected fields without overwriting manual edits

### Phase 2: Sync Script (in portfolio site repo)

Lives in `mumbai-v2` (or wherever the portfolio site is).

- [ ] **Script setup** — `scripts/sync-repos.ts`, callable via `npm run sync-repos`
- [ ] **GitHub API integration** — List repos, check for `.portfolio.json`, fetch contents
- [ ] **Asset downloading** — Download STL/GLTF/images to `public/` with proper paths
- [ ] **Portfolio.json generation** — Merge all repo configs into the portfolio schema
- [ ] **Manual entry preservation** — Don't overwrite projects that aren't linked to a repo
- [ ] **Dry run mode** — `npm run sync-repos -- --dry-run` to preview changes
- [ ] **Cache** — Don't re-download unchanged assets (use ETags or commit SHAs)

### Phase 3: Automation (optional)

- [ ] **GitHub Action** — Run sync on push to any repo with `.portfolio.json`
- [ ] **Webhook** — Portfolio site rebuilds when a repo's `.portfolio.json` changes
- [ ] **Vercel build hook** — Trigger redeploy after sync

---

## Schema Reference

### `.portfolio.json` (per-repo)

```typescript
interface PortfolioConfig {
  // Required
  name: string;

  // Auto-detected (overridable)
  shortDescription?: string;
  description?: string;
  category?: string;
  technologies?: string[];
  status?: "Completed" | "In Progress" | "Archived";
  dateCompleted?: string; // YYYY-MM

  // Asset paths (relative to repo root)
  models?: string[];     // e.g., ["cad/model.stl"]
  images?: string[];     // e.g., ["docs/photo.png"]
  thumbnail?: string;    // e.g., "docs/thumb.png"

  // External links
  media?: {
    video?: string;
    website?: string;
    pdf?: string;
    game?: { type: "unity-webgl" | "itch"; url: string };
  };
  links?: {
    liveDemo?: string;
    docs?: string;
  };

  // Portfolio display
  featured?: boolean;

  // Sync control
  exclude?: boolean;     // Set true to skip this repo during sync
}
```

### Synced `portfolio.json` output (matches existing schema)

The sync script outputs data matching the existing `portfolio.json` structure in the portfolio site so nothing else needs to change. The `github` link is auto-populated from the repo URL. Model and image paths are rewritten to their downloaded locations in `public/`.

---

## Tech Stack (for this tool)

| Technology | Purpose |
|------------|---------|
| TypeScript | Type safety |
| Node.js | Runtime |
| Commander.js | CLI framework |
| Octokit | GitHub API client |
| tsup | Bundling |
| Zod | Schema validation |
