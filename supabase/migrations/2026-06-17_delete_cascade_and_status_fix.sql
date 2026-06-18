-- ============================================================
-- Migration: fix Delete Pool + repair stuck "drafting" status
-- Run this once in Supabase Dashboard -> SQL Editor.
-- ============================================================

-- 1. Add ON DELETE CASCADE to draft_picks.pool_id
--    (was the silent blocker on pool deletion)
alter table public.draft_picks
  drop constraint if exists draft_picks_pool_id_fkey;
alter table public.draft_picks
  add constraint draft_picks_pool_id_fkey
  foreign key (pool_id) references public.pools(id) on delete cascade;

-- 2. Add ON DELETE CASCADE to pool_history.pool_id
alter table public.pool_history
  drop constraint if exists pool_history_pool_id_fkey;
alter table public.pool_history
  add constraint pool_history_pool_id_fkey
  foreign key (pool_id) references public.pools(id) on delete cascade;

-- 3. Add DELETE RLS policies so admins can actually delete dependent rows
--    (cascade handles foreign-key integrity but each row is still subject to RLS)
drop policy if exists "Admin can delete picks" on public.draft_picks;
create policy "Admin can delete picks"
  on public.draft_picks for delete using (
    exists (
      select 1 from public.pools
      where id = draft_picks.pool_id and admin_id = auth.uid()
    )
  );

drop policy if exists "Admin can delete history" on public.pool_history;
create policy "Admin can delete history"
  on public.pool_history for delete using (
    exists (
      select 1 from public.pools
      where id = pool_history.pool_id and admin_id = auth.uid()
    )
  );

-- 4. Repair any pools whose status is stuck on "drafting" even though
--    the draft is actually completed (tab-close race on the last pick).
--    This patches your existing pool. The standings page will also
--    self-heal going forward, but this catches the current case
--    immediately without waiting for the admin to reopen standings.
update public.pools p
   set status = 'active'
  from public.drafts d
 where d.pool_id = p.id
   and d.status = 'completed'
   and p.status = 'drafting';
