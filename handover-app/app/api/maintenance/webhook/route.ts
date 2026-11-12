import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { DefectStatus } from '@/lib/supabase';
import { recomputeAndPersistAssetStatus } from '@/lib/assetStatus';

// Zapier-facing sync target for the external maintenance/Schedule L spreadsheet.
// Hard rule: a 'completed' call-out can only move a defect to pending_reinspection,
// never directly to resolved/pass — only a fresh inspection can confirm the fix.
function mapCalloutToDefectStatus(calloutStatus: string): DefectStatus {
  if (calloutStatus === 'completed') return 'pending_reinspection';
  if (calloutStatus === 'cancelled') return 'resolved'; // cancelled call-out means no real defect existed
  return 'open';
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    row_id,
    asset_id,
    description,
    callout_status,
    scheduled_date,
    contractor,
    completion_date,
    cost,
    schedule_l_advisory,
    schedule_l_notes,
  } = body;

  if (!row_id || !asset_id || !description || !callout_status) {
    return NextResponse.json(
      { error: 'Missing required fields: row_id, asset_id, description, callout_status' },
      { status: 400 }
    );
  }

  const assetId = String(asset_id).trim().toUpperCase();

  const { data: existingAsset } = await supabase
    .from('assets')
    .select('asset_id')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (!existingAsset) {
    await supabase.from('assets').insert({ asset_id: assetId });
  }

  const defectStatus = mapCalloutToDefectStatus(callout_status);

  const { data: defect, error } = await supabase
    .from('asset_defects')
    .upsert(
      {
        zapier_row_id: String(row_id),
        asset_id: assetId,
        description,
        callout_status,
        status: defectStatus,
        scheduled_date: scheduled_date || null,
        contractor: contractor || null,
        completion_date: completion_date || null,
        cost: cost ?? null,
        schedule_l_advisory: schedule_l_advisory ?? false,
        schedule_l_notes: schedule_l_notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'zapier_row_id' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assetStatus = await recomputeAndPersistAssetStatus(assetId);

  await supabase.from('asset_events').insert({
    asset_id: assetId,
    source: 'maintenance',
    defect_id: defect.id,
    summary: `Maintenance call-out ${callout_status}${contractor ? ` — ${contractor}` : ''}`,
    resulting_status: assetStatus,
  });

  return NextResponse.json({ ok: true, defectId: defect.id, assetStatus });
}
