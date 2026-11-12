'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Logo } from '@/components/Logo';
import { GOOGLE_CLIENT_ID } from '@/lib/googleClientId';

interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

// Only allow same-site relative redirects after sign-in.
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (window.google) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady || !window.google || !buttonRef.current) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async ({ credential }) => {
        setSigningIn(true);
        setError(null);
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        if (res.ok) {
          window.location.href = next;
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Sign-in failed, please try again');
        setSigningIn(false);
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 300,
    });
  }, [scriptReady, next]);

  return (
    <div className="min-h-screen bg-[var(--ah-black)] text-white flex flex-col items-center justify-center px-6 py-12">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Logo size="lg" />
        <h1 className="mt-6 font-[family-name:var(--font-condensed)] font-bold text-4xl uppercase tracking-tight">
          Staff sign-in
        </h1>
        <p className="mt-3 text-sm text-white/60">Use your Acme Hire Google account.</p>

        <div className="mt-10 min-h-[44px] flex justify-center" ref={buttonRef} />
        {signingIn && <p className="mt-4 text-sm text-white/60">Signing you in…</p>}
        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--ah-yellow)]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
