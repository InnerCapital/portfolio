import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/supabase';
import { jobInspectionId, JOB_WRITABLE_FIELDS } from '@/lib/jobLink';
import { issueItems, postBookingsAlert, slackEscape } from '@/lib/bookingsAlert';

// Fields a job-link user (customer or courier) can see for their own job.
const JOB_VISIBLE_FIELDS =
  'id, booqable_order_id, type, location, status, customer_name, company_name, site_address, delivery_date, delivery_time, power_connected, power_notes, general_notes, checklist, units, ai_overrides, job_link_used_at';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = jobInspectionId(req);

  const { data, error } = await supabase
    .from('inspections')
    .select(jobId ? JOB_VISIBLE_FIELDS : '*')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 });
  if (jobId) {
    if ((data as { job_link_used_at?: string }).job_link_used_at) {
      return NextResponse.json({ error: 'This check has already been submitted' }, { status: 410 });
    }
    return NextResponse.json({ ...(data as object), job_mode: true });
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const jobId = jobInspectionId(req);

  let update: Record<string, unknown> = body;
  if (jobId) {
    const result = await buildJobUpdate(id, body);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    update = result.update;
  }

  const { data, error } = await supabase
    .from('inspections')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(jobId ? JOB_VISIBLE_FIELDS : '*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A job-link user (courier or customer) just submitted their site check.
  if (jobId && 'job_link_used_at' in update && data) {
    await postBookingsAlert(jobCheckAlertText(data as unknown as JobCheck));
  }

  return NextResponse.json(data);
}

interface JobCheck {
  id: string;
  booqable_order_id?: string;
  type: 'checkout' | 'checkin';
  company_name?: string;
  customer_name?: string;
  site_address?: string;
  checklist?: Record<string, { status: 'pass' | 'issue' | null; notes?: string }>;
}

function jobCheckAlertText(check: JobCheck): string {
  const issues = issueItems({ checklist: check.checklist || {} });
  const ref = check.booqable_order_id ? `Booking ${check.booqable_order_id}` : `Record ${check.id.slice(0, 8)}`;
  const who = check.company_name || check.customer_name;
  const what = check.type === 'checkin' ? 'Collection site check submitted' : 'Delivery site check submitted';
  return [
    `${issues.length ? ':warning:' : ':clipboard:'} *${what}* (job link) · ${slackEscape(ref)}${who ? ` · ${slackEscape(who)}` : ''}`,
    check.site_address ? `Site: ${slackEscape(check.site_address)}` : '',
    issues.length
      ? `${issues.length} issue(s) flagged: ${issues.slice(0, 5).map((i) => slackEscape(i.notes ? `${i.key} (${i.notes})` : i.key)).join('; ')}`
      : 'No issues flagged.',
    'Next: staff review, then send the customer their certificate to sign.',
    process.env.NEXT_PUBLIC_BASE_URL ? `Record: ${process.env.NEXT_PUBLIC_BASE_URL}/inspection/${check.id}` : '',
  ].filter(Boolean).join('\n');
}

// A job-link user may only save photos, photo checks, the checklist and notes,
// and only until they submit the checklist (which closes the link).
async function buildJobUpdate(
  id: string,
  body: Record<string, unknown>
): Promise<{ update: Record<string, unknown> } | { error: string; status: number }> {
  const { data: current } = await supabase
    .from('inspections')
    .select('units, job_link_used_at')
    .eq('id', id)
    .single();
  if (!current) return { error: 'Not found', status: 404 };
  if (current.job_link_used_at) return { error: 'This check has already been submitted', status: 410 };

  const update: Record<string, unknown> = {};
  for (const field of JOB_WRITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  if (Array.isArray(body.units)) {
    const incoming = new Map((body.units as Unit[]).map((u) => [u.id, u]));
    update.units = ((current.units as Unit[]) || []).map((u) => {
      const next = incoming.get(u.id);
      return next ? { ...u, photos: next.photos, ai_photo_checks: next.ai_photo_checks } : u;
    });
  }

  // Submitting the checklist is the end of the job-link step.
  if ('checklist' in body) update.job_link_used_at = new Date().toISOString();

  return { update };
}
