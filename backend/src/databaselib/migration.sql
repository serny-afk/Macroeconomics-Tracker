-- Runnable migration for a fresh Supabase project.
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Unlike schema.sql (documentation only), this is meant to be executed as-is.

-- ── Extensions ──────────────────────────────────────────────────────────────
-- gen_random_uuid() is built into Postgres 13+ (Supabase's default), no
-- extension needed for it.

create extension if not exists vector with schema extensions;

-- ── Core tables ─────────────────────────────────────────────────────────────

create table public.events (
  event_id uuid not null default gen_random_uuid(),
  event_type text,
  source text,
  published_at timestamp with time zone not null,
  region text,
  asset_classes text[],
  entities jsonb,
  content text,
  importance_score double precision check (importance_score >= 0 and importance_score <= 1),
  topic text,
  sentiment text,
  raw_payload_ref text,
  created_at timestamp with time zone default now(),
  constraint events_pkey primary key (event_id)
);

create table public.themes (
  theme_id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  status text default 'active' check (status = any (array['active', 'cooling', 'inactive'])),
  heat_score double precision default 0,
  first_seen_at timestamp with time zone default now(),
  last_seen_at timestamp with time zone default now(),
  region text,
  asset_classes text[],
  created_at timestamp with time zone default now(),
  constraint themes_pkey primary key (theme_id)
);

create table public.event_theme_map (
  id uuid not null default gen_random_uuid(),
  event_id uuid references public.events(event_id),
  theme_id uuid references public.themes(theme_id),
  created_at timestamp with time zone default now(),
  constraint event_theme_map_pkey primary key (id)
);

create table public.raw_ingestions (
  id uuid not null default gen_random_uuid(),
  storage_path text not null,
  source text,
  ingested_at timestamp with time zone default now(),
  processed boolean default false,
  processed_at timestamp with time zone,
  event_id uuid references public.events(event_id),
  constraint raw_ingestions_pkey primary key (id)
);

create table public.memory (
  id uuid not null default gen_random_uuid(),
  content_type text check (content_type = any (array['article_chunk', 'summary', 'recommendation_rationale', 'timeline_note'])),
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb,
  created_at timestamp with time zone default now(),
  constraint memory_pkey primary key (id)
);

create table public.theme_analyses (
  theme_id uuid not null references public.themes(theme_id),
  analysis text not null,
  generated_at timestamp with time zone default now(),
  constraint theme_analyses_pkey primary key (theme_id)
);

create table public.implication_chains (
  theme_id uuid not null references public.themes(theme_id),
  chains jsonb not null,
  generated_at timestamp with time zone default now(),
  constraint implication_chains_pkey primary key (theme_id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

create index events_published_at_idx on public.events (published_at desc);
create index events_topic_idx on public.events (topic);
create index themes_status_heat_idx on public.themes (status, heat_score desc);
create index event_theme_map_event_id_idx on public.event_theme_map (event_id);
create index event_theme_map_theme_id_idx on public.event_theme_map (theme_id);
create index memory_embedding_idx on public.memory using hnsw (embedding extensions.vector_cosine_ops);

-- ── RPC: nearest-neighbor search over the memory store ───────────────────────
-- Called by databaselib/db.py::search_memory(). Required for the pgvector
-- retrieval path — nothing calls this table without it.

create or replace function match_memory(
  query_embedding extensions.vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  content_type text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    content_type,
    metadata,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  from public.memory
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Storage buckets can't be created via SQL. After running this migration,
-- go to Storage in the Supabase dashboard and create a bucket named
-- "raw-payloads" (private is fine — the backend uses the service key).
