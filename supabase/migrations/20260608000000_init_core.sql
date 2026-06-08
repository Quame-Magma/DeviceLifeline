-- DeviceLifeline cloud schema (Supabase Postgres) — SCAFFOLD for later increments.
-- Mirrors the on-device SQLite Device DNA tables for cloud sync, scoped per user via
-- Row-Level Security. NOT used by the Increment 1 local-first slice; included so the
-- cloud schema evolves alongside the app (see docs/32-database-design.md).

create extension if not exists "uuid-ossp";

-- Subscription plans (reference data; seeded in seed.sql).
create table if not exists public.plans (
  id           text primary key,        -- 'free' | 'pro' | 'developer' | 'technician' | 'business'
  name         text not null,
  device_limit integer,                 -- null = unlimited
  created_at   timestamptz not null default now()
);

-- A registered device, owned by an authenticated user.
create table if not exists public.devices (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  hostname    text not null,
  os_name     text not null,
  os_version  text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists idx_devices_owner on public.devices (owner_id);

create table if not exists public.device_dna_snapshots (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  device_id      uuid not null references public.devices (id) on delete cascade,
  captured_at    timestamptz not null,
  schema_version integer not null,
  source         text not null,
  software_count integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_snapshots_owner on public.device_dna_snapshots (owner_id);
create index if not exists idx_snapshots_device on public.device_dna_snapshots (device_id);

create table if not exists public.software_inventory_items (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  snapshot_id      uuid not null references public.device_dna_snapshots (id) on delete cascade,
  name             text not null,
  version          text,
  publisher        text,
  install_date     text,
  source           text not null,
  install_location text
);
create index if not exists idx_software_owner on public.software_inventory_items (owner_id);
create index if not exists idx_software_snapshot on public.software_inventory_items (snapshot_id);

-- Row-Level Security: each user can read/write only their own rows.
alter table public.devices enable row level security;
alter table public.device_dna_snapshots enable row level security;
alter table public.software_inventory_items enable row level security;

create policy "devices_owner_rw" on public.devices
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "snapshots_owner_rw" on public.device_dna_snapshots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "software_owner_rw" on public.software_inventory_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Plans are world-readable reference data.
alter table public.plans enable row level security;
create policy "plans_read_all" on public.plans for select using (true);
