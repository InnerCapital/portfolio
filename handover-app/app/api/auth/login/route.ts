import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffIdToken } from '@/lib/staffAuth';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { credential } = await req.json().catch(() => ({}));
  if (!credential || typeof credential !== 'string') {
    return NextResponse.json({ error: 'Missing Google credential' }, { status: 400 });
  }

  const check = await verifyStaffIdToken(credential);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const res = NextResponse.json({ ok: true, email: check.email });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(check.email, check.name), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
