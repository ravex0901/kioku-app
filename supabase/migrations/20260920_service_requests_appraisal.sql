-- 品物ごとの「査定を依頼する」ボタン対応。
-- 依頼はすべて自社(運営)宛てで、既存の service_requests テーブルをそのまま利用する。
-- service_type = 'appraisal' の場合、item_id で対象の品物を紐づける。
-- Supabase の SQL Editor で1回だけ実行してください。

alter table public.service_requests
  add column if not exists item_id uuid references public.items(id) on delete set null;

create index if not exists service_requests_item_id_idx
  on public.service_requests(item_id);
