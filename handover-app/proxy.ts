import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { JOB_COOKIE, SESSION_COOKIE, verifyJobSessionToken, verifySessionToken } from '@/lib/session';
import { JOB_HEADER } from '@/lib/jobLink';

// Everything is staff-only except these. Customer signing pages are reached by
// their private token link; job links by /job/[token]; the maintenance webhook
// is called by Zapier.
const PUBLIC_PATHS = [
  /^\/login$/,
  /^\/api\/auth\//,
  /^\/sign\/[^/]+(\/complete)?$/,
  /^\/api\/sign$/,
  /^\/api\/sign\/lookup$/,
  /^\/job\/[^/]+$/,
  /^\/api\/maintenance\/webhook$/,
];

// What a job-link session can reach, for its own inspection only.
function jobAllows(pathname: string, inspectionId: string): boolean {
  const id = inspectionId.replace(/[^a-zA-Z0-9-]/g, '');
  return (
    new RegExp(`^/inspection/${id}/(photos|checklist|done)$`).test(pathname) ||
    pathname === `/api/inspections/${id}` ||
    pathname === '/api/upload' ||
    pathname === '/api/ai/check-photo' ||
    pathname === '/api/ai/draft-note'
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete(JOB_HEADER);

  if (PUBLIC_PATHS.some((re) => re.test(pathname))) {
    return NextResponse.next({ request: { headers } });
  }

  const staff = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (staff) return NextResponse.next({ request: { headers } });

  const job = await verifyJobSessionToken(request.cookies.get(JOB_COOKIE)?.value);
  if (job && jobAllows(pathname, job.inspectionId)) {
    headers.set(JOB_HEADER, job.inspectionId);
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Staff sign-in required', authError: true }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next internals and static files in /public.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|webp|jpg|jpeg|ico)$).*)'],
};
