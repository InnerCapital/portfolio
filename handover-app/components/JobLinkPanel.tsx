'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { format } from 'date-fns';

// Staff-only: hand a site check (photos + checklist) to the customer or courier
// via a one-off link. Shown on the photo step for site checks.
export function JobLinkPanel({ inspectionId }: { inspectionId: string }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createLink = async () => {
    setCreating(true);
    setError(null);
    const res = await fetch(`/api/inspections/${inspectionId}/job-link`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Could not create the link');
      setCreating(false);
      return;
    }
    const qr = await QRCode.toDataURL(data.url, { margin: 1, width: 240 });
    setLink({ url: data.url, expiresAt: data.expiresAt, qr });
    setCreating(false);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const message = link
    ? `Acme Hire: please complete the unit check (photos and checklist) using this link: ${link.url}`
    : '';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full mb-5 border-2 border-dashed border-gray-300 text-gray-600 text-sm font-medium py-3 rounded-sm min-h-[44px]"
      >
        Send this check as a job link instead
      </button>
    );
  }

  return (
    <div className="mb-5 border-2 border-gray-200 bg-white rounded-sm p-4">
      <h3 className="font-[family-name:var(--font-condensed)] font-bold text-lg uppercase tracking-tight">Job link</h3>
      <p className="text-sm text-gray-600 mt-1">
        One-off link for the customer or courier to take the photos and complete the checklist on their own phone. It
        works once and expires after 24 hours. Creating a new link cancels the previous one.
      </p>

      {!link && (
        <button
          type="button"
          onClick={createLink}
          disabled={creating}
          className="mt-4 w-full bg-[var(--ah-black)] text-white font-medium py-3 rounded-sm min-h-[44px] disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create job link'}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {link && (
        <div className="mt-4 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={link.qr} alt="QR code for the job link" width={200} height={200} />
          <p className="mt-2 text-xs text-gray-500">
            Valid until {format(new Date(link.expiresAt), 'dd MMM yyyy, HH:mm')}
          </p>
          <p className="mt-3 w-full text-xs break-all bg-gray-50 border border-gray-200 rounded-sm p-2 font-[family-name:var(--font-mono-brand)]">
            {link.url}
          </p>
          <div className="mt-3 w-full grid grid-cols-3 gap-2">
            <a
              href={`sms:?&body=${encodeURIComponent(message)}`}
              className="text-center text-sm font-medium bg-[var(--ah-yellow)] text-[var(--ah-black)] py-3 rounded-sm min-h-[44px]"
            >
              Text
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-medium bg-[var(--ah-yellow)] text-[var(--ah-black)] py-3 rounded-sm min-h-[44px]"
            >
              WhatsApp
            </a>
            <button
              type="button"
              onClick={copy}
              className="text-sm font-medium border-2 border-gray-300 py-3 rounded-sm min-h-[44px]"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500 text-center">
            Once they submit, open this check again to review it and send the certificate for signing.
          </p>
        </div>
      )}
    </div>
  );
}
