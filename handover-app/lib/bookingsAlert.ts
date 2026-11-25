import type { Inspection } from '@/lib/supabase';

// Posts a short alert into the private Slack #bookings channel through the
// "Acme Hire #bookings Alert Relay" Zapier workflow (a catch hook). The hook URL
// lives only in the BOOKINGS_ALERT_WEBHOOK_URL env var. Never throws and gives up
// after 5 seconds: an alert must never break a signature or a depot check.
const TIMEOUT_MS = 5000;

export function slackEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

export async function postBookingsAlert(text: string): Promise<boolean> {
  const url = process.env.BOOKINGS_ALERT_WEBHOOK_URL;
  if (!url || !text) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'handover-app', text }),
      signal: controller.signal,
    });
    if (!res.ok) console.error(`#bookings alert failed: ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error('#bookings alert failed:', e);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function issueItems(inspection: Pick<Inspection, 'checklist'>): { key: string; notes?: string }[] {
  return Object.entries(inspection.checklist || {})
    .filter(([, item]) => item?.status === 'issue')
    .map(([key, item]) => ({ key, notes: item?.notes }));
}

const EVENT_LABEL = {
  site: { checkout: 'Handover certificate signed', checkin: 'Collection certificate signed' },
  depot: { checkout: 'Pre-dispatch depot check done', checkin: 'Post-return depot check done' },
} as const;

// One message per completed inspection. Collection sign-off is the trigger for
// deposit release (PRD v3 stage 7), so it says so and starts the 14-day clock.
export function inspectionAlertText(
  inspection: Inspection,
  opts: { signerName?: string; pdfUrl?: string | null; baseUrl?: string }
): string {
  const location = inspection.location ?? 'site';
  const issues = issueItems(inspection);
  const ref = inspection.booqable_order_id ? `Booking ${inspection.booqable_order_id}` : `Record ${inspection.id.slice(0, 8)}`;
  const who = inspection.company_name || inspection.customer_name;
  const units = (inspection.units || []).map((u) => u.serial_id).filter(Boolean).join(', ');
  const icon = issues.length ? ':warning:' : ':white_check_mark:';

  const lines = [
    `${icon} *${EVENT_LABEL[location][inspection.type]}* · ${slackEscape(ref)}${who ? ` · ${slackEscape(who)}` : ''}`,
    units ? `Units: ${slackEscape(units)}` : '',
    opts.signerName ? `${location === 'depot' ? 'Checked' : 'Signed'} by ${slackEscape(opts.signerName)}` : '',
    issues.length
      ? `${issues.length} issue(s) flagged: ${issues.slice(0, 5).map((i) => slackEscape(i.notes ? `${i.key} (${i.notes})` : i.key)).join('; ')}${issues.length > 5 ? '; ...' : ''}`
      : 'No issues flagged.',
  ];

  if (location === 'site' && inspection.type === 'checkin') {
    lines.push(
      issues.length
        ? 'Deposit release: review the damage before Finance refunds. 14-day refund clock starts now.'
        : 'Deposit release can start. 14-day refund clock starts now.'
    );
  }
  if (location === 'depot' && issues.length) {
    lines.push(inspection.type === 'checkout' ? 'Fix before the unit is dispatched.' : 'Unit may need work before its next hire.');
  }

  if (opts.baseUrl) lines.push(`Record: ${opts.baseUrl}/record/${inspection.id}`);
  if (opts.pdfUrl) lines.push(`PDF: ${opts.pdfUrl}`);
  return lines.filter(Boolean).join('\n');
}
