"use client";

import { useEffect, useState, useCallback } from "react";
import type { RepoInfo, PortfolioEntry, OutputFormat } from "@/lib/portfolio";
import styles from "./page.module.css";

interface User {
  login: string;
  name: string | null;
  avatar: string;
}

type AppState = "loading" | "unauthenticated" | "authenticated" | "scanning" | "done";

export default function Home() {
  const [state, setState] = useState<AppState>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });
  const [format, setFormat] = useState<OutputFormat>("json");
  const [preview, setPreview] = useState("");

  // Check auth on mount
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setUser(data.user);
          setState("authenticated");
        } else {
          setState("unauthenticated");
        }
      });
  }, []);

  const startScan = useCallback(async () => {
    setState("scanning");

    // Fetch repos
    const reposRes = await fetch("/api/repos");
    const { repos: repoList } = await reposRes.json();
    setRepos(repoList);
    setProgress({ current: 0, total: repoList.length, name: "" });

    // Process each repo
    const results: PortfolioEntry[] = [];
    for (let i = 0; i < repoList.length; i++) {
      const repo = repoList[i];
      setProgress({ current: i + 1, total: repoList.length, name: repo.name });
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repo }),
        });
        const { entry } = await res.json();
        if (entry) results.push(entry);
      } catch {
        // skip failed repos
      }
    }

    // Sort: featured first, then by date
    results.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.dateCompleted || "").localeCompare(a.dateCompleted || "");
    });

    setEntries(results);
    setState("done");
  }, []);

  const toggleEntry = useCallback((index: number) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], enabled: !next[index].enabled };
      return next;
    });
  }, []);

  const toggleFeatured = useCallback((index: number) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], featured: !next[index].featured };
      return next;
    });
  }, []);

  const download = useCallback(
    async (fmt: OutputFormat) => {
      const { formatEntries } = await import("@/lib/portfolio");
      const content = formatEntries(entries, fmt);
      const ext = fmt === "json" ? ".json" : fmt === "yaml" ? ".yaml" : ".md";
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [entries]
  );

  const showPreview = useCallback(
    async (fmt: OutputFormat) => {
      const { formatEntries } = await import("@/lib/portfolio");
      setFormat(fmt);
      setPreview(formatEntries(entries, fmt));
    },
    [entries]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setEntries([]);
    setState("unauthenticated");
  }, []);

  // Loading
  if (state === "loading") {
    return (
      <main className={styles.main}>
        <div className={styles.center}>
          <p className={styles.dim}>Loading...</p>
        </div>
      </main>
    );
  }

  // Unauthenticated
  if (state === "unauthenticated") {
    return (
      <main className={styles.main}>
        <div className={styles.center}>
          <h1 className={styles.title}>portfolio-sync</h1>
          <p className={styles.subtitle}>
            Generate portfolio data from your GitHub repos
          </p>
          <a href="/api/auth/login" className={styles.githubBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </a>
          <p className={styles.hint}>
            Or use the CLI:{" "}
            <code>npx portfolio-sync generate --user yourname</code>
          </p>
        </div>
      </main>
    );
  }

  // Authenticated but not scanned yet
  if (state === "authenticated") {
    return (
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.logo}>portfolio-sync</h1>
          <div className={styles.userInfo}>
            <img src={user?.avatar} alt="" className={styles.avatar} />
            <span>{user?.login}</span>
            <button onClick={logout} className={styles.logoutBtn}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.center}>
          <h2 className={styles.title}>Ready to scan</h2>
          <p className={styles.subtitle}>
            We'll scan all your repos and auto-detect project metadata.
          </p>
          <button onClick={startScan} className={styles.scanBtn}>
            Scan my repos
          </button>
        </div>
      </main>
    );
  }

  // Scanning
  if (state === "scanning") {
    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    return (
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.logo}>portfolio-sync</h1>
          <div className={styles.userInfo}>
            <img src={user?.avatar} alt="" className={styles.avatar} />
            <span>{user?.login}</span>
          </div>
        </header>
        <div className={styles.center}>
          <h2 className={styles.title}>Scanning repos...</h2>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.dim}>
            {progress.current}/{progress.total} — {progress.name}
          </p>
        </div>
      </main>
    );
  }

  // Done — show results
  const enabledCount = entries.filter((e) => e.enabled).length;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.logo}>portfolio-sync</h1>
        <div className={styles.userInfo}>
          <img src={user?.avatar} alt="" className={styles.avatar} />
          <span>{user?.login}</span>
          <button onClick={logout} className={styles.logoutBtn}>
            Sign out
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>{entries.length} projects</h2>
            <span className={styles.dim}>{enabledCount} enabled</span>
          </div>

          <div className={styles.projectList}>
            {entries.map((entry, i) => (
              <div
                key={entry.github}
                className={`${styles.projectCard} ${!entry.enabled ? styles.disabled : ""}`}
              >
                <div className={styles.projectTop}>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={() => toggleEntry(i)}
                    />
                    <span className={styles.projectName}>{entry.name}</span>
                  </label>
                  <button
                    onClick={() => toggleFeatured(i)}
                    className={`${styles.starBtn} ${entry.featured ? styles.starred : ""}`}
                    title="Toggle featured"
                  >
                    *
                  </button>
                </div>
                <div className={styles.projectMeta}>
                  <span className={styles.category}>{entry.category}</span>
                  {entry.technologies?.slice(0, 3).map((t) => (
                    <span key={t} className={styles.tech}>
                      {t}
                    </span>
                  ))}
                </div>
                {entry.shortDescription && (
                  <p className={styles.projectDesc}>{entry.shortDescription}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.formatBar}>
            <div className={styles.formatTabs}>
              {(["json", "yaml", "markdown"] as OutputFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => showPreview(fmt)}
                  className={`${styles.formatTab} ${format === fmt && preview ? styles.activeTab : ""}`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
            <div className={styles.downloadBtns}>
              <button onClick={() => download("json")} className={styles.dlBtn}>
                JSON
              </button>
              <button onClick={() => download("yaml")} className={styles.dlBtn}>
                YAML
              </button>
              <button onClick={() => download("markdown")} className={styles.dlBtn}>
                MD
              </button>
            </div>
          </div>

          <div className={styles.previewArea}>
            {preview ? (
              <pre className={styles.code}>{preview}</pre>
            ) : (
              <div className={styles.previewEmpty}>
                <p className={styles.dim}>
                  Click a format above to preview output
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
