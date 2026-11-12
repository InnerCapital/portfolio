import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = id.trim().toUpperCase();

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('asset_id', assetId)
    .single();

  if (error || !asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const [{ data: events }, { data: defects }, { data: rentalHistory }] = await Promise.all([
    supabase
      .from('asset_events')
      .select('*')
      .eq('asset_id', assetId)
      .order('occurred_at', { ascending: false }),
    supabase
      .from('asset_defects')
      .select('*')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false }),
    supabase
      .from('inspections')
      .select('id, booqable_order_id, type, status, customer_name, rental_start, rental_end, delivery_date, created_at')
      .contains('units', [{ serial_id: assetId }])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    asset,
    events: events || [],
    defects: defects || [],
    rentalHistory: rentalHistory || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = id.trim().toUpperCase();
  const body = await req.json();

  const { data, error } = await supabase
    .from('assets')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('asset_id', assetId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
