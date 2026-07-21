create table if not exists public.channels (
  id bigint generated always as identity primary key,
  channel_name text not null,
  channel_url text,
  channel_id text not null unique,
  last_video_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id bigint generated always as identity primary key,
  video_id text not null unique,
  channel_id bigint not null references public.channels(id) on delete cascade,
  title text not null,
  video_url text not null,
  published_at timestamptz,
  transcript text,
  summary jsonb,
  processed boolean not null default false,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSED', 'FAILED')),
  transcript_retry_count integer not null default 0,
  next_transcript_retry_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists videos_pending_transcript_idx
  on public.videos (status, next_transcript_retry_at)
  where status = 'PENDING';
