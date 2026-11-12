import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { InspectionType } from '@/lib/supabase';

const VALID_TYPES: InspectionType[] = ['checkout', 'checkin'];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const type: InspectionType = VALID_TYPES.includes(body.type) ? body.type : 'checkout';
  const location = body.location === 'depot' ? 'depot' : 'site';

  const { data, error } = await supabase
    .from('inspections')
    .insert({
      booqable_order_id: body.booqable_order_id || null,
      type,
      location,
      status: 'draft',
      customer_name: body.customer_name,
      company_name: body.company_name,
      customer_email: body.customer_email || null,
      site_address: body.site_address,
      units: body.units || [],
      rental_start: body.rental_start || null,
      rental_end: body.rental_end || null,
      delivery_date: body.delivery_date || null,
      delivery_time: body.delivery_time || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
