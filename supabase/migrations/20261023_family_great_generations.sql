-- 家系図:曾祖父母・ひ孫の続柄を追加する(世代差の計算に使う)。
-- 既存の値の世代差は変えない。新しい値(4つ)を追加するだけ。
-- 閲覧権限(can_view_family_content)には影響しない。
create or replace function public.family_generation_delta(p_relation text)
returns integer
language sql
immutable
as $$
  select case p_relation
    when 'great_grandfather' then -3
    when 'great_grandmother' then -3
    when 'grandfather' then -2
    when 'grandmother' then -2
    when 'father' then -1
    when 'mother' then -1
    when 'uncle' then -1
    when 'aunt' then -1
    when 'older_brother' then 0
    when 'older_sister' then 0
    when 'younger_brother' then 0
    when 'younger_sister' then 0
    when 'spouse' then 0
    when 'son' then 1
    when 'daughter' then 1
    when 'eldest_son' then 1
    when 'eldest_daughter' then 1
    when 'grandson' then 2
    when 'granddaughter' then 2
    when 'great_grandson' then 3
    when 'great_granddaughter' then 3
    else 0
  end;
$$;
