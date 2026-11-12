import { NextRequest, NextResponse } from 'next/server';
import { getOrder, extractOrderDetails } from '@/lib/booqable';

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  try {
    const data = await getOrder(orderId);
    const details = extractOrderDetails(data);
    return NextResponse.json(details);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
