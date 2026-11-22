"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { BrandMark } from "./components/BrandMark";
import {
  ChartCandlestick,
  Earth,
  History,
  Newspaper,
  Thermometer,
} from "lucide-react";
import styles from "./page.module.css";

type SeriesCard = {
  key: string;
  name: string;
  value: string;
  change: string;
  points: number[];
  xLabels?: string[];
  tone: "up" | "down";
  type: "stock" | "macro";
};

type VitalRow = {
  key: string;
  name: string;
  category: string | null;
  value: number | null;
  change_percent: number;
  points: number[];
  x_labels: string[];
  tone: "up" | "down";
  type: "macro" | "market";
  updated_at: string | null;
};

type NewsArticle = {
  id: string;
  title: string;
  description: string;
};

type NewsResponse = {
  articles: NewsArticle[];
};

type HeatCell = {
  theme_id: string;
  topic: string;
  score: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";
const NEWS_ROTATE_MS = 6000;
const MAX_SPARKLINE_TICKS = 4;

function toSeriesCard(row: VitalRow, type: "stock" | "macro"): SeriesCard {
  return {
    key: row.key,
    name: row.name,
    value: formatMetricValue(row.value),
    change: formatPercentChange(row.change_percent ?? 0),
    points: row.points,
    xLabels: row.x_labels,
    tone: row.tone,
    type,
  };
}

function chooseXAxisGranularity(xLabels: string[]) {
  if (xLabels.length < 2) return "day";

  const start = new Date(`${xLabels[0]}T00:00:00`);
  const end = new Date(`${xLabels[xLabels.length - 1]}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "month";
  }

  const spanMs = Math.abs(end.getTime() - start.getTime());
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = spanMs / dayMs;

  if (spanDays <= 365) return "month";
  if (spanDays <= 5 * 365) return "month-year";
  return "year";
}

function formatXAxisDateLabel(rawDate: string, granularity: string) {
  const parsed = new Date(`${rawDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return rawDate;

  if (granularity === "month") {
    return Intl.DateTimeFormat("en-US", { month: "short" }).format(parsed);
  }

  if (granularity === "month-year") {
    return Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(parsed);
  }

  return Intl.DateTimeFormat("en-US", { year: "numeric" }).format(parsed);
}

function buildTickFractions(pointCount: number, maxTicks = MAX_SPARKLINE_TICKS) {
  if (pointCount <= 0) return [];

  const tickCount = Math.min(pointCount, Math.max(1, maxTicks));
  if (tickCount === 1) return [0];
  return Array.from({ length: tickCount }, (_, idx) => idx / (tickCount - 1));
}

function Sparkline({
  points,
  tone,
  xLabels,
}: {
  points: number[];
  tone: "up" | "down";
  xLabels?: string[];
}) {
  const width = 360;
  const height = 180;
  const padLeft = 50;
  const padRight = 50;
  const padTop = 10;
  const padBottom = 30;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const valueRange = max - min;
  const fallbackRange = Math.max(Math.abs(max) * 0.01, 1e-6);
  const paddedMin = valueRange === 0 ? max - fallbackRange / 2 : min;
  const paddedMax = valueRange === 0 ? max + fallbackRange / 2 : max;
  const spread = paddedMax - paddedMin;
  const tickFractions = buildTickFractions(points.length);

  const path = points.map((point, i) => {
      const x = padLeft + (points.length > 1 ? (i / (points.length - 1)) * plotWidth : plotWidth / 2);
      const y = padTop + (1 - (point - paddedMin) / spread) * plotHeight;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  
  const yTicks = tickFractions.map((fraction, index) => {
    const value = paddedMax - fraction * spread;
    const y = padTop + fraction * plotHeight;
    return { index, value, y };
  });

  const areaPath = `${path} L ${width - padRight} ${height - padBottom} L ${padLeft} ${height - padBottom} Z`;
  const gradientId = useId();

  const hasDateLabels = Array.isArray(xLabels) && xLabels.length === points.length;
  const xAxisGranularity = hasDateLabels ? chooseXAxisGranularity(xLabels) : "month";
  const xTicks = tickFractions.map((fraction, index) => {
    const x = padLeft + fraction * plotWidth;
    const labelIndex = points.length > 1 ? Math.round(fraction * (points.length - 1)) : 0;
    return {
      index,
      label: hasDateLabels ? formatXAxisDateLabel(xLabels[labelIndex], xAxisGranularity) : `T${labelIndex + 1}`,
      x,
    };
  });

  const axisFractionDigits =
    spread < 0.01 ? 6 : spread < 0.1 ? 5 : spread < 1 ? 4 : spread < 10 ? 3 : spread < 1000 ? 2 : 0;

  const axisFormatter = new Intl.NumberFormat("en-US", {
    notation: "standard",
    minimumFractionDigits: axisFractionDigits,
    maximumFractionDigits: axisFractionDigits,
  });

  const formatAxisValue = (value: number) => axisFormatter.format(value);

  return (
    <svg
      className={`${styles.sparkline} ${tone === "up" ? styles.sparklineUp : styles.sparklineDown}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--sparkline-stroke)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--sparkline-stroke)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => (
        <line
          key={`grid-${tick.index}`}
          className={styles.sparklineGrid}
          x1={padLeft}
          y1={tick.y}
          x2={width - padRight}
          y2={tick.y}
        />
      ))}
      <line
        className={styles.sparklineAxis}
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
      />

      <path className={styles.sparklineArea} d={areaPath} fill={`url(#${gradientId})`} />
      <path className={styles.sparklinePath} d={path} />

      {yTicks.map((tick) => (
        <g key={`ytick-${tick.index}`}>
          <line
            className={styles.sparklineTick}
            x1={padLeft - 3}
            y1={tick.y}
            x2={padLeft}
            y2={tick.y}
          />
          <text className={styles.sparklineLabel} x={padLeft - 6} y={tick.y + 3} textAnchor="end">
            {formatAxisValue(tick.value)}
          </text>
        </g>
      ))}

      {xTicks.map((tick) => (
        <g key={`xtick-${tick.index}`}>
          <line
            className={styles.sparklineTick}
            x1={tick.x}
            y1={height - padBottom}
            x2={tick.x}
            y2={height - padBottom + 3}
          />
          <text
            className={styles.sparklineLabel}
            x={tick.x}
            y={height - 2}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </svg>
  );
}


function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: readonly number[]): string {
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(a: string, b: string, t: number): string {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return rgbToHex(ar.map((v, i) => v + (br[i] - v) * t));
}

const HEAT_TEAL = "#57c2b0";
const HEAT_BRASS = "#c9a341";
const HEAT_RUST = "#c8694a";
const HEAT_INK = "#0b0f14";

/**
 * Pressure cell: a continuous teal -> brass -> rust gradient keyed on heat
 * score, rendered as a radial "heat bloom" (weather-pressure-map styling).
 * Label text always sits over a dark scrim (see .heatScrim), so it stays
 * legible regardless of where the bloom falls on the teal/brass/rust range —
 * no need to pick text color per-tile from the bloom's luminance.
 */
function pressureCellStyle(score: number): CSSProperties {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const bloom = t < 0.5 ? mixHex(HEAT_TEAL, HEAT_BRASS, t / 0.5) : mixHex(HEAT_BRASS, HEAT_RUST, (t - 0.5) / 0.5);
  const edge = mixHex(bloom, HEAT_INK, 0.55);

  return {
    backgroundImage: `radial-gradient(circle at 30% 26%, ${bloom} 0%, ${edge} 68%, ${HEAT_INK} 100%)`,
  };
}

function formatMetricValue(value: number | null) {
  if (value === null || Number.isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toFixed(2);
}

function formatPercentChange(value: number) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function latestTimestamp(current: string | null, rows: VitalRow[]): string | null {
  const candidates = rows.map((r) => r.updated_at).filter((v): v is string => Boolean(v));
  const all = current ? [current, ...candidates] : candidates;
  if (all.length === 0) return current;
  return all.reduce((latest, ts) => (ts > latest ? ts : latest));
}

function formatSyncTimestamp(raw: string | null) {
  if (!raw) return "SYNCING…";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "SYNCED";
  const date = Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
  return `SYNCED ${date} UTC`;
}

export default function Home() {
  const [marketCards, setMarketCards] = useState<SeriesCard[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [macroCards, setMacroCards] = useState<SeriesCard[]>([]);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState<string | null>(null);

  const [heatCells, setHeatCells] = useState<HeatCell[]>([]);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);
  const newsViewportRef = useRef<HTMLDivElement | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMarketVitals() {
      setMarketLoading(true);
      setMarketError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/vitals/market`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to load market vitals.");

        const data = (await response.json()) as VitalRow[];
        setMarketCards(data.map((row) => toSeriesCard(row, "stock")));
        setLastSynced((prev) => latestTimestamp(prev, data));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarketCards([]);
        setMarketError("Unable to load market vitals.");
      } finally {
        setMarketLoading(false);
      }
    }

    void loadMarketVitals();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMacroVitals() {
      setMacroLoading(true);
      setMacroError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/vitals/macro`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to load macro vitals.");

        const data = (await response.json()) as VitalRow[];
        setMacroCards(data.map((row) => toSeriesCard(row, "macro")));
        setLastSynced((prev) => latestTimestamp(prev, data));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMacroCards([]);
        setMacroError("Unable to load macro vitals.");
      } finally {
        setMacroLoading(false);
      }
    }

    void loadMacroVitals();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadNews() {
      setNewsLoading(true);
      setNewsError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/news`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Failed to load news.");
        }

        const data = (await response.json()) as NewsResponse;
        const nextArticles = data.articles ?? [];
        setNewsArticles(nextArticles);
        setActiveNewsIndex(0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNewsArticles([]);
        setNewsError("Unable to load news.");
      } finally {
        setNewsLoading(false);
      }
    }

    void loadNews();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (newsArticles.length < 2) return;

    const intervalId = window.setInterval(() => {
      setActiveNewsIndex((current) => {
        const nextIndex = (current + 1) % newsArticles.length;
        const viewport = newsViewportRef.current;
        if (viewport) {
          const cardHeight = viewport.clientHeight;
          viewport.scrollTo({
            top: nextIndex * cardHeight,
            behavior: "smooth",
          });
        }
        return nextIndex;
      });
    }, NEWS_ROTATE_MS);

    return () => window.clearInterval(intervalId);
  }, [newsArticles]);

  useEffect(() => {
    const viewport = newsViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = 0;
  }, [newsArticles]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHottestThemes() {
      setHeatLoading(true);
      setHeatError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/themes/hottest?limit=9`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load hottest themes.");
        }

        const data = (await response.json()) as Array<{ theme_id: string; topic: string; score: number }>;
        const normalized = data.map((item) => ({
          theme_id: item.theme_id,
          topic: item.topic,
          score: Math.max(0, Math.min(100, Number(item.score) || 0)),
        }));

        setHeatCells(normalized);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHeatCells([]);
        setHeatError("Unable to load theme heat data.");
      } finally {
        setHeatLoading(false);
      }
    }

    void loadHottestThemes();
    return () => controller.abort();
  }, []);

  const handleNewsScroll = () => {
    const viewport = newsViewportRef.current;
    if (!viewport) return;
    const cardHeight = viewport.clientHeight || 1;
    const nextIndex = Math.round(viewport.scrollTop / cardHeight);
    const boundedIndex = Math.max(0, Math.min(newsArticles.length - 1, nextIndex));
    if (boundedIndex !== activeNewsIndex) {
      setActiveNewsIndex(boundedIndex);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandRow}>
            <div className={styles.brandMark}>
              <BrandMark size={24} />
              <p className={styles.brand}>DMacro</p>
            </div>
            <p className={styles.syncLine}>
              <span className={styles.syncDot} aria-hidden />
              {formatSyncTimestamp(lastSynced)}
            </p>
          </div>
          <div className={styles.dispatchRule}>
            <span>Macro &amp; Market Bulletin</span>
            <span>Pre-computed Daily · No Live Queries</span>
          </div>
        </div>
      </header>

      <main className={styles.mainGrid}>
        <aside className={styles.sidebar}>
          <p className={styles.sidebarTitle}>Features</p>
          <ul className={styles.moduleList}>
            <li>
              <a href="#stock-market" className={`${styles.moduleItem} ${styles.moduleLink}`}>
                <ChartCandlestick className={styles.moduleIcon} aria-hidden />
                <span>Stock Market</span>
              </a>
            </li>
            <li>
              <a href="#macro-indicators" className={`${styles.moduleItem} ${styles.moduleLink}`}>
                <Earth className={styles.moduleIcon} aria-hidden />
                <span>Macro Indicators</span>
              </a>
            </li>
            <li>
              <a href="#news-feed" className={`${styles.moduleItem} ${styles.moduleLink}`}>
                <Newspaper className={styles.moduleIcon} aria-hidden />
                <span>News Feed</span>
              </a>
            </li>
            <li>
              <a href="#theme-heat" className={`${styles.moduleItem} ${styles.moduleLink}`}>
                <Thermometer className={styles.moduleIcon} aria-hidden />
                <span>Theme Heat</span>
              </a>
            </li>
            <li>
              <a href="/timeline" className={`${styles.moduleItem} ${styles.moduleLink}`}>
                <History className={styles.moduleIcon} aria-hidden />
                <span>Theme Tracker</span>
              </a>
            </li>
          </ul>
        </aside>

        <section className={styles.contentGrid}>
          <div className={styles.stack}>
            <section id="stock-market" className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.featureTitle}>Stock Market</h2>
              </div>

              {marketLoading ? <p className={styles.macroStatus}>Loading market data...</p> : null}
              {marketError ? <p className={styles.macroError}>{marketError}</p> : null}

              {!marketLoading && marketCards.length === 0 ? (
                <p className={styles.macroEmpty}>No market vitals available yet.</p>
              ) : (
                <div className={styles.seriesGrid}>
                  {marketCards.map((card) => (
                    <article key={card.key} className={styles.seriesCard}>
                      <div className={styles.seriesTop}>
                        <div>
                          <p className={styles.seriesName}>{card.name}</p>
                        </div>
                        <div className={styles.seriesMetric}>
                          <p className={styles.seriesValue}>{card.value}</p>
                          <p
                            className={`${styles.seriesChange} ${
                              card.tone === "up" ? styles.changeUp : styles.changeDown
                            }`}
                          >
                            {card.change}
                          </p>
                        </div>
                      </div>
                      <Sparkline points={card.points} tone={card.tone} xLabels={card.xLabels} />
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="macro-indicators" className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.featureTitle}>Macroeconomic Indicators</h2>
              </div>

              {macroLoading ? <p className={styles.macroStatus}>Loading macro data...</p> : null}
              {macroError ? <p className={styles.macroError}>{macroError}</p> : null}

              {!macroLoading && macroCards.length === 0 ? (
                <p className={styles.macroEmpty}>No macro vitals available yet.</p>
              ) : (
                <div className={styles.seriesGrid}>
                  {macroCards.map((card) => (
                    <article key={card.key} className={styles.seriesCard}>
                      <div className={styles.seriesTop}>
                        <div>
                          <p className={styles.seriesName}>{card.name}</p>
                        </div>
                        <div className={styles.seriesMetric}>
                          <p className={styles.seriesValue}>{card.value}</p>
                          <p
                            className={`${styles.seriesChange} ${
                              card.tone === "up" ? styles.changeUp : styles.changeDown
                            }`}
                          >
                            {card.change}
                          </p>
                        </div>
                      </div>
                      <Sparkline points={card.points} tone={card.tone} xLabels={card.xLabels} />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className={styles.stack}>
            <section id="news-feed" className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.featureTitle}>
                  News Feed
                </h2>
              </div>

              <div
                ref={newsViewportRef}
                className={styles.newsViewport}
                aria-live="polite"
                onScroll={handleNewsScroll}
              >
                {newsLoading ? <p className={styles.newsStatus}>Loading news...</p> : null}
                {newsError ? <p className={styles.newsError}>{newsError}</p> : null}
                {!newsLoading && !newsError && newsArticles.length === 0 ? (
                  <p className={styles.newsStatus}>No news available.</p>
                ) : null}

                {!newsLoading && !newsError && newsArticles.length > 0 ? (
                  <div className={styles.newsTrack}>
                    {newsArticles.map((article, index) => (
                      <Link
                      key={article.id}
                      href={`/event/${article.id}`}
                      target="_blank"
                      className={styles.timelineEventLink}
                      >
                      <article key={article.id} className={styles.newsCard}>
                        <p className={styles.newsEyebrow}>Dispatch {String(index + 1).padStart(2, "0")}</p>
                        <p className={styles.newsTitle}>{article.title}</p>
                        <p className={styles.newsDescription}>{article.description}</p>
                      </article>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              {newsArticles.length > 0 ? (
                <div className={styles.newsFooter}>
                  <div className={styles.newsDots}>
                    {newsArticles.map((article, index) => (
                      <button
                        key={article.id}
                        type="button"
                        aria-label={`Show dispatch ${index + 1}`}
                        className={`${styles.newsDot} ${
                          index === activeNewsIndex ? styles.newsDotActive : ""
                        }`}
                        onClick={() => {
                          setActiveNewsIndex(index);
                          const viewport = newsViewportRef.current;
                          if (viewport) {
                            viewport.scrollTo({ top: index * viewport.clientHeight, behavior: "smooth" });
                          }
                        }}
                      />
                    ))}
                  </div>
                  <span className={styles.newsCount}>
                    {activeNewsIndex + 1} / {newsArticles.length}
                  </span>
                </div>
              ) : null}
            </section>

            <section id="theme-heat" className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.featureTitle}>
                  Trending Themes
                </h2>
              </div>

              {heatLoading ? <p className={styles.macroStatus}>Loading theme heat...</p> : null}
              {heatError ? <p className={styles.macroError}>{heatError}</p> : null}

              {heatCells.length === 0 ? (
                <p className={styles.macroEmpty}>No theme heat data yet.</p>
              ) : (
                <div className={styles.heatGrid}>
                  {heatCells.map((cell) => (
                    <Link
                      key={cell.theme_id || cell.topic}
                      href={cell.theme_id ? `/timeline/${cell.theme_id}` : "#"}
                      className={styles.heatCell}
                      style={pressureCellStyle(cell.score)}
                    >
                      <span className={styles.heatScrim} aria-hidden />
                      <p className={styles.heatTopic}>{cell.topic}</p>
                      <p className={styles.heatScore}>
                        <span className={styles.heatScoreLabel}>Heat</span> {cell.score}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

          </div>
        </section>
      </main>
    </div>
  );
}



