import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { finalizeInspection } from '@/lib/finalizeInspection';

// Depot checks (H1 pre-dispatch, C2 post-return) are internal — the depot staff
// member who ran the check closes it out themselves, in one sitting. No customer
// token, no Booqable note, no email — those are all site-flow (app/api/sign) concerns.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { inspectedBy, position } = body;

  if (!inspectedBy) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !inspection) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (inspection.location !== 'depot') {
    return NextResponse.json({ error: 'Not a depot check' }, { status: 400 });
  }

  if (inspection.status === 'signed' || inspection.status === 'complete') {
    return NextResponse.json({ error: 'Already completed' }, { status: 409 });
  }

  try {
    const { pdfUrl } = await finalizeInspection(inspection, {
      signerName: inspectedBy,
      signerPosition: position,
      status: 'signed',
    });
    return NextResponse.json({ success: true, inspectionId: inspection.id, pdfUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
