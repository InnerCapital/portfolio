-- 005's partial unique index (where zapier_row_id is not null) can't be used as a
-- Postgres ON CONFLICT target the way supabase-js generates upsert(onConflict: 'zapier_row_id').
-- A plain unique index still allows unlimited NULLs (NULL <> NULL in Postgres), which is
-- exactly what's needed for inspection-sourced defects that have no zapier_row_id.
drop index if exists asset_defects_zapier_row_id_idx;
create unique index asset_defects_zapier_row_id_idx on asset_defects(zapier_row_id);
