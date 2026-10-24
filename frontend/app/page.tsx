"use client";

import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChartCandlestick,
  Earth,
  History,
  Newspaper,
  SquareX,
  Thermometer,
} from "lucide-react";
import styles from "./page.module.css";

type SeriesCard = {
  name: string;
  value: string;
  change: string;
  points: number[];
  xLabels?: string[];
  tone: "up" | "down";
  type: "stock" | "macro";
};

type MacroSeriesCard = SeriesCard & {
  indicatorKey: string;
};

type MarketSeriesCard = SeriesCard & {
  marketKey: string;
};

type MacroCategoryOption = {
  key: string;
  label: string;
};

type MacroIndicatorOption = {
  key: string;
  label: string;
  series_id: string;
};

type MacroCategoriesResponse = {
  country: string;
  categories: MacroCategoryOption[];
};

type MacroIndicatorsResponse = {
  category: string;
  indicators: MacroIndicatorOption[];
};

type MacroSeriesResponse = {
  category: string | null;
  indicator: string;
  indicator_label: string;
  series_id: string | null;
  observations: Array<{ date: string; value: number }>;
  points: number[];
  latest: { date: string; value: number } | null;
  previous: { date: string; value: number } | null;
  change: {
    absolute: number;
    percent: number;
  };
};

type NewsArticle = {
  id: string;
  title: string;
  description: string;
};

type NewsResponse = {
  articles: NewsArticle[];
};

type MarketFunction =
  | "TIME_SERIES_DAILY"
  | "TIME_SERIES_DAILY_ADJUSTED"
  | "TIME_SERIES_WEEKLY"
  | "TIME_SERIES_WEEKLY_ADJUSTED"
  | "TIME_SERIES_MONTHLY"
  | "TIME_SERIES_MONTHLY_ADJUSTED";

type SymbolSearchMatch = {
  symbol: string;
  name: string;
  type: string | null;
  region: string | null;
  market_open: string | null;
  market_close: string | null;
  timezone: string | null;
  currency: string | null;
};

type SymbolSearchResponse = {
  keywords: string;
  matches: SymbolSearchMatch[];
  count: number;
};

