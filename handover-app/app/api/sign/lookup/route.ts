import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  // Public (token-gated) endpoint: return only what the customer signing pages
  // show. Internal fields (AI checks, dispute summary, Drive/Booqable ids, the
  // token itself) stay staff-only.
  const { data, error } = await supabase
    .from('inspections')
    .select(
      'id, booqable_order_id, type, location, status, customer_name, company_name, site_address, delivery_date, delivery_time, power_connected, power_notes, general_notes, checklist, units, signer_name, signer_position, signed_at, pdf_url'
    )
    .eq('customer_sign_token', token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
  return NextResponse.json(data);
}
