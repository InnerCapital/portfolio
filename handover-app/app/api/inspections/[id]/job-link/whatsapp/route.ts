import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { jobInspectionId } from '@/lib/jobLink';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';
import { extractOrderDetails, getOrder } from '@/lib/booqable';
import { maskPhone, toInternationalPhone } from '@/lib/phone';
import { postBookingsAlert, slackEscape } from '@/lib/bookingsAlert';

// Staff only. Sends the inspection's current job link by WhatsApp through TimelinesAI,
// from the Acme Hire WhatsApp number. The message and link are built here from the
// stored token, so the browser can only choose who it goes to, never what it says.
//   GET  -> the suggested contact (customer on the Booqable booking)
//   POST -> { phone } sends the link

const TIMELINES_URL = 'https://app.timelines.ai/integrations/api/messages';

async function staffOnly(req: NextRequest) {
  if (jobInspectionId(req)) return null;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

async function loadInspection(id: string) {
  const { data } = await supabase
    .from('inspections')
    .select('id, location, type, booqable_order_id, customer_name, company_name, site_address, job_link_token, job_link_expires_at, job_link_used_at')
    .eq('id', id)
    .single();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await staffOnly(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { id } = await params;
  const inspection = await loadInspection(id);
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let phone = '';
  let name = inspection.customer_name || '';
  let source = '';
  if (inspection.booqable_order_id) {
    try {
      const details = extractOrderDetails(await getOrder(inspection.booqable_order_id));
      const onSite = toInternationalPhone(details.delivery_contact_phone);
      phone = onSite || toInternationalPhone(details.customer_phone) || '';
      source = onSite ? 'delivery contact' : phone ? 'customer' : '';
      name = name || details.customer_name;
    } catch {
      // No booking match: staff type the number in.
    }
  }
  return NextResponse.json({
    name,
    phone,
    source,
    configured: Boolean(process.env.TIMELINES_API_TOKEN),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await staffOnly(req);
  if (!staff) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { id } = await params;

  const token = process.env.TIMELINES_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'WhatsApp sending isn’t set up yet (TIMELINES_API_TOKEN missing).' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const phone = toInternationalPhone(body.phone);
  if (!phone) return NextResponse.json({ error: 'Enter a valid mobile number, e.g. 07700 900123.' }, { status: 400 });

  const inspection = await loadInspection(id);
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (inspection.location !== 'site') return NextResponse.json({ error: 'Job links are for site checks only' }, { status: 400 });
  if (inspection.job_link_used_at) {
    return NextResponse.json({ error: 'This check has already been submitted through its job link' }, { status: 409 });
  }
  if (!inspection.job_link_token || !inspection.job_link_expires_at || new Date(inspection.job_link_expires_at) <= new Date()) {
    return NextResponse.json({ error: 'Create a job link first (or a new one: the last has expired).' }, { status: 409 });
  }

  const url = `${req.nextUrl.origin}/job/${inspection.job_link_token}`;
  const what = inspection.type === 'checkin' ? 'collection' : 'delivery';
  const firstName = String(inspection.customer_name || '').trim().split(/\s+/)[0];
  const text = [
    `Hi${firstName ? ` ${firstName}` : ''}, it's Acme Hire.`,
    `Please complete the ${what} check for your Acme Hire unit${inspection.site_address ? ` at ${inspection.site_address}` : ''}: the photos and a short checklist, about 10 minutes on your phone.`,
    '',
    url,
    '',
    `The link works once and expires ${format(new Date(inspection.job_link_expires_at), "EEE d MMM 'at' HH:mm")}. Reply here if you have any questions.`,
  ].join('\n');

  const payload: Record<string, string> = { phone, text, label: 'Acme Hire job link' };
  if (process.env.TIMELINES_WHATSAPP_ACCOUNT) payload.whatsapp_account_phone = process.env.TIMELINES_WHATSAPP_ACCOUNT;

  let result: { status?: string; message?: string; data?: { message_uid?: string } } = {};
  let ok = false;
  try {
    const res = await fetch(TIMELINES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    result = await res.json().catch(() => ({}));
    ok = res.ok && result.status === 'ok';
  } catch {
    ok = false;
  }

  if (!ok) {
    console.error('job-link whatsapp send failed', { inspection: id, phone: maskPhone(phone), message: result.message });
    return NextResponse.json({ error: `WhatsApp didn't send: ${result.message || 'TimelinesAI could not be reached'}` }, { status: 502 });
  }

  const ref = inspection.booqable_order_id ? `Booking ${inspection.booqable_order_id}` : `Record ${id.slice(0, 8)}`;
  const who = inspection.company_name || inspection.customer_name;
  await postBookingsAlert(
    `:iphone: *Job link sent by WhatsApp* · ${slackEscape(ref)}${who ? ` · ${slackEscape(who)}` : ''}\n` +
      `To ${maskPhone(phone)} by ${slackEscape(staff.email)} (${what} check)`,
  );

  return NextResponse.json({ sent: true, to: maskPhone(phone), messageUid: result.data?.message_uid ?? null });
}
