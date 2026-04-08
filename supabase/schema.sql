-- Golf Pool Draft System — Full Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ══════════════════════════════════════════════════════════════
-- 1. PROFILES (extends Supabase auth.users)
-- ══════════════════════════════════════════════════════════════

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email       text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- 2. POOLS
-- ══════════════════════════════════════════════════════════════

create table public.pools (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  tournament      text not null,
  invite_code     text unique not null default substring(gen_random_uuid()::text, 1, 8),
  admin_id        uuid references auth.users(id),
  players_per_team int not null default 4,
  draft_type      text not null default 'snake' check (draft_type in ('regular', 'snake')),
  num_teams       int not null,
  extras_count    int not null default 0,
  timer_seconds   int not null default 120,
  status          text not null default 'open' check (status in ('open', 'drafting', 'active', 'completed')),
  created_at      timestamptz default now()
);

alter table public.pools enable row level security;

create policy "Pools are viewable by members"
  on public.pools for select using (
    exists (
      select 1 from public.pool_members
      where pool_id = id and user_id = auth.uid()
    )
    or admin_id = auth.uid()
  );

create policy "Admin can update pool"
  on public.pools for update using (admin_id = auth.uid());

create policy "Authenticated users can create pools"
  on public.pools for insert with check (auth.uid() is not null);

create policy "Admin can delete pool"
  on public.pools for delete using (admin_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- 3. POOL MEMBERS
-- ══════════════════════════════════════════════════════════════

create table public.pool_members (
  pool_id   uuid references public.pools(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  team_name text,
  draft_position int,
  joined_at timestamptz default now(),
  primary key (pool_id, user_id)
);

alter table public.pool_members enable row level security;

create policy "Members can view pool members"
  on public.pool_members for select using (
    exists (
      select 1 from public.pool_members pm
      where pm.pool_id = pool_members.pool_id and pm.user_id = auth.uid()
    )
  );

create policy "Users can join pools"
  on public.pool_members for insert with check (auth.uid() = user_id);

create policy "Admin can remove members"
  on public.pool_members for delete using (
    exists (
      select 1 from public.pools
      where id = pool_members.pool_id and admin_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 4. DRAFTS
-- ══════════════════════════════════════════════════════════════

create table public.drafts (
  id                    uuid primary key default gen_random_uuid(),
  pool_id               uuid unique references public.pools(id) on delete cascade,
  status                text not null default 'pending' check (status in ('pending', 'active', 'paused', 'completed')),
  draft_order           jsonb not null default '[]',
  current_pick          int not null default 0,
  total_picks           int not null default 0,
  current_turn_deadline timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz
);

alter table public.drafts enable row level security;

create policy "Draft viewable by pool members"
  on public.drafts for select using (
    exists (
      select 1 from public.pool_members
      where pool_id = drafts.pool_id and user_id = auth.uid()
    )
  );

create policy "Admin can manage draft"
  on public.drafts for all using (
    exists (
      select 1 from public.pools
      where id = drafts.pool_id and admin_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 5. DRAFT PICKS
-- ══════════════════════════════════════════════════════════════

create table public.draft_picks (
  id          uuid primary key default gen_random_uuid(),
  draft_id    uuid references public.drafts(id) on delete cascade,
  pool_id     uuid references public.pools(id),
  user_id     uuid references auth.users(id),
  golfer_name text not null,
  pick_number int not null,
  round       int not null,
  is_auto     boolean default false,
  picked_at   timestamptz default now(),
  unique(draft_id, golfer_name),
  unique(draft_id, pick_number)
);

alter table public.draft_picks enable row level security;

create policy "Picks viewable by pool members"
  on public.draft_picks for select using (
    exists (
      select 1 from public.pool_members
      where pool_id = draft_picks.pool_id and user_id = auth.uid()
    )
  );

create policy "Users can make picks"
  on public.draft_picks for insert with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 6. PICK QUEUES
-- ══════════════════════════════════════════════════════════════

create table public.pick_queues (
  user_id        uuid references auth.users(id) on delete cascade,
  pool_id        uuid references public.pools(id) on delete cascade,
  ranked_golfers jsonb not null default '[]',
  updated_at     timestamptz default now(),
  primary key (user_id, pool_id)
);

alter table public.pick_queues enable row level security;

create policy "Users can manage own queue"
  on public.pick_queues for all using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 7. POOL HISTORY
-- ══════════════════════════════════════════════════════════════

create table public.pool_history (
  id              uuid primary key default gen_random_uuid(),
  pool_id         uuid references public.pools(id),
  tournament      text not null,
  final_standings jsonb not null,
  draft_results   jsonb,
  completed_at    timestamptz default now()
);

alter table public.pool_history enable row level security;

create policy "History viewable by pool members"
  on public.pool_history for select using (
    exists (
      select 1 from public.pool_members
      where pool_id = pool_history.pool_id and user_id = auth.uid()
    )
  );

create policy "Admin can create history"
  on public.pool_history for insert with check (
    exists (
      select 1 from public.pools
      where id = pool_history.pool_id and admin_id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 8. ENABLE REALTIME for draft picks (live draft board)
-- ══════════════════════════════════════════════════════════════

alter publication supabase_realtime add table public.draft_picks;
alter publication supabase_realtime add table public.drafts;
