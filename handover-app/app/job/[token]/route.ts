import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createJobSessionToken, JOB_COOKIE } from '@/lib/session';

// Public entry point for a one-off job link. A valid, unexpired, unsubmitted
// link sets a cookie scoped to that one inspection and opens its photo step.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, job_link_expires_at, job_link_used_at')
    .eq('job_link_token', token)
    .maybeSingle();

  const expiresAt = inspection?.job_link_expires_at ? new Date(inspection.job_link_expires_at) : null;
  const reason = !inspection
    ? 'invalid'
    : inspection.job_link_used_at
      ? 'used'
      : !expiresAt || expiresAt < new Date()
        ? 'expired'
        : null;

  if (reason || !inspection || !expiresAt) {
    return new NextResponse(linkProblemPage(reason ?? 'invalid'), {
      status: 410,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const res = NextResponse.redirect(new URL(`/inspection/${inspection.id}/photos`, req.url));
  res.cookies.set(JOB_COOKIE, await createJobSessionToken(inspection.id, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return res;
}

const MESSAGES: Record<string, string> = {
  invalid: 'This link is not valid. Check you opened the full link, or ask Acme Hire to send a new one.',
  used: 'This check has already been submitted. Thank you. Acme Hire will be in touch.',
  expired: 'This link has expired. Please ask Acme Hire to send a new one.',
};

function linkProblemPage(reason: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acme Hire</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0c0c0c;color:#fff;font-family:system-ui,sans-serif;padding:24px;text-align:center}
.box{max-width:360px}h1{font-size:22px;text-transform:uppercase;letter-spacing:.02em}p{color:rgba(255,255,255,.7);line-height:1.5}a{color:#f9a800}</style></head>
<body><div class="box"><h1>Acme Hire</h1><p>${MESSAGES[reason] ?? MESSAGES.invalid}</p>
<p><a href="mailto:hello@acmehire.example">hello@acmehire.example</a></p></div></body></html>`;
}
