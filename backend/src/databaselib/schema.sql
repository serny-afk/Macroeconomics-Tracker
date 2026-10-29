-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.events (
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text,
  source text,
  published_at timestamp with time zone NOT NULL,
  region text,
  asset_classes ARRAY,
  entities jsonb,
  content text,
  importance_score double precision CHECK (importance_score >= 0::double precision AND importance_score <= 1::double precision),
  topic text,
  sentiment text,
  raw_payload_ref text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT events_pkey PRIMARY KEY (event_id)
);

CREATE TABLE public.themes (
  theme_id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'cooling'::text, 'inactive'::text])),
  heat_score double precision DEFAULT 0,
  first_seen_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone DEFAULT now(),
  region text,
  asset_classes ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT themes_pkey PRIMARY KEY (theme_id)
);

CREATE TABLE public.event_theme_map (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid,
  theme_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT event_theme_map_pkey PRIMARY KEY (id),
  CONSTRAINT event_theme_map_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(event_id),
  CONSTRAINT event_theme_map_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.themes(theme_id)
);

CREATE TABLE public.raw_ingestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  source text,
  url text,
  ingested_at timestamp with time zone DEFAULT now(),
  processed boolean DEFAULT false,
  processed_at timestamp with time zone,
  event_id uuid,
  CONSTRAINT raw_ingestions_pkey PRIMARY KEY (id),
  CONSTRAINT raw_ingestions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(event_id)
);
CREATE INDEX IF NOT EXISTS raw_ingestions_url_idx ON public.raw_ingestions (url);

CREATE TABLE public.memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content_type text CHECK (content_type = ANY (ARRAY['article_chunk'::text, 'summary'::text, 'recommendation_rationale'::text, 'timeline_note'::text])),
  content text NOT NULL,
  embedding USER-DEFINED,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT memory_pkey PRIMARY KEY (id)
);

-- Cached LLM-generated narrative analysis per theme (GET /api/themes/<id>/analysis).
CREATE TABLE public.theme_analyses (
  theme_id uuid NOT NULL,
  analysis text NOT NULL,
  generated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT theme_analyses_pkey PRIMARY KEY (theme_id),
  CONSTRAINT theme_analyses_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.themes(theme_id)
);

-- Cached LLM-generated cross-asset implication chains per theme (GET /api/themes/<id>/chains).
CREATE TABLE public.implication_chains (
  theme_id uuid NOT NULL,
  chains jsonb NOT NULL,
  generated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT implication_chains_pkey PRIMARY KEY (theme_id),
  CONSTRAINT implication_chains_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.themes(theme_id)
);

-- Pre-computed snapshot of a fixed set of macro indicators (FRED) and market
-- symbols (Alpha Vantage), refreshed by get_vitals_snapshot.py. Serves
-- GET /api/vitals/<type> so the API never calls FRED/Alpha Vantage live.
CREATE TABLE public.vitals (
  key text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['macro'::text, 'market'::text])),
  label text NOT NULL,
  category text,
  latest_value double precision,
  previous_value double precision,
  change_percent double precision,
  points double precision[],
  x_labels text[],
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vitals_pkey PRIMARY KEY (key)
);
