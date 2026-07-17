-- 회원가입을 열면서, 공용 데이터(레시피/스크롤/원재료/교환/구매) 쓰기 권한을
-- "로그인한 사람 누구나"에서 "관리자 계정 1개(UID 고정)"로 좁히는 마이그레이션.
-- Supabase SQL Editor에서 이 파일 내용을 통째로 붙여넣고 Run 하세요.
--
-- 관리자 UID: Supabase 대시보드 -> Authentication -> Users 에서 확인.

drop policy "auth insert recipes" on public.recipes;
drop policy "auth update recipes" on public.recipes;
drop policy "auth delete recipes" on public.recipes;

drop policy "auth insert scrolls" on public.scrolls;
drop policy "auth update scrolls" on public.scrolls;
drop policy "auth delete scrolls" on public.scrolls;

drop policy "auth insert materials" on public.materials;
drop policy "auth delete materials" on public.materials;

drop policy "auth insert trades" on public.trades;
drop policy "auth update trades" on public.trades;
drop policy "auth delete trades" on public.trades;

drop policy "auth insert purchases" on public.purchases;
drop policy "auth update purchases" on public.purchases;
drop policy "auth delete purchases" on public.purchases;

create policy "admin insert recipes" on public.recipes for insert to authenticated with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin update recipes" on public.recipes for update to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c') with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin delete recipes" on public.recipes for delete to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');

create policy "admin insert scrolls" on public.scrolls for insert to authenticated with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin update scrolls" on public.scrolls for update to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c') with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin delete scrolls" on public.scrolls for delete to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');

create policy "admin insert materials" on public.materials for insert to authenticated with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin delete materials" on public.materials for delete to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');

create policy "admin insert trades" on public.trades for insert to authenticated with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin update trades" on public.trades for update to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c') with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin delete trades" on public.trades for delete to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');

create policy "admin insert purchases" on public.purchases for insert to authenticated with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin update purchases" on public.purchases for update to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c') with check (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
create policy "admin delete purchases" on public.purchases for delete to authenticated using (auth.uid() = '09cb6f2d-8ef1-4dad-9de1-0ac0230c116c');
