import { Logo } from '@/components/Logo';

// Shown to a job-link user (customer or courier) after they submit the checklist.
// The link is closed at this point; Acme Hire staff take it from here.
export default function JobDonePage() {
  return (
    <div className="min-h-screen bg-[var(--ah-black)] text-white flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Logo size="lg" />
        <h1 className="mt-6 font-[family-name:var(--font-condensed)] font-bold text-4xl uppercase tracking-tight">
          Check submitted
        </h1>
        <p className="mt-4 text-sm text-white/70 leading-relaxed">
          Thank you. The photos and checklist have been sent to Acme Hire. You&apos;ll receive the certificate by
          email to review and sign.
        </p>
        <p className="mt-8 text-xs text-white/50">
          Questions? <a className="underline" href="mailto:hello@acmehire.example">hello@acmehire.example</a>
        </p>
      </div>
    </div>
  );
}
