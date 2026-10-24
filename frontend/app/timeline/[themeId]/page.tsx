"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import styles from "./page.module.css";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";

type ThemeData = {
  theme_id: string;
  title: string;
  description: string | null;
  heat_score: number;
  status: string;
  region: string | null;
  asset_classes: string[];
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type TimelineEvent = {
  event_id: string;
  date: string;
  title: string;
  text: string;
  source: string;
  impact: "High" | "Medium" | "Low";
  sentiment: string | null;
  region: string | null;
  asset_classes: string[];
};

type TimelineResponse = {
  theme: ThemeData;
  events: TimelineEvent[];
};

type ThemeOption = {
  theme_id: string;
  title: string;
  heat_score: number;
};

type ChainStep = {
  order: number;
  implication: string;
  asset_class: string;
  direction: "bullish" | "bearish" | "neutral";
};

type ImplicationChain = {
  trigger: string;
  steps: ChainStep[];
};

function impactToneClass(impact: TimelineEvent["impact"]) {
  if (impact === "High") return styles.impactHigh;
  if (impact === "Medium") return styles.impactMedium;
  return styles.impactLow;
}

function sentimentToneClass(sentiment: string | null) {
  if (sentiment === "risk-on") return styles.sentimentRiskOn;
  if (sentiment === "risk-off") return styles.sentimentRiskOff;
  return styles.sentimentNeutral;
}

function heatBadgeStyle(score: number): CSSProperties {
  const clamped = Math.max(0, Math.min(100, score));
  const hue = (1 - clamped / 100) * 120;
  return {
    backgroundColor: `hsl(${hue}, 100%, 30%)`,
    borderColor: `hsl(${hue}, 100%, 40%)`,
  };
}

function formatDate(raw: string | null) {
  if (!raw) return "N/A";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function truncateString(str: string, maxLength: number) {
  if (str.length > maxLength) {
    // If the string is too long, cut it and add "..."
    return str.slice(0, maxLength - 3) + '...'; 
  } else {
    // Otherwise, return the original string
    return str;
  }
}

export default function TimelinePage() {
  const params = useParams();
  const router = useRouter();
  const themeId = params.themeId as string;

  const [themeData, setThemeData] = useState<ThemeData | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisGeneratedAt, setAnalysisGeneratedAt] = useState<string | null>(null);
  const [analysisCached, setAnalysisCached] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [chains, setChains] = useState<ImplicationChain[]>([]);
  const [chainsGeneratedAt, setChainsGeneratedAt] = useState<string | null>(null);
  const [chainsCached, setChainsCached] = useState(false);
  const [chainsLoading, setChainsLoading] = useState(true);
  const [chainsError, setChainsError] = useState<string | null>(null);

  const [themeOptions, setThemeOptions] = useState<ThemeOption[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesLoadedOnce, setThemesLoadedOnce] = useState(false);

  // Fetch list of all themes for the dropdown
  useEffect(() => {
    const controller = new AbortController();

    async function loadThemes() {
      setThemesLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/themes`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load themes.");
        const data = (await res.json()) as ThemeOption[];
        setThemeOptions(data);
        setThemesLoadedOnce(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Don't clear themeOptions on error — keep whatever we had
      } finally {
        setThemesLoading(false);
      }
    }

    void loadThemes();
    return () => controller.abort();
  }, []);

  // Fetch timeline for the selected theme
  useEffect(() => {
    if (!themeId) return;
    const controller = new AbortController();

    async function loadTimeline() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/themes/${encodeURIComponent(themeId)}/timeline`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          if (res.status === 404) throw new Error("Theme not found.");
          throw new Error("Failed to load theme data.");
        }

        const data = (await res.json()) as TimelineResponse;
        setThemeData(data.theme);
        setEvents(data.events);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Unable to load theme data."
        );
        setThemeData(null);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    void loadTimeline();
    return () => controller.abort();
  }, [themeId]);

  // Reset analysis state when theme changes
  useEffect(() => {
    setAnalysis(null);
    setAnalysisGeneratedAt(null);
    setAnalysisCached(false);
    setAnalysisLoading(true);
    setAnalysisError(null);
    setChainsLoading(true);
    setChains([]);
    setChainsGeneratedAt(null);
    setChainsCached(false);
    setChainsError(null);
  }, [themeId]);

  // Fetch LLM analysis (parallel with timeline)
  useEffect(() => {
    if (!themeId) return;
    const controller = new AbortController();

    async function loadAnalysis() {
      setAnalysisLoading(true);
      setAnalysisError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/themes/${encodeURIComponent(themeId)}/analysis`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error("Hit rate limit.");
        }
        const data = await res.json();
        setAnalysis(data.analysis ?? null);
        setAnalysisGeneratedAt(data.generated_at ?? null);
        setAnalysisCached(data.cached ?? false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAnalysisError(
          err instanceof Error ? err.message : "Unable to load analysis."
        );
      } finally {
        setAnalysisLoading(false);
      }
    }

    void loadAnalysis();
    return () => controller.abort();
  }, [themeId]);

  // Fetch implication chains (parallel)
  useEffect(() => {
    if (!themeId) return;
    const controller = new AbortController();

    async function loadChains() {
      setChainsLoading(true);
      setChainsError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/themes/${encodeURIComponent(themeId)}/chains`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          throw new Error("Failed to load chains.");
        }
        const data = await res.json();
        setChains(data.chains ?? []);
        setChainsGeneratedAt(data.generated_at ?? null);
        setChainsCached(data.cached ?? false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setChainsError(
          err instanceof Error ? err.message : "Unable to load chains."
        );
      } finally {
        setChainsLoading(false);
      }
    }

    void loadChains();
    return () => controller.abort();
  }, [themeId]);

  const handleThemeChange = (nextThemeId: string) => {
    if (nextThemeId && nextThemeId !== themeId) {
      router.push(`/timeline/${nextThemeId}`);
    }
  };

  function formatAnalysisTimestamp(raw: string | null) {
    if (!raw) return "";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
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
        {/* Theme selector */}
        <div className={styles.selectorRow}>
          <label className={styles.selectorField}>
            <span className={styles.selectorLabel}>Theme</span>
            <select
              className={styles.selectorSelect}
              value={themeId}
              onChange={(e) => handleThemeChange(e.target.value)}
              disabled={themesLoading}
            >
              {themeOptions.length > 0 ? (
                themeOptions.map((opt) => (
                  <option key={opt.theme_id} value={opt.theme_id}>
                    {opt.title} (Heat: {opt.heat_score.toFixed(0)})
                  </option>
                ))
              ) : themesLoadedOnce ? (
                <option value={themeId}>No themes available</option>
              ) : (
                <option value={themeId}>Loading themes…</option>
              )}
            </select>
          </label>
        </div>

        {/* Loading / error states */}
        {loading ? (
          <p className={styles.status}>Loading theme data...</p>
        ) : error ? (
          <p className={styles.errorText}>{error}</p>
        ) : themeData ? (
          <>
            {/* Theme header card */}
            <section className={styles.themeCard}>
              <div className={styles.themeHeader}>
                <div>
                  <h1 className={styles.themeTitle}>{themeData.title}</h1>
                  {themeData.description ? (
                    <p className={styles.themeDescription}>
                      {themeData.description}
                    </p>
                  ) : null}
                </div>
                <div
                  className={styles.heatBadge}
                  style={heatBadgeStyle(themeData.heat_score)}
                >
                  <span className={styles.heatBadgeLabel}>Heat</span>
                  <span className={styles.heatBadgeValue}>
                    {(themeData.heat_score).toFixed(0)}
                  </span>
                </div>
              </div>

              <div className={styles.themeMeta}>
                <span className={styles.metaTag}>
                  Status: {themeData.status}
                </span>
                {themeData.region ? (
                  <span className={styles.metaTag}>
                    Region: {themeData.region}
                  </span>
                ) : null}
                {themeData.asset_classes.length > 0 ? (
                  <span className={styles.metaTag}>
                    Assets: {themeData.asset_classes.join(", ")}
                  </span>
                ) : null}
                {themeData.first_seen_at ? (
                  <span className={styles.metaTag}>
                    First seen: {formatDate(themeData.first_seen_at)}
                  </span>
                ) : null}
                {themeData.last_seen_at ? (
                  <span className={styles.metaTag}>
                    Last seen: {formatDate(themeData.last_seen_at)}
                  </span>
                ) : null}
              </div>
            </section>

            {/* AI Analysis */}
            <section className={styles.analysisCard}>
              <div className={styles.analysisHeader}>
                <h2 className={styles.analysisTitle}>AI Analysis</h2>
                {analysisGeneratedAt ? (
                  <span className={styles.analysisTimestamp}>
                    Generated: {formatAnalysisTimestamp(analysisGeneratedAt)}
                    {analysisCached ? " (cached)" : ""}
                  </span>
                ) : null}
              </div>

              {analysisLoading ? (
                <div className={styles.analysisLoading}>
                  <div className={styles.analysisShimmer} />
                  <div className={styles.analysisShimmer} style={{ width: "85%" }} />
                  <div className={styles.analysisShimmer} style={{ width: "70%" }} />
                </div>
              ) : analysisError ? (
                <p className={styles.analysisErrorText}>{analysisError}</p>
              ) : analysis ? (
                <div className={styles.analysisBody}>
                  <ReactMarkdown>{analysis}</ReactMarkdown>
                </div>
              ) : (
                <p className={styles.analysisEmptyText}>Loading...</p>
              )}
            </section>

            {/* Cross-Asset Implication Chains */}
            <section className={styles.chainsCard}>
              <div className={styles.analysisHeader}>
                <h2 className={styles.chainsTitle}>Cross-Asset Implications</h2>
                {chainsGeneratedAt ? (
                  <span className={styles.analysisTimestamp}>
                    Generated: {formatAnalysisTimestamp(chainsGeneratedAt)}
                    {chainsCached ? " (cached)" : ""}
                  </span>
                ) : null}
              </div>

              {chainsLoading ? (
                <div className={styles.analysisLoading}>
                  <div className={styles.analysisShimmer} />
                  <div className={styles.analysisShimmer} style={{ width: "75%" }} />
                </div>
              ) : chainsError ? (
                <p className={styles.analysisErrorText}>{chainsError}</p>
              ) : chains.length > 0 ? (
                <div className={styles.chainsList}>
                  {chains.map((chain, ci) => (
                    <div key={ci} className={styles.chainRow}>
                      <div className={styles.chainTrigger}>
                        <span className={styles.chainTriggerIcon}></span>
                        <span>{chain.trigger}</span>
                      </div>
                      <div className={styles.chainSteps}>
                        {chain.steps
                          .sort((a, b) => a.order - b.order)
                          .map((step, si) => (
                            <div key={si} className={styles.chainStepWrapper}>
                              {si > 0 ? (
                                <span className={styles.chainArrow}>→</span>
                              ) : null}
                              <div
                                className={`${styles.chainStep} ${
                                  step.direction === "bullish"
                                    ? styles.chainStepBullish
                                    : step.direction === "bearish"
                                    ? styles.chainStepBearish
                                    : styles.chainStepNeutral
                                }`}
                              >
                                <span className={styles.chainAssetTag}>
                                  {step.asset_class.replace("_", " ")}
                                </span>
                                <span className={styles.chainStepLabel}>
                                  {step.implication}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.analysisEmptyText}>Loading...</p>
              )}
            </section>

            {/* Event timeline */}
            <section className={styles.timelineSection}>
              <h2 className={styles.sectionTitle}>
                Events · {events.length} event{events.length !== 1 ? "s" : ""}
              </h2>

              {events.length === 0 ? (
                <p className={styles.emptyState}>
                  No events linked to this theme yet.
                </p>
              ) : (
                <div className={styles.timelineList}>
                  {events.map((ev) => (
                    <Link
                      key={ev.event_id}
                      href={`/event/${ev.event_id}`}
                      target="_blank"
                      className={styles.timelineEventLink}
                    >
                    <article
                      className={styles.timelineEvent}
                    >
                      <span className={styles.timelineDot} />
                      <div className={styles.timelineMeta}>
                        <p className={styles.timelineDate}>
                          {formatDate(ev.date)}
                        </p>
                        <span
                          className={`${styles.impactTag} ${impactToneClass(ev.impact)}`}
                        >
                          {ev.impact}
                        </span>
                        {ev.sentiment ? (
                          <span
                            className={`${styles.sentimentTag} ${sentimentToneClass(ev.sentiment)}`}
                          >
                            {ev.sentiment}
                          </span>
                        ) : null}
                      </div>
                      <p className={styles.timelineTitle}>{ev.title}</p>
                      <p className={styles.timelineText}>{truncateString(ev.text, 600)}</p>
                      <div className={styles.timelineFooter}>
                        <span className={styles.timelineSource}>
                          Source: {ev.source}
                        </span>
                        {ev.asset_classes.length > 0 ? (
                          <span className={styles.timelineAssets}>
                            {ev.asset_classes.join(", ")}
                          </span>
                        ) : null}
                      </div>
                    </article>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
