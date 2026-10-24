"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";

type EventMeta = {
  event_id: string;
  source: string;
  published_at: string | null;
  content: string;
  sentiment: string | null;
  importance_score: number;
  region: string | null;
  asset_classes: string[];
  topic: string | null;
};

type ArticlePayload = {
  title?: string;
  full_text?: string;
  text?: string;
  raw_text?: string;
  raw?: string;
  url?: string;
  source?: string;
  published_at?: string;
  author?: string;
  [key: string]: unknown;
};

type ArticleResponse = {
  event: EventMeta;
  article: ArticlePayload;
};

type ErrorResponse = {
  error: string;
  error_code?: string;
  event?: EventMeta;
};

function formatDate(raw: string | null) {
  if (!raw) return "N/A";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function importanceToImpact(score: number): "High" | "Medium" | "Low" {
  if (score >= 0.7) return "High";
  if (score >= 0.4) return "Medium";
  return "Low";
}

function sentimentClass(sentiment: string | null) {
  if (sentiment === "risk-on") return styles.sentimentRiskOn;
  if (sentiment === "risk-off") return styles.sentimentRiskOff;
  return styles.sentimentNeutral;
}

function impactClass(impact: "High" | "Medium" | "Low") {
  if (impact === "High") return styles.impactHigh;
  if (impact === "Medium") return styles.impactMedium;
  return styles.impactLow;
}

export default function ArticleViewerPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [data, setData] = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    type: "not_found" | "no_raw_payload" | "generic";
    message: string;
    event?: EventMeta;
  } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();

    async function loadArticle() {
      setLoading(true);
      setErrorState(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/events/${encodeURIComponent(eventId)}/article`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorResponse;

          if (res.status === 404 && body.error_code === "no_raw_payload") {
            setErrorState({
              type: "no_raw_payload",
              message: body.error || "Article content unavailable.",
              event: body.event,
            });
          } else if (res.status === 404) {
            setErrorState({
              type: "not_found",
              message: "Event not found.",
            });
          } else {
            setErrorState({
              type: "generic",
              message: body.error || "Failed to load article.",
            });
          }
          return;
        }

        const json = (await res.json()) as ArticleResponse;
        setData(json);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorState({
          type: "generic",
          message: err instanceof Error ? err.message : "Unable to load article.",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadArticle();
    return () => controller.abort();
  }, [eventId]);

  // Extract the best article text from raw payload
  function getArticleText(article: ArticlePayload): string {
    return (
      article.full_text ||
      article.text ||
      article.raw_text ||
      article.raw ||
      ""
    );
  }

  function getArticleTitle(article: ArticlePayload, event: EventMeta): string {
    return (
      article.title ||
      (event.content ? event.content.slice(0, 120) : "Untitled Article")
    );
  }

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
        {loading ? (
          <p className={styles.status}>Loading article…</p>
        ) : errorState ? (
          /* ── Error states ─────────────────────────────────── */
          <section className={styles.errorPage}>
            <div className={styles.errorIcon}>
              {errorState.type === "no_raw_payload" ? "📄" : "⚠️"}
            </div>
            <h1 className={styles.errorTitle}>
              {errorState.type === "no_raw_payload"
                ? "Article Content Unavailable"
                : errorState.type === "not_found"
                ? "Event Not Found"
                : "Something Went Wrong"}
            </h1>
            <p className={styles.errorText}>
              {errorState.type === "no_raw_payload"
                ? "The raw article content for this event has not been stored. Only the enriched summary is available below."
                : errorState.message}
            </p>

            {/* Show enriched content fallback for no_raw_payload */}
            {errorState.type === "no_raw_payload" && errorState.event ? (
              <div className={styles.enrichedSection} style={{ textAlign: "left" }}>
                <p className={styles.enrichedLabel}>Enriched Summary</p>
                <p className={styles.enrichedText}>
                  {errorState.event.content || "No enriched content available."}
                </p>
                <div className={styles.articleMeta} style={{ marginTop: "0.75rem" }}>
                  <span className={styles.metaTag}>
                    Source: {errorState.event.source}
                  </span>
                  {errorState.event.published_at ? (
                    <span className={styles.metaTag}>
                      {formatDate(errorState.event.published_at)}
                    </span>
                  ) : null}
                  {errorState.event.topic ? (
                    <span className={styles.metaTag}>
                      Topic: {errorState.event.topic}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Link href="/" className={styles.errorBackLink} style={{ marginTop: "1rem" }}>
              ← Back to Dashboard
            </Link>
          </section>
        ) : data ? (
          /* ── Article view ─────────────────────────────────── */
          <section className={styles.articleCard}>
            <div className={styles.articleHeader}>
              <h1 className={styles.articleTitle}>
                {getArticleTitle(data.article, data.event)}
              </h1>
              <div className={styles.articleMeta}>
                <span className={styles.metaTag}>
                  Source: {data.article.source || data.event.source}
                </span>
                <span className={styles.metaTag}>
                  {formatDate(
                    data.article.published_at || data.event.published_at
                  )}
                </span>
                {data.article.author ? (
                  <span className={styles.metaTag}>
                    By: {data.article.author}
                  </span>
                ) : null}
                {data.event.sentiment ? (
                  <span
                    className={`${styles.sentimentTag} ${sentimentClass(data.event.sentiment)}`}
                  >
                    {data.event.sentiment}
                  </span>
                ) : null}
                {data.event.importance_score > 0 ? (
                  <span
                    className={`${styles.impactTag} ${impactClass(
                      importanceToImpact(data.event.importance_score)
                    )}`}
                  >
                    {importanceToImpact(data.event.importance_score)} Impact
                  </span>
                ) : null}
                {data.event.region ? (
                  <span className={styles.metaTag}>
                    Region: {data.event.region}
                  </span>
                ) : null}
                {data.event.asset_classes.length > 0 ? (
                  <span className={styles.metaTag}>
                    {data.event.asset_classes.join(", ")}
                  </span>
                ) : null}
                {data.event.topic ? (
                  <span className={styles.metaTag}>
                    Topic: {data.event.topic}
                  </span>
                ) : null}
              </div>
            </div>

            <div className={styles.articleBody}>
              {getArticleText(data.article) ? (
                <>
                  <h2 className={styles.articleSectionTitle}>Full Article</h2>
                  <div className={styles.articleContent}>
                    {getArticleText(data.article)}
                  </div>
                </>
              ) : (
                <>
                  <h2 className={styles.articleSectionTitle}>Enriched Summary</h2>
                  <div className={styles.articleContent}>
                    {data.event.content || "No content available."}
                  </div>
                </>
              )}

              {data.article.url ? (
                <div style={{ marginTop: "1rem" }}>
                  <h2 className={styles.articleSectionTitle}>Original Source</h2>
                  <a
                    href={data.article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.articleUrl}
                  >
                    {data.article.url}
                  </a>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
