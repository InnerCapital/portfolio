import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId');
  const type = req.nextUrl.searchParams.get('type') || 'checkout';

  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('booqable_order_id', orderId)
    .eq('type', type)
    .eq('location', 'site')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
