'use client';

import { use, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import type { Inspection } from '@/lib/supabase';
import { format } from 'date-fns';

type EmailStatus = 'idle' | 'sending' | 'sent' | 'already_sent' | 'no_email' | 'error';

export default function CompletePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>('idle');
  const [resending, setResending] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || '';

  useEffect(() => {
    fetch(`/api/inspections/${params.id}`)
      .then((r) => r.json())
      .then(async (data: Inspection) => {
        // Depot checks are internal — no customer, no sign link, no email invite.
        if (data.location === 'depot') {
          setInspection(data);
          setLoading(false);
          return;
        }

        await fetch(`/api/inspections/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'awaiting_signature' }),
        });
        const inspection = { ...data, status: 'awaiting_signature' as const };
        setInspection(inspection);
        setLoading(false);

        // Auto-send sign invite if customer email present and not already sent
        if (inspection.customer_email) {
          if (inspection.link_sent_at) {
            setEmailStatus('already_sent');
          } else {
            setEmailStatus('sending');
            const res = await fetch(`/api/inspections/${params.id}/send-link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const result = await res.json();
            setEmailStatus(result.sent ? 'sent' : result.already_sent ? 'already_sent' : 'error');
          }
        } else {
          setEmailStatus('no_email');
        }
      });
  }, [params.id]);

  const handleResend = async () => {
    if (!inspection || resending) return;
    setResending(true);
    const res = await fetch(`/api/inspections/${params.id}/send-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resend: true }),
    });
    const result = await res.json();
    setEmailStatus(result.sent ? 'sent' : 'error');
    setResending(false);
  };

  if (loading || !inspection) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (inspection.location === 'depot') {
    return <DepotComplete inspectionId={params.id} inspection={inspection} />;
  }

  const signingUrl = `${baseUrl}/sign/${inspection.customer_sign_token}`;
  const waMessage = encodeURIComponent(`Hi ${inspection.customer_name || 'there'} — your Acme Hire handover certificate is ready to sign:\n\n${signingUrl}`);
  const waUrl = `https://wa.me/?text=${waMessage}`;
  const issueItems = Object.entries(inspection.checklist || {}).filter(([, v]) => v?.status === 'issue');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(signingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Acme Hire Handover Certificate', url: signingUrl });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">Inspection Complete</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto space-y-4">

        {/* Email status card */}
        <EmailStatusCard
          status={emailStatus}
          email={inspection.customer_email}
          customerName={inspection.customer_name}
          onResend={handleResend}
          resending={resending}
        />

        {/* Summary */}
        <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="w-1 h-4 bg-amber-400 rounded-full" />
            <p className="text-xs font-black uppercase tracking-[0.15em] text-black">Summary</p>
          </div>
          <div className="px-4 py-4 space-y-2">
            <Row label="Customer" value={inspection.customer_name || '—'} />
            <Row label="Order" value={inspection.booqable_order_id || inspection.id.substring(0, 8)} />
            <Row label="Units" value={
              (inspection.units || []).length > 0
                ? (inspection.units || []).map((u) => u.serial_id).join(', ')
                : '—'
            } />
            <Row label="Site" value={inspection.site_address || '—'} />
            <Row label="Delivery" value={
              inspection.delivery_date
                ? format(new Date(inspection.delivery_date), 'dd MMM yyyy') + (inspection.delivery_time ? ` at ${inspection.delivery_time}` : '')
                : '—'
            } />
            <Row label="Photos" value={`${(inspection.units || []).reduce((sum, u) => sum + (u.photos || []).length, 0)} total`} />
            {issueItems.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Issues flagged</p>
                {issueItems.map(([key, v]) => (
                  <p key={key} className="text-sm text-amber-700">⚠ {v.notes || key}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manual share options */}
        <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="w-1 h-4 bg-amber-400 rounded-full" />
            <p className="text-xs font-black uppercase tracking-[0.15em] text-black">Share Sign Link Manually</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-sm p-3 break-all text-xs font-mono text-gray-500">
              {signingUrl}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                className="py-3 px-4 border-2 border-black rounded-sm text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2 active:bg-gray-100 transition-colors"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5 10.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Copied
                  </>
                ) : 'Copy Link'}
              </button>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-4 bg-[#25D366] text-white rounded-sm text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2"
              >
                WhatsApp
              </a>
            </div>
            {'share' in navigator && (
              <button
                onClick={handleShare}
                className="w-full py-3 border border-gray-200 rounded-sm text-sm font-medium text-gray-500 active:bg-gray-50"
              >
                Share via SMS / other
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function EmailStatusCard({
  status, email, customerName, onResend, resending,
}: {
  status: EmailStatus;
  email?: string;
  customerName?: string;
  onResend: () => void;
  resending: boolean;
}) {
  if (status === 'sending') {
    return (
      <div className="bg-white border border-gray-200 rounded-sm px-4 py-4 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <p className="text-sm font-semibold text-gray-700">Sending sign link to {email}…</p>
      </div>
    );
  }

  if (status === 'sent' || status === 'already_sent') {
    return (
      <div className="bg-black border border-black rounded-sm px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-400 rounded-sm flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7L5 10.5L12 3.5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-black text-white text-sm uppercase tracking-wide">
              {status === 'sent' ? 'Email sent to customer' : 'Email already sent'}
            </p>
            <p className="text-amber-400 text-xs mt-0.5">{email}</p>
            <p className="text-gray-400 text-xs mt-1">
              {customerName} will receive a link to review and sign their certificate.
            </p>
          </div>
        </div>
        <button
          onClick={onResend}
          disabled={resending}
          className="mt-3 text-xs text-gray-400 underline disabled:opacity-40"
        >
          {resending ? 'Resending…' : 'Resend email'}
        </button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-sm">
        <p className="text-sm font-bold text-red-700">Email failed to send</p>
        <p className="text-xs text-red-600 mt-0.5">Use WhatsApp or copy the link below to share manually.</p>
        <button onClick={onResend} disabled={resending} className="mt-2 text-xs text-red-600 underline">
          {resending ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  if (status === 'no_email') {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 px-4 py-3 rounded-sm">
        <p className="text-sm font-bold text-amber-800">No customer email on this inspection</p>
        <p className="text-xs text-amber-700 mt-0.5">Share the sign link manually using WhatsApp or copy below.</p>
      </div>
    );
  }

  return null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 font-semibold text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function DepotComplete({ inspectionId, inspection }: { inspectionId: string; inspection: Inspection }) {
  const [inspectedBy, setInspectedBy] = useState('');
  const [position, setPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ pdfUrl: string | null } | null>(null);

  const actionWord = inspection.type === 'checkin' ? 'Post-Return Depot Check' : 'Pre-Dispatch Depot Check';
  const issueItems = Object.entries(inspection.checklist || {}).filter(([, v]) => v?.status === 'issue');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedBy.trim()) {
      setError('Enter your name to complete the check.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/complete-depot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectedBy: inspectedBy.trim(), position: position.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete check');
      setResult({ pdfUrl: data.pdfUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">{actionWord}</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="w-1 h-4 bg-amber-400 rounded-full" />
            <p className="text-xs font-black uppercase tracking-[0.15em] text-black">Summary</p>
          </div>
          <div className="px-4 py-4 space-y-2">
            <Row label="Units" value={(inspection.units || []).map((u) => u.serial_id).join(', ') || '—'} />
            <Row label="Order" value={inspection.booqable_order_id || '—'} />
            {issueItems.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Issues flagged</p>
                {issueItems.map(([key, v]) => (
                  <p key={key} className="text-sm text-amber-700">⚠ {v.notes || key}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {result ? (
          <div className="bg-black border border-black rounded-sm px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-400 rounded-sm flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L5 10.5L12 3.5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-black text-white text-sm uppercase tracking-wide">Check complete</p>
                {result.pdfUrl && (
                  <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 text-xs mt-1 underline block">
                    View PDF record
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="w-1 h-4 bg-amber-400 rounded-full" />
              <p className="text-xs font-black uppercase tracking-[0.15em] text-black">Inspected By</p>
            </div>
            <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
              <input
                type="text"
                value={inspectedBy}
                onChange={(e) => setInspectedBy(e.target.value)}
                placeholder="Your name"
                required
                className="w-full border border-gray-200 rounded-sm px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-gray-900"
              />
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Role (optional)"
                className="w-full border border-gray-200 rounded-sm px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-gray-900"
              />
              {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-400 text-black font-black py-4 rounded-sm text-base tracking-widest uppercase disabled:opacity-50 active:bg-amber-500 transition-colors"
              >
                {submitting ? 'Completing…' : 'Complete Check'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
