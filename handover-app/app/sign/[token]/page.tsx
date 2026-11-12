'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { CHECKLIST_GROUPS } from '@/lib/checklist';
import type { Inspection, Photo, Unit } from '@/lib/supabase';
import { format } from 'date-fns';

export default function SignPage({ params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerPosition, setSignerPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<import('signature_pad').default | null>(null);

  useEffect(() => {
    fetch(`/api/sign/lookup?token=${params.token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInspection(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load this certificate.');
        setLoading(false);
      });
  }, [params.token]);

  useEffect(() => {
    if (!inspection || !canvasRef.current) return;
    import('signature_pad').then(({ default: SignaturePad }) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      // Resize canvas to match display size
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(ratio, ratio);

      const pad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255,255,255)',
        penColor: 'rgb(0,0,0)',
      });
      pad.addEventListener('beginStroke', () => setHasDrawn(true));
      sigPadRef.current = pad;
    });
  }, [inspection]);

  const clearSig = () => {
    sigPadRef.current?.clear();
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!signerName.trim()) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!hasDrawn || sigPadRef.current?.isEmpty()) {
      setSubmitError('Please provide your signature.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const signatureDataUrl = sigPadRef.current!.toDataURL('image/png');
    const res = await fetch('/api/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: params.token,
        signerName,
        signerPosition,
        signatureDataUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error || 'Something went wrong. Please try again.');
      setSubmitting(false);
    } else {
      router.push(`/sign/${params.token}/complete`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <Logo />
        <p className="mt-6 text-red-600 text-center">{error || 'Certificate not found.'}</p>
      </div>
    );
  }

  if (inspection.status === 'signed' || inspection.status === 'complete') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4">
          <span className="text-white text-3xl">✓</span>
        </div>
        <Logo />
        <p className="mt-4 text-center font-semibold">This certificate has already been signed.</p>
        <a href={`/record/${inspection.id}`} className="mt-4 text-amber-600 underline text-sm">
          View the signed record
        </a>
      </div>
    );
  }

  const units = inspection.units || [];
  const issueEntries = Object.entries(inspection.checklist || {}).filter(([, v]) => v?.status === 'issue');

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">Handover Certificate</p>
      </div>

      <div className="px-4 pt-6 pb-16 max-w-lg mx-auto space-y-8">
        {/* Order summary */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <h2 className="font-bold text-base mb-3">Delivery Summary</h2>
          <Row label="Units" value={units.length > 0 ? units.map((u) => u.serial_id).join(', ') : '—'} />
          <Row label="Site Address" value={inspection.site_address || '—'} />
          <Row label="Delivery Date" value={
            inspection.delivery_date ? format(new Date(inspection.delivery_date), 'dd MMMM yyyy') : '—'
          } />
          {inspection.booqable_order_id && (
            <Row label="Order Reference" value={inspection.booqable_order_id} />
          )}
        </div>

        {/* Photos per unit */}
        <div>
          <h2 className="font-bold text-base mb-3">Photographic Condition Record</h2>
          {units.map((unit) => (
            <div key={unit.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1 h-4 bg-amber-400 rounded-full" />
                <p className="text-xs font-black uppercase tracking-wider font-mono">{unit.serial_id}</p>
                <span className="text-xs text-gray-400">{unit.unit_type}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(unit.photos || []).map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setSelectedPhoto(photo)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 active:scale-95 transition-transform"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                      <p className="text-white text-xs truncate">{photo.label.split(' — ')[1] ?? photo.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-1 text-center">Tap any photo to view full size</p>
        </div>

        {/* Condition summary */}
        <div>
          <h2 className="font-bold text-base mb-3">Condition Summary</h2>
          {CHECKLIST_GROUPS.map((group) => {
            const groupItems = group.items.map((item) => ({
              item,
              entry: inspection.checklist?.[item.id],
            }));
            return (
              <div key={group.id} className="mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{group.label}</p>
                <div className="space-y-1">
                  {groupItems.map(({ item, entry }) => {
                    const status = entry?.status ?? null;
                    return (
                      <div key={item.id}
                        className={`flex items-start justify-between py-2 px-3 rounded-lg text-sm
                          ${status === 'issue' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                        <span className="flex-1 pr-2">{item.label}</span>
                        <span className={`font-bold flex-shrink-0 ${status === 'pass' ? 'text-green-600' : status === 'issue' ? 'text-amber-600' : 'text-gray-400'}`}>
                          {status === 'pass' ? '✓' : status === 'issue' ? '⚠' : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {issueEntries.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mt-2">
              <p className="text-sm font-bold text-amber-800 mb-2">Issues noted at delivery:</p>
              {issueEntries.map(([key, v]) => (
                <p key={key} className="text-sm text-amber-700">• {v.notes || key}</p>
              ))}
            </div>
          )}

          {inspection.general_notes && (
            <div className="bg-gray-50 rounded-xl p-4 mt-2">
              <p className="text-xs font-bold text-gray-500 mb-1">General Notes</p>
              <p className="text-sm text-gray-700">{inspection.general_notes}</p>
            </div>
          )}
        </div>

        {/* Acknowledgement */}
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Declaration</p>
          <div className="text-sm text-gray-700 space-y-2 leading-relaxed">
            <p className="font-semibold">By signing below, you confirm that:</p>
            <p>(a) The Acme Hire unit(s) have been delivered, installed, and commissioned as described above.</p>
            <p>(b) The condition of the unit(s) is as recorded in this certificate, subject to any notes stated above.</p>
            <p>(c) Acme Hire has taken photographs of the unit condition at delivery, which form part of the agreed condition evidence.</p>
            <p>(d) Responsibility for the unit(s), including risk of loss or damage, transfers to you upon signature of this certificate.</p>
            <p>(e) You have read and accept all obligations in the Master Rental Agreement.</p>
          </div>
        </div>

        {/* Signature section */}
        <div>
          <h2 className="font-bold text-base mb-4">Sign Below</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Full Name *</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Your full name"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Position / Role</label>
              <input
                type="text"
                value={signerPosition}
                onChange={(e) => setSignerPosition(e.target.value)}
                placeholder="e.g. Operations Manager"
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">Signature *</label>
                <button type="button" onClick={clearSig} className="text-xs text-gray-400 underline">Clear</button>
              </div>
              <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none"
                  style={{ height: '160px' }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">Sign with your finger</p>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            {submitError}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-black text-white font-bold py-4 rounded-xl text-base tracking-wide disabled:opacity-50 active:bg-gray-800"
        >
          {submitting ? 'Submitting…' : 'Sign & Confirm'}
        </button>

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          By tapping &ldquo;Sign &amp; Confirm&rdquo; you agree to the declaration above and confirm you have authority to sign on behalf of the named customer.
        </p>
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedPhoto.url}
            alt={selectedPhoto.label}
            className="max-w-full max-h-full rounded-lg object-contain"
          />
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-white text-sm font-semibold">{selectedPhoto.label}</p>
            <p className="text-gray-400 text-xs mt-1">Tap to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 font-semibold text-right max-w-[60%]">{value}</span>
    </div>
  );
}
