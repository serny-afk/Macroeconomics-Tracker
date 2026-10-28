"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
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
const MAX_SPARKLINE_TICKS = 6;

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
        y1={padTop}
        x2={padLeft}
        y2={height - padBottom}
      />
      <line
        className={styles.sparklineAxis}
        x1={padLeft}
        y1={height - padBottom}
        x2={width - padRight}
        y2={height - padBottom}
      />

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


function heatToneStyle(score: number): CSSProperties {
  /**
   * Fixed 10-step heat scale:
   * low values -> green, mid values -> yellow/orange, high values -> red.
   */
  const clamped = Math.max(0, Math.min(score, 99));
  const palette = [
    "#1a9850",
    "#4db15e",
    "#7acb68",
    "#a5da70",
    "#d0e878",
    "#f4f491",
    "#f7d26a",
    "#f9b05a",
    "#ef7e4a",
    "#d73027",
  ];
  const bucketIndex = Math.floor(clamped / palette.length);
  const fill = palette[bucketIndex];
  const textColor = bucketIndex <= 1 || bucketIndex >= 8 ? "#f5f5f5" : "#111111";

  return {
    backgroundColor: fill,
    borderColor: fill,
    color: textColor,
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
            <p className={styles.brand}>DMacro</p>
            <Image
              src="/logo.png"
              alt="DMacro logo"
              width={42}
              height={24}
              className={styles.brandLogo}
              priority
            />
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
                    {newsArticles.map((article) => (
                      <Link
                      key={article.id}
                      href={`/event/${article.id}`}
                      target="_blank"
                      className={styles.timelineEventLink}
                      >
                      <article key={article.id} className={styles.newsCard}>
                        <p className={styles.newsTitle}>{article.title}</p>
                        <p className={styles.newsDescription}>{article.description}</p>
                      </article>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              <p className={styles.macroEmpty}>
                Click to see more
              </p>
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
                      style={heatToneStyle(cell.score)}
                    >
                      <p className={styles.heatTopic}>{cell.topic}</p>
                      <p className={styles.heatScore}>{cell.score}</p>
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



