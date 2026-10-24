"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./[themeId]/page.module.css";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";

type ThemeOption = {
  theme_id: string;
  title: string;
  heat_score: number;
};

export default function TimelineIndexPage() {
  const [themes, setThemes] = useState<ThemeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/themes`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load themes.");
        const data = (await res.json()) as ThemeOption[];
        setThemes(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load themes.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.backLink}>
            ← Dashboard
          </Link>
          <p className={styles.brand}>DMACRO</p>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.themeCard}>
          <h1 className={styles.sectionTitle}>Theme Tracker — Select a Theme</h1>

          {loading ? (
            <p className={styles.status}>Loading themes…</p>
          ) : error ? (
            <p className={styles.errorText}>{error}</p>
          ) : themes.length === 0 ? (
            <p className={styles.emptyState}>Loading...</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {themes.map((theme) => (
                <Link
                  key={theme.theme_id}
                  href={`/timeline/${theme.theme_id}`}
                  className={styles.metaTag}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.75rem",
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "background 150ms ease",
                  }}
                >
                  <span>{theme.title}</span>
                  <span style={{ opacity: 0.7, fontSize: "0.75rem" }}>
                    Heat: {theme.heat_score.toFixed(0)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
