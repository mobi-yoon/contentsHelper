-- 계정(로그인 1개) -> 캐릭터(최대 6개) -> 가방/보관함, 그리고 계정 공용 보관함
-- Supabase SQL Editor에서 이 파일 내용을 통째로 붙여넣고 Run 하세요.

create table public.characters (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (user_id, name)
);

create table public.character_items (
  id bigint generated always as identity primary key,
  character_id bigint not null references public.characters(id) on delete cascade,
  container text not null check (container in ('bag', 'storage')),
  item_name text not null,
  qty integer not null default 0,
  unique (character_id, container, item_name)
);

create table public.account_storage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  qty integer not null default 0,
  unique (user_id, item_name)
);

alter table public.characters enable row level security;
alter table public.character_items enable row level security;
alter table public.account_storage enable row level security;

grant select, insert, update, delete on public.characters, public.character_items, public.account_storage to authenticated;

-- 본인 캐릭터만 조회/수정 가능 (공개 조회 없음)
create policy "own characters" on public.characters
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인 캐릭터에 속한 아이템만 조회/수정 가능
create policy "own character items" on public.character_items
  for all to authenticated
  using (exists (select 1 from public.characters c where c.id = character_items.character_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_items.character_id and c.user_id = auth.uid()));

-- 본인 공용 보관함만 조회/수정 가능
create policy "own account storage" on public.account_storage
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
