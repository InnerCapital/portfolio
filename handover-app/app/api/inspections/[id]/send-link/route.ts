import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendSignInviteEmail } from '@/lib/email';
import type { Inspection } from '@/lib/supabase';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  const inspection = data as Inspection;

  if (!inspection.customer_email) {
    return NextResponse.json({ error: 'No customer email on this inspection' }, { status: 422 });
  }

  // Check already sent — return early unless force resend
  const body = await _req.json().catch(() => ({}));
  if (inspection.link_sent_at && !body.resend) {
    return NextResponse.json({ already_sent: true, sent_at: inspection.link_sent_at });
  }

  try {
    await sendSignInviteEmail(inspection);

    await supabase
      .from('inspections')
      .update({ link_sent_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
