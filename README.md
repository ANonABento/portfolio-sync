# portfolio-sync

Generate portfolio data from your GitHub repos. One command, all your projects.

## Quick Start

```bash
npx portfolio-sync generate --user your-github-username
```

That's it. You get a `portfolio.json` with all your projects — tech stacks, descriptions, categories, and assets auto-detected.

## Commands

### `generate` — Build portfolio from GitHub

Scans all public repos for a GitHub user and outputs structured portfolio data.

```bash
# JSON (default)
portfolio-sync generate --user ANonABento

# YAML
portfolio-sync generate --user ANonABento --format yaml

# Markdown (best for AI consumption)
portfolio-sync generate --user ANonABento --format markdown

# Preview without writing
portfolio-sync generate --user ANonABento --dry-run

# With auth (higher rate limits, access private repos)
portfolio-sync generate --user ANonABento --token ghp_xxxxx

# Exclude repos
portfolio-sync generate --user ANonABento --exclude dotfiles portfolio-sync
```

### `init` — Generate per-repo config

Run inside any project to create a `.portfolio.json` with auto-detected metadata.

```bash
cd my-cool-project
npx portfolio-sync init
```

This is **optional** — `generate` works without it. Use `init` when you want to:
- Mark a project as featured
- Add video/demo links
- Override the auto-detected category or description

### `validate` — Check config

```bash
npx portfolio-sync validate
```

### `update` — Refresh auto-detected fields

Re-scans the repo and updates auto-detected fields without overwriting your manual edits.

```bash
npx portfolio-sync update
```

## What Gets Detected

| Data | Source |
|------|--------|
| **Name** | Repo name, cleaned up (`my-robot-arm` → `My Robot Arm`) |
| **Description** | README first paragraph, or GitHub repo description |
| **Technologies** | `package.json`, `Cargo.toml`, `requirements.txt`, `go.mod`, file extensions |
| **Category** | Inferred from tech stack + GitHub topics |
| **Status** | `Completed`, `In Progress`, or `Archived` (from commit history) |
| **3D Models** | `.stl`, `.gltf`, `.glb`, `.obj`, `.fbx`, `.3mf` files |
| **Images** | `.png`, `.jpg`, `.gif` in `docs/`, `assets/`, `images/` directories |
| **Links** | `package.json` homepage, GitHub homepage field |

## Output Formats

**JSON** — For your site to consume programmatically
```json
{
  "projects": [
    {
      "name": "My Robot Arm",
      "category": "Robotics",
      "technologies": ["Python", "ROS2"],
      "github": "https://github.com/user/my-robot-arm"
    }
  ]
}
```

**YAML** — Compact and readable
```yaml
projects:
  - name: "My Robot Arm"
    category: Robotics
    technologies: [Python, ROS2]
    github: https://github.com/user/my-robot-arm
```

**Markdown** — Best for AI chatbot context
```markdown
## Robotics

### My Robot Arm
6-DOF robot arm with inverse kinematics
- **Tech:** Python, ROS2
- **Status:** Completed
- **GitHub:** https://github.com/user/my-robot-arm
```

## `.portfolio.json` Schema

Drop this in any repo to customize how it appears in your portfolio:

```json
{
  "name": "My Project",
  "category": "Robotics",
  "shortDescription": "One-liner about the project",
  "featured": true,
  "status": "Completed",
  "media": {
    "video": "https://youtube.com/watch?v=...",
    "website": "https://my-project.vercel.app"
  }
}
```

Only `name` is required. Everything else is optional and auto-detected if missing.

## License

MIT
