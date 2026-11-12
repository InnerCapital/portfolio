import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addOrderNote } from '@/lib/booqable';
import { sendHandoverCertificateEmail } from '@/lib/email';
import { finalizeInspection } from '@/lib/finalizeInspection';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, signerName, signerPosition, signatureDataUrl } = body;

  if (!token || !signerName || !signatureDataUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Look up inspection by token
  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*')
    .eq('customer_sign_token', token)
    .single();

  if (fetchErr || !inspection) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  if (inspection.status === 'signed' || inspection.status === 'complete') {
    return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  }

  let pdfUrl: string | null;
  let signedAt: string;
  try {
    const result = await finalizeInspection(inspection, {
      signerName,
      signerPosition,
      signatureDataUrl,
      status: 'signed',
    });
    pdfUrl = result.pdfUrl;
    signedAt = result.signedAt;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Booqable note
  if (inspection.booqable_order_id) {
    try {
      const noteBody = [
        inspection.type === 'checkin' ? `✅ Collection certificate signed` : `✅ Handover certificate signed`,
        `Signed by: ${signerName}${signerPosition ? ` (${signerPosition})` : ''}`,
        `Date: ${new Date(signedAt).toLocaleString('en-GB')}`,
        `Record: ${process.env.NEXT_PUBLIC_BASE_URL}/record/${inspection.id}`,
        pdfUrl ? `PDF: ${pdfUrl}` : '',
      ].filter(Boolean).join('\n');

      await addOrderNote(inspection.booqable_order_id, noteBody);
    } catch (e) {
      console.error('Booqable note failed:', e);
    }
  }

  // Send email
  try {
    await sendHandoverCertificateEmail({
      ...inspection,
      signer_name: signerName,
      signer_position: signerPosition,
      signature_image_url: signatureDataUrl,
      signed_at: signedAt,
      pdf_url: pdfUrl || undefined,
    });
  } catch (e) {
    console.error('Email failed:', e);
  }

  return NextResponse.json({ success: true, inspectionId: inspection.id, pdfUrl });
}
