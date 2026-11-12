'use client';

import { use, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import type { Inspection } from '@/lib/supabase';
import { format } from 'date-fns';

export default function SignCompletePage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = use(paramsPromise);
  const [inspection, setInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    fetch(`/api/sign/lookup?token=${params.token}`)
      .then((r) => r.json())
      .then(setInspection);
  }, [params.token]);

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">Signed</p>
      </div>

      <div className="px-4 pt-10 pb-10 max-w-lg mx-auto flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6">
          <span className="text-white text-4xl">✓</span>
        </div>

        <h1 className="text-2xl font-black mb-2">Certificate Signed</h1>
        <p className="text-gray-500 mb-8">Thank you. Your handover certificate is now complete and on record.</p>

        {inspection && (
          <div className="w-full bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-8">
            <Row label="Signed By" value={inspection.signer_name || '—'} />
            {inspection.signer_position && <Row label="Position" value={inspection.signer_position} />}
            <Row label="Date" value={
              inspection.signed_at ? format(new Date(inspection.signed_at), 'dd MMMM yyyy, HH:mm') : '—'
            } />
            {inspection.booqable_order_id && (
              <Row label="Order Reference" value={inspection.booqable_order_id} />
            )}
            <Row label="Reference" value={inspection.id.substring(0, 8).toUpperCase()} />
          </div>
        )}

        <div className="w-full space-y-3">
          {inspection?.id && (
            <a
              href={`/record/${inspection.id}`}
              className="block w-full bg-black text-white font-bold py-4 rounded-xl text-base text-center"
            >
              View Certificate
            </a>
          )}
          {inspection?.pdf_url && (
            <a
              href={inspection.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full border-2 border-black text-black font-bold py-4 rounded-xl text-base text-center"
            >
              Download PDF
            </a>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-8 leading-relaxed max-w-xs">
          A copy of this certificate has been sent to your email. Please keep the reference number for your records.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 font-semibold">{value}</span>
    </div>
  );
}
