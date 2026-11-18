-- 離縁のあとにできたつながりをたどらない(2026-11-18 オーナー決定)
--
-- 離縁した方(と、その離縁で一緒に見えなくした方)が、離縁のあとで再婚するなど新しくつながっても、
-- 本人の家族ネットワーク(家系図・自動追加・内容を見せる判定)にはその先を入れない。
-- 離縁の前からあったつながり(相手の親など)は、これまでどおり家系図に残す。
-- 既存の行は消さない・変えない。

create or replace function public.get_family_network(p_root_user_id uuid)
returns table(user_id uuid, hop_count integer, generation_delta integer, relation text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with recursive network as (
    select fm.linked_user_id as user_id,
           1 as hop_count,
           public.family_generation_delta(fm.relation) as generation_delta,
           fm.relation as relation,
           array[p_root_user_id, fm.linked_user_id] as visited
    from public.family_members fm
    where fm.user_id = p_root_user_id
      and fm.linked_user_id is not null
      and (auth.uid() is null or auth.uid() = p_root_user_id)
      and exists (
        select 1 from public.family_members r
        where r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
      )
    union
    select fm.linked_user_id,
           n.hop_count + 1,
           n.generation_delta + public.family_generation_delta(fm.relation),
           null::text,
           n.visited || fm.linked_user_id
    from network n
    join public.family_members fm on fm.user_id = n.user_id
    where fm.linked_user_id is not null
      and fm.linked_user_id <> all(n.visited)
      and n.hop_count < 30
      and exists (
        select 1 from public.family_members r
        where r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
      )
      -- 離縁した方(と一緒に見えなくした方)からは、離縁のあとにできたつながり(再婚など)をたどらない
      and not exists (
        select 1
        from public.family_content_blocks b
        join public.family_members r
          on r.user_id = fm.linked_user_id and r.linked_user_id = fm.user_id
        where b.user_id = p_root_user_id
          and b.other_user_id = n.user_id
          and greatest(coalesce(fm.linked_at, fm.created_at), coalesce(r.linked_at, r.created_at)) > b.created_at
      )
  )
  select distinct on (user_id) user_id, hop_count, generation_delta, relation
  from network
  order by user_id, hop_count asc;
$function$;
