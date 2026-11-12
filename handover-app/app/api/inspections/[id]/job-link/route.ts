import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { JOB_LINK_HOURS, jobInspectionId } from '@/lib/jobLink';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// Staff only: create (or replace) the one-off job link for a site check.
// Creating a new link invalidates any previous one for this inspection.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (jobInspectionId(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const { id } = await params;
  const staff = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, location, status, job_link_used_at')
    .eq('id', id)
    .single();
  if (!inspection) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (inspection.location !== 'site') {
    return NextResponse.json({ error: 'Job links are for site checks only' }, { status: 400 });
  }
  if (inspection.job_link_used_at) {
    return NextResponse.json({ error: 'This check has already been submitted through its job link' }, { status: 409 });
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + JOB_LINK_HOURS * 60 * 60 * 1000);

  const { error } = await supabase
    .from('inspections')
    .update({
      job_link_token: token,
      job_link_expires_at: expiresAt.toISOString(),
      job_link_created_by: staff?.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = `${req.nextUrl.origin}/job/${token}`;
  return NextResponse.json({ url, expiresAt: expiresAt.toISOString() });
}