type HeatCell = {
  theme_id: string;
  topic: string;
  score: number;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";
const MAX_MACRO_GRAPHS = 8;
const MAX_MARKET_GRAPHS = 8;
const NEWS_ROTATE_MS = 6000;
const MAX_SPARKLINE_TICKS = 6;
const MARKET_CARDS_CACHE_KEY = "nfc.marketCards.v1";
const MACRO_CARDS_CACHE_KEY = "nfc.macroCards.v1";

const MARKET_FUNCTION_OPTIONS: Array<{ value: MarketFunction; label: string }> = [
  { value: "TIME_SERIES_DAILY", label: "Daily" },
  { value: "TIME_SERIES_DAILY_ADJUSTED", label: "Daily Adjusted" },
  { value: "TIME_SERIES_WEEKLY", label: "Weekly" },
  { value: "TIME_SERIES_WEEKLY_ADJUSTED", label: "Weekly Adjusted" },
  { value: "TIME_SERIES_MONTHLY", label: "Monthly" },
  { value: "TIME_SERIES_MONTHLY_ADJUSTED", label: "Monthly Adjusted" },
];

const MARKET_ENDPOINTS: Record<MarketFunction, string> = {
  TIME_SERIES_DAILY: "/api/market/time-series/daily",
  TIME_SERIES_DAILY_ADJUSTED: "/api/market/time-series/daily-adjusted",
  TIME_SERIES_WEEKLY: "/api/market/time-series/weekly",
  TIME_SERIES_WEEKLY_ADJUSTED: "/api/market/time-series/weekly-adjusted",
  TIME_SERIES_MONTHLY: "/api/market/time-series/monthly",
  TIME_SERIES_MONTHLY_ADJUSTED: "/api/market/time-series/monthly-adjusted",
};

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

function toLabel(value: string) {
  const tokenMap: Record<string, string> = {
    fx: "FX",
    usd: "USD",
    eur: "EUR",
    jpy: "JPY",
    gdp: "GDP",
    cpi: "CPI",
    pce: "PCE",
    ppi: "PPI",
    pmi: "PMI",
    fed: "Fed",
    sofr: "SOFR",
    ust: "UST",
    ig: "IG",
    hy: "HY",
    oas: "OAS",
    ted: "TED",
    nfci: "NFCI",
    stlfsi: "STLFSI",
    m2: "M2",
    u6: "U6",
    wti: "WTI",
    yoy: "YoY",
    mom: "MoM",
  };

  return value
    .split("_")
    .map((token) => {
      const lowered = token.toLowerCase();
      if (tokenMap[lowered]) return tokenMap[lowered];

      if (/^\d+[a-z]+$/i.test(token)) {
        const prefix = token.replace(/[A-Za-z]/g, "");
        const suffix = token.replace(/\d/g, "").toUpperCase();
        return `${prefix}${suffix}`;
      }

      return lowered.charAt(0).toUpperCase() + lowered.slice(1);
    })
    .join(" ");
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

function normalizeSeries(observations: Array<{ date: string; value: number }>) {
  const validRows = observations.filter((row) => Number.isFinite(row.value));
  if (validRows.length > 1) {
    return {
      points: validRows.map((row) => row.value),
      xLabels: validRows.map((row) => row.date),
    };
  }
  if (validRows.length === 1) {
    return {
      points: [validRows[0].value, validRows[0].value],
      xLabels: [validRows[0].date, validRows[0].date],
    };
  }
  return {
    points: [0, 0],
    xLabels: ["N/A", "N/A"],
  };
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractAlphaClose(row: Record<string, string>) {
  const preferred = ["5. adjusted close", "4. close"];
  for (const key of preferred) {
    const value = row[key];
    if (!value) continue;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  for (const [key, value] of Object.entries(row)) {
    if (!key.toLowerCase().includes("close")) continue;
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function parseAlphaSeries(raw: Record<string, unknown>) {
  const seriesEntry = Object.entries(raw).find(
    ([key, value]) =>
      key.toLowerCase().includes("time series") &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
  );

  if (!seriesEntry) {
    throw new Error("No time series data found for the selected options.");
  }

  const rows = seriesEntry[1] as Record<string, Record<string, string>>;
  const normalizedRows = Object.entries(rows)
    .map(([date, row]) => {
      if (!row || typeof row !== "object") return null;
      const closeValue = extractAlphaClose(row);
      if (closeValue === null) return null;
      return { date, value: closeValue };
    })
    .filter((row): row is { date: string; value: number } => row !== null)
    .sort((left, right) => left.date.localeCompare(right.date));

  const latest = normalizedRows.length > 0 ? normalizedRows[normalizedRows.length - 1] : null;
  const previous = normalizedRows.length > 1 ? normalizedRows[normalizedRows.length - 2] : null;
  const normalizedSeries = normalizeSeries(normalizedRows);

  return {
    normalizedSeries,
    latest,
    previous,
  };
}

function extractAlphaMetaSymbol(raw: Record<string, unknown>) {
  const meta = raw["Meta Data"];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const symbol = (meta as Record<string, unknown>)["2. Symbol"];
  return typeof symbol === "string" && symbol ? symbol : null;
}

export default function Home() {
  const [marketSymbolInput, setMarketSymbolInput] = useState("");
  const [marketSymbolMatches, setMarketSymbolMatches] = useState<SymbolSearchMatch[]>([]);
  const [showMarketMatches, setShowMarketMatches] = useState(false);
  const [marketFunction, setMarketFunction] = useState<MarketFunction>("TIME_SERIES_DAILY");
  const [marketEntitlement, setMarketEntitlement] = useState<"realtime" | "delayed">("realtime");
  const [marketStartDate, setMarketStartDate] = useState("");
  const [marketEndDate, setMarketEndDate] = useState("");
  const [marketCards, setMarketCards] = useState<MarketSeriesCard[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketSymbolLoading, setMarketSymbolLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("USA");
  const [categories, setCategories] = useState<MacroCategoryOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [indicators, setIndicators] = useState<MacroIndicatorOption[]>([]);
  const [selectedIndicator, setSelectedIndicator] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [macroCards, setMacroCards] = useState<MacroSeriesCard[]>([]);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState<string | null>(null);
  const [cardsHydrated, setCardsHydrated] = useState(false);

  const [heatCells, setHeatCells] = useState<HeatCell[]>([]);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);
  const newsViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const marketCached = window.localStorage.getItem(MARKET_CARDS_CACHE_KEY);
      if (marketCached) {
        const parsed = JSON.parse(marketCached) as unknown;
        if (Array.isArray(parsed)) {
          setMarketCards(parsed as MarketSeriesCard[]);
        }
      }

      const macroCached = window.localStorage.getItem(MACRO_CARDS_CACHE_KEY);
      if (macroCached) {
        const parsed = JSON.parse(macroCached) as unknown;
        if (Array.isArray(parsed)) {
          setMacroCards(parsed as MacroSeriesCard[]);
        }
      }
    } catch {
      // Ignore cache read errors and keep in-memory defaults.
    } finally {
      setCardsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!cardsHydrated) return;
    try {
      window.localStorage.setItem(MARKET_CARDS_CACHE_KEY, JSON.stringify(marketCards));
    } catch {
      // Ignore cache write errors.
    }
  }, [cardsHydrated, marketCards]);

  useEffect(() => {
    if (!cardsHydrated) return;
    try {
      window.localStorage.setItem(MACRO_CARDS_CACHE_KEY, JSON.stringify(macroCards));
    } catch {
      // Ignore cache write errors.
    }
  }, [cardsHydrated, macroCards]);

  useEffect(() => {
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    setMarketStartDate((current) => current || toDateInputValue(oneYearAgo));
    setMarketEndDate((current) => current || toDateInputValue(today));
    setStartDate((current) => current || `${today.getFullYear()}-01-01`);
    setEndDate((current) => current || toDateInputValue(today));
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
    const keyword = marketSymbolInput.trim();
    if (keyword.length < 1) {
      setMarketSymbolMatches([]);
      setShowMarketMatches(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setMarketSymbolLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/market/symbol-search?keywords=${encodeURIComponent(keyword)}&limit=8`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load symbol matches.");
        }

        const data = (await response.json()) as SymbolSearchResponse;
        const nextMatches = data.matches ?? [];
        setMarketSymbolMatches(nextMatches);
        setShowMarketMatches((current) => current && nextMatches.length > 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarketSymbolMatches([]);
        setShowMarketMatches(false);
      } finally {
        setMarketSymbolLoading(false);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [marketSymbolInput]);
  
  // Country selection drop down menu
  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setMacroLoading(true);
      setMacroError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/macroeconomic/categories?country=${encodeURIComponent(
            selectedCountry.toLowerCase()
          )}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load categories.");
        }

        const data = (await response.json()) as MacroCategoriesResponse;
        const nextCategories = data.categories ?? [];
        setCategories(nextCategories);
        setSelectedCategory((current) => {
          if (nextCategories.some((option) => option.key === current)) {
            return current;
          }
          return nextCategories[0]?.key ?? "";
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCategories([]);
        setSelectedCategory("");
        setMacroError("Unable to load macro categories.");
      } finally {
        setMacroLoading(false);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, [selectedCountry]);

  // Category selection drop down menu
  useEffect(() => {
    if (!selectedCategory) {
      setIndicators([]);
      setSelectedIndicator("");
      return;
    }

    const controller = new AbortController();

    async function loadIndicators() {
      setMacroLoading(true);
      setMacroError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/macroeconomic/indicators?category=${encodeURIComponent(selectedCategory)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load indicators.");
        }

        const data = (await response.json()) as MacroIndicatorsResponse;
        setIndicators(data.indicators ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setIndicators([]);
        setMacroError("Unable to load indicators for this category.");
      } finally {
        setMacroLoading(false);
      }
    }

    void loadIndicators();
    return () => controller.abort();
  }, [selectedCategory]);

  

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

  // Indicator selection drop down menu
  const handleIndicatorSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedIndicator(event.target.value);
  };

  // Query backend on search
  const handleSearchClick = async () => {
    if (!selectedIndicator || !selectedCategory) return;
    if (startDate && endDate && startDate > endDate) {
      setMacroError("Start date must be earlier than or equal to end date.");
      return;
    }

    setMacroLoading(true);
    setMacroError(null);

    try {
      const query = new URLSearchParams({
        category: selectedCategory,
        indicator: selectedIndicator,
        limit: "120",
      });
      if (startDate) query.set("start_date", startDate);
      if (endDate) query.set("end_date", endDate);

      const response = await fetch(
        `${API_BASE_URL}/api/macroeconomic/series?${query.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to load series data.");
      }

      const data = (await response.json()) as MacroSeriesResponse;
      const changePercent = data.change?.percent ?? 0;
      const normalizedSeries = normalizeSeries(data.observations ?? []);
      const nextCard: MacroSeriesCard = {
        indicatorKey: selectedIndicator,
        name: data.indicator_label || toLabel(selectedIndicator),
        value: formatMetricValue(data.latest?.value ?? null),
        change: formatPercentChange(changePercent),
        points: normalizedSeries.points,
        xLabels: normalizedSeries.xLabels,
        tone: changePercent >= 0 ? "up" : "down",
        type: "macro",
      };

      setMacroCards((previous) => {
        const withoutCurrent = previous.filter((card) => card.indicatorKey !== selectedIndicator);
        const nextCards = [...withoutCurrent, nextCard];
        if (nextCards.length <= MAX_MACRO_GRAPHS) return nextCards;
        return nextCards.slice(nextCards.length - MAX_MACRO_GRAPHS);
      });
    } catch {
      setMacroError("Unable to load series data for the selected indicator.");
    } finally {
      setMacroLoading(false);
    }
  };

  const handleMarketSymbolSelect = (match: SymbolSearchMatch) => {
    setMarketSymbolInput(match.symbol);
    setShowMarketMatches(false);
  };

  const handleMarketSearchClick = async () => {
    const symbol = marketSymbolInput.trim().toUpperCase();
    if (!symbol) {
      setMarketError("Please select or enter a symbol.");
      return;
    }
    if (marketStartDate && marketEndDate && marketStartDate > marketEndDate) {
      setMarketError("Start Date cannot be after End Date.");
      return;
    }

    setMarketLoading(true);
    setMarketError(null);
    let requestUrl = "";

    try {
      const endpoint = MARKET_ENDPOINTS[marketFunction];
      const query = new URLSearchParams({ symbol });

      if (
        marketFunction === "TIME_SERIES_DAILY" ||
        marketFunction === "TIME_SERIES_DAILY_ADJUSTED"
      ) {
        query.set("entitlement", marketEntitlement);
      }
      if (marketStartDate) query.set("start_date", marketStartDate);
      if (marketEndDate) query.set("end_date", marketEndDate);

      requestUrl = `${API_BASE_URL}${endpoint}?${query.toString()}`;
      const response = await fetch(requestUrl);
      if (!response.ok) {
        throw new Error("Failed to load market time series.");
      }

      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.error === "string") {
        throw new Error(data.error);
      }

      const { normalizedSeries, latest, previous } = parseAlphaSeries(data);
      const latestValue = latest?.value ?? null;
      const previousValue = previous?.value ?? null;
      const changePercent =
        latestValue !== null && previousValue !== null && previousValue !== 0
          ? ((latestValue - previousValue) / previousValue) * 100
          : 0;

      const resolvedSymbol = extractAlphaMetaSymbol(data) ?? symbol;
      const key = [
        resolvedSymbol,
        marketFunction,
        marketEntitlement,
        marketStartDate,
        marketEndDate,
      ].join("|");
      const functionLabel =
        MARKET_FUNCTION_OPTIONS.find((option) => option.value === marketFunction)?.label ??
        marketFunction;

      const nextCard: MarketSeriesCard = {
        marketKey: key,
        name: `${resolvedSymbol} · ${functionLabel}`,
        value: formatMetricValue(latestValue),
        change: formatPercentChange(changePercent),
        points: normalizedSeries.points,
        xLabels: normalizedSeries.xLabels,
        tone: changePercent >= 0 ? "up" : "down",
        type: "stock",
      };

      setMarketCards((previousCards) => {
        const withoutCurrent = previousCards.filter((card) => card.marketKey !== key);
        const nextCards = [...withoutCurrent, nextCard];
        if (nextCards.length <= MAX_MARKET_GRAPHS) return nextCards;
        return nextCards.slice(nextCards.length - MAX_MARKET_GRAPHS);
      });
      setShowMarketMatches(false);
    } catch (error) {
      if (error instanceof TypeError) {
        const target = requestUrl || `${API_BASE_URL}/api/market/...`;
        setMarketError(`Network error reaching backend at ${target}. Check backend server and CORS.`);
      } else if (error instanceof Error) {
        setMarketError(error.message || "Unable to load market time series.");
      } else {
        setMarketError("Unable to load market time series.");
      }
    } finally {
      setMarketLoading(false);
    }
  };

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

  const handleRemoveMarketCard = (marketKey: string) => {
    setMarketCards((previousCards) => previousCards.filter((card) => card.marketKey !== marketKey));
  };

  const handleRemoveMacroCard = (indicatorKey: string) => {
    setMacroCards((previousCards) => previousCards.filter((card) => card.indicatorKey !== indicatorKey));
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

              <div className={styles.macroFilterRow}>
                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Symbol</span>
                  <div className={styles.marketSymbolWrap}>
                    <input
                      className={styles.marketSymbolInput}
                      value={marketSymbolInput}
                      onChange={(event) => {
                        setMarketSymbolInput(event.target.value);
                        setShowMarketMatches(true);
                      }}
                      onFocus={() => setShowMarketMatches(marketSymbolMatches.length > 0)}
                      placeholder="Search symbol..."
                    />
                    {showMarketMatches && marketSymbolMatches.length > 0 ? (
                      <ul className={styles.marketAutocomplete}>
                        {marketSymbolMatches.map((match) => (
                          <li key={`${match.symbol}-${match.region}`}>
                            <button
                              type="button"
                              className={styles.marketAutocompleteButton}
                              onClick={() => handleMarketSymbolSelect(match)}
                            >
                              <span>{match.symbol}</span>
                              <span className={styles.marketAutocompleteMeta}>
                                {match.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Function</span>
                  <select
                    className={styles.macroSelect}
                    value={marketFunction}
                    onChange={(event) => setMarketFunction(event.target.value as MarketFunction)}
                  >
                    {MARKET_FUNCTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Entitlement</span>
                  <select
                    className={styles.macroSelect}
                    value={marketEntitlement}
                    onChange={(event) =>
                      setMarketEntitlement(event.target.value as "realtime" | "delayed")
                    }
                    disabled={
                      marketFunction !== "TIME_SERIES_DAILY" &&
                      marketFunction !== "TIME_SERIES_DAILY_ADJUSTED"
                    }
                  >
                    <option value="realtime">Realtime</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Start Date</span>
                  <input
                    type="date"
                    className={styles.macroDateInput}
                    value={marketStartDate}
                    onChange={(event) => setMarketStartDate(event.target.value)}
                    max={marketEndDate || undefined}
                  />
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>End Date</span>
                  <input
                    type="date"
                    className={styles.macroDateInput}
                    value={marketEndDate}
                    onChange={(event) => setMarketEndDate(event.target.value)}
                    min={marketStartDate || undefined}
                  />
                </label>
              </div>

              <div className={styles.macroSearchRow}>
                <button
                  type="button"
                  className={styles.macroSearchButton}
                  onClick={handleMarketSearchClick}
                  disabled={!marketSymbolInput.trim() || marketLoading}
                >
                  {marketLoading ? "Loading..." : "Search"}
                </button>
              </div>

              <p className={styles.macroStatus}>
                Selected indicators: {marketCards.length}/{MAX_MARKET_GRAPHS}
              </p>
              {marketSymbolLoading ? (
                <p className={styles.macroStatus}>Searching symbols...</p>
              ) : null}
              {marketLoading ? <p className={styles.macroStatus}>Loading market data...</p> : null}
              {marketError ? <p className={styles.macroError}>{marketError}</p> : null}

              {marketCards.length === 0 ? (
                <p className={styles.macroEmpty}>
                  Search to generate graphs. (Currently limited to 25 requests per day)
                </p>
              ) : (
                <div className={styles.seriesGrid}>
                  {marketCards.map((card) => (
                    <article key={card.marketKey} className={styles.seriesCard}>
                      <button
                        type="button"
                        className={styles.seriesCloseButton}
                        onClick={() => handleRemoveMarketCard(card.marketKey)}
                        aria-label={`Close ${card.name} graph`}
                      >
                        <SquareX size={14} aria-hidden />
                      </button>
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
                <span className={styles.annotation}>
                  TODO: Add global/country expansion (currently USA only)
                </span>
              </div>

              <div className={styles.macroFilterRow}>
                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Country</span>
                  <select
                    className={styles.macroSelect}
                    value={selectedCountry}
                    onChange={(event) => {
                      setSelectedCountry(event.target.value);
                      setMacroCards([]);
                    }}
                  >
                    <option value="USA">USA</option>
                  </select>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Category</span>
                  <select
                    className={styles.macroSelect}
                    value={selectedCategory}
                    onChange={(event) => {
                      setSelectedCategory(event.target.value);
                      setSelectedIndicator("");
                    }}
                    disabled={categories.length === 0}
                  >
                    {categories.length === 0 ? (
                      <option value="">Loading categories...</option>
                    ) : null}
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Indicator (max 8)</span>
                  <select
                    className={styles.macroSelect}
                    value={selectedIndicator}
                    onChange={handleIndicatorSelect}
                    disabled={!selectedCategory || indicators.length === 0}
                  >
                    <option value="">
                      {selectedCategory ? "Choose indicator..." : "Choose category first"}
                    </option>
                    {indicators.map((indicator) => (
                      <option key={indicator.key} value={indicator.key}>
                        {indicator.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>Start Date</span>
                  <input
                    type="date"
                    className={styles.macroDateInput}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    max={endDate || undefined}
                  />
                </label>

                <label className={styles.macroFilterField}>
                  <span className={styles.macroFilterLabel}>End Date</span>
                  <input
                    type="date"
                    className={styles.macroDateInput}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    min={startDate || undefined}
                  />
                </label>

              </div>

              <div className={styles.macroSearchRow}>
                <button
                  type="button"
                  className={styles.macroSearchButton}
                  onClick={handleSearchClick}
                  disabled={!selectedCategory || !selectedIndicator || macroLoading}
                >
                  {macroLoading ? "Loading..." : "Search"}
                </button>
              </div>

              <p className={styles.macroStatus}>
                Selected indicators: {macroCards.length}/{MAX_MACRO_GRAPHS}
              </p>
              {macroLoading ? <p className={styles.macroStatus}>Loading macro data...</p> : null}
              {macroError ? <p className={styles.macroError}>{macroError}</p> : null}

              {macroCards.length === 0 ? (
                <p className={styles.macroEmpty}>
                  Search to generate graphs.
                </p>
              ) : (
                <div className={styles.seriesGrid}>
                  {macroCards.map((card) => (
                    <article key={card.indicatorKey} className={styles.seriesCard}>
                      <button
                        type="button"
                        className={styles.seriesCloseButton}
                        onClick={() => handleRemoveMacroCard(card.indicatorKey)}
                        aria-label={`Close ${card.name} graph`}
                      >
                        <SquareX size={14} aria-hidden />
                      </button>
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



