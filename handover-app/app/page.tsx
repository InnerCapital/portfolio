import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--ah-black)] text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Logo size="lg" />
        <h1 className="mt-6 font-[family-name:var(--font-condensed)] font-bold text-4xl uppercase tracking-tight">
          What are you doing?
        </h1>

        <div className="w-full mt-10 flex flex-col gap-3">
          <Link
            href="/inspection/new"
            className="w-full bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-[var(--ah-yd)] transition-colors"
          >
            Site Visit
          </Link>
          <Link
            href="/inspection/new-depot"
            className="w-full border-2 border-white/30 text-white font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-white/10 transition-colors"
          >
            Depot Check
          </Link>
        </div>

        <p className="mt-6 text-xs text-white/40">
          Site Visit for a customer handover or collection, Depot Check for pre-dispatch or post-return
        </p>

        <form action="/api/auth/logout" method="post" className="mt-10">
          <button type="submit" className="text-xs text-white/50 underline min-h-[44px] px-4">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
