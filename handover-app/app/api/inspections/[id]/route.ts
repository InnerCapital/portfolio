import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { Unit } from '@/lib/supabase';
import { jobInspectionId, JOB_WRITABLE_FIELDS } from '@/lib/jobLink';

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
  return NextResponse.json(data);
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
