import { supabase } from '@/lib/supabase';
import type { ChecklistItem, Inspection } from '@/lib/supabase';
import { CHECKLIST_GROUPS } from '@/lib/checklist';
import { recomputeAndPersistAssetStatus } from '@/lib/assetStatus';

const CHECKLIST_LABELS: Record<string, string> = Object.fromEntries(
  CHECKLIST_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label]))
);

const EVENT_SUMMARY = {
  site: { checkout: 'Delivery inspection', checkin: 'Collection inspection' },
  depot: { checkout: 'Pre-Dispatch Depot Check', checkin: 'Post-Return Depot Check' },
} as const;

// Called after an inspection is signed (both checkout and collection legs write into
// the persistent per-unit register). For each unit on the inspection: make sure the
// asset row exists, diff the checklist against open/pending-reinspection defects for
// that unit, log a timeline event, and recompute the asset's status.
export async function syncAssetsForInspection(inspection: Inspection): Promise<void> {
  const units = inspection.units || [];
  const checklist = inspection.checklist || {};

  for (const unit of units) {
    const assetId = (unit.serial_id || '').trim().toUpperCase();
    if (!assetId) continue;

    await ensureAssetExists(assetId, unit.unit_type);
    await syncDefectsForAsset(assetId, inspection, checklist);

    const status = await recomputeAndPersistAssetStatus(assetId);

    await supabase.from('asset_events').insert({
      asset_id: assetId,
      source: 'inspection',
      inspection_id: inspection.id,
      occurred_at: inspection.signed_at || new Date().toISOString(),
      summary: `${EVENT_SUMMARY[inspection.location ?? 'site'][inspection.type]}${
        inspection.booqable_order_id ? ` (order ${inspection.booqable_order_id})` : ''
      }`,
      resulting_status: status,
    });
  }
}

async function ensureAssetExists(assetId: string, category?: string): Promise<void> {
  const { data: existing } = await supabase
    .from('assets')
    .select('asset_id')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (existing) return; // never clobber a manually-curated existing row

  await supabase.from('assets').insert({ asset_id: assetId, category: category || null });
}

async function syncDefectsForAsset(
  assetId: string,
  inspection: Inspection,
  checklist: Record<string, ChecklistItem>
): Promise<void> {
  const { data: existingDefects } = await supabase
    .from('asset_defects')
    .select('id, source_checklist_item_id, status')
    .eq('asset_id', assetId)
    .in('status', ['open', 'pending_reinspection']);

  const defectByItem = new Map(
    (existingDefects || [])
      .filter((d) => d.source_checklist_item_id)
      .map((d) => [d.source_checklist_item_id as string, d])
  );

  // Defects with no checklist_item_id (e.g. from the maintenance webhook — a sheet
  // row like "fridge door seal damaged" has no app checklist code to match against)
  // can't be resolved by matching a specific item. A fully clean inspection (no
  // issues anywhere) is the only signal available to verify them, so a clean pass
  // resolves any orphaned pending_reinspection defects too.
  const orphanPendingReinspection = (existingDefects || []).filter(
    (d) => !d.source_checklist_item_id && d.status === 'pending_reinspection'
  );
  const checklistIsClean = Object.values(checklist).every((entry) => entry?.status !== 'issue');
  if (checklistIsClean) {
    for (const orphan of orphanPendingReinspection) {
      await supabase
        .from('asset_defects')
        .update({
          status: 'resolved',
          reinspection_verified_at: new Date().toISOString(),
          reinspection_inspection_id: inspection.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orphan.id);
    }
  }

  for (const [itemId, entry] of Object.entries(checklist)) {
    const existing = defectByItem.get(itemId);

    if (entry?.status === 'issue') {
      if (existing) {
        if (existing.status === 'pending_reinspection') {
          // Reopen — the re-check found the same fault still present.
          await supabase
            .from('asset_defects')
            .update({ status: 'open', source_inspection_id: inspection.id, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
        // already 'open' — leave as-is, don't duplicate
      } else {
        await supabase.from('asset_defects').insert({
          asset_id: assetId,
          source_inspection_id: inspection.id,
          source_checklist_item_id: itemId,
          description: entry.notes || CHECKLIST_LABELS[itemId] || itemId,
          status: 'open',
        });
      }
    } else if (existing?.status === 'pending_reinspection') {
      // Only a pending-reinspection defect can be cleared by a fresh inspection —
      // an 'open' defect must go through the maintenance workflow first (hard rule).
      await supabase
        .from('asset_defects')
        .update({
          status: 'resolved',
          reinspection_verified_at: new Date().toISOString(),
          reinspection_inspection_id: inspection.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
  }
}
