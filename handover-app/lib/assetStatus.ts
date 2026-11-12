import { supabase } from '@/lib/supabase';
import type { AssetStatus } from '@/lib/supabase';

// Single source of truth for asset status. 'service_due' is deliberately never
// returned here — it stays a manual-only override (no automatic time-based
// scheduling logic in this phase) and gets silently overwritten the next time
// this runs off a real inspection or maintenance event.
export async function computeAssetStatus(assetId: string): Promise<AssetStatus> {
  const { data: defects } = await supabase
    .from('asset_defects')
    .select('status')
    .eq('asset_id', assetId);

  if (defects?.some((d) => d.status === 'open')) return 'fail';
  if (defects?.some((d) => d.status === 'pending_reinspection')) return 'pending_reinspection';
  return 'pass';
}

export async function recomputeAndPersistAssetStatus(assetId: string): Promise<AssetStatus> {
  const status = await computeAssetStatus(assetId);
  await supabase
    .from('assets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('asset_id', assetId);
  return status;
}
