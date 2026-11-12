'use client';

import { use, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { CHECKLIST_GROUPS } from '@/lib/checklist';
import type { Inspection, Photo } from '@/lib/supabase'; // Photo used in selectedPhoto state
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export default function RecordPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [pairedInspection, setPairedInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [disputeSummary, setDisputeSummary] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/inspections/${params.id}`)
      .then((r) => r.json())
      .then(async (data: Inspection) => {
        setInspection(data);
        if (data.dispute_summary) setDisputeSummary(data.dispute_summary);

        // Look up the paired inspection (checkout ↔ checkin)
        if (data.booqable_order_id) {
          const pairedType = data.type === 'checkout' ? 'checkin' : 'checkout';
          const res = await fetch(`/api/inspections/by-order?orderId=${data.booqable_order_id}&type=${pairedType}`);
          if (res.ok) setPairedInspection(await res.json());
        }
        setLoading(false);
      });
  }, [params.id]);

  const generateDisputeSummary = async () => {
    if (!inspection || !pairedInspection) return;
    setGenerating(true);
    const checkout = inspection.type === 'checkout' ? inspection : pairedInspection;
    const checkin = inspection.type === 'checkin' ? inspection : pairedInspection;

    const res = await fetch('/api/ai/dispute-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout, checkin }),
    });
    const { summary } = await res.json();
    setDisputeSummary(summary);

    await supabase
      .from('inspections')
      .update({ dispute_summary: summary })
      .eq('id', checkin.id);

    setGenerating(false);
  };

  const downloadDisputePdf = async () => {
    if (!inspection || !disputeSummary) return;
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([595, 842]);
    const margin = 40;
    let y = 800;

    page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: rgb(0, 0, 0) });
    page.drawText('ACME HIRE', { x: margin, y: 804, font: boldFont, size: 18, color: rgb(1, 1, 1) });
    page.drawText('Condition Dispute Summary', { x: margin, y: 790, font: regularFont, size: 10, color: rgb(0.95, 0.6, 0.1) });
    y = 770;

    page.drawText(`Order: ${inspection.booqable_order_id || inspection.id}`, { x: margin, y, font: regularFont, size: 9, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, { x: 400, y, font: regularFont, size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 20;

    const words = disputeSummary.split(' ');
    let line = '';
    const lineHeight = 14;
    const maxWidth = 515;
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = regularFont.widthOfTextAtSize(testLine, 10);
      if (width > maxWidth && line) {
        page.drawText(line, { x: margin, y, font: regularFont, size: 10 });
        y -= lineHeight;
        if (y < 60) break;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) page.drawText(line, { x: margin, y, font: regularFont, size: 10 });

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DisputeSummary_${inspection.booqable_order_id || inspection.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <Logo />
        <p className="mt-6 text-red-600">Record not found.</p>
      </div>
    );
  }

  const units = inspection.units || [];
  const issueEntries = Object.entries(inspection.checklist || {}).filter(([, v]) => v?.status === 'issue');
  const hasBothRecords = !!pairedInspection;

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">Handover Record</p>
      </div>

      <div className="px-4 pt-6 pb-16 max-w-lg mx-auto space-y-8">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full
            ${inspection.status === 'signed' || inspection.status === 'complete'
              ? 'bg-green-100 text-green-700'
              : 'bg-amber-100 text-amber-700'}`}>
            {inspection.status === 'signed' || inspection.status === 'complete' ? '✓ Signed' : inspection.status}
          </span>
          <span className="text-sm text-gray-400">
            Ref: {inspection.booqable_order_id || inspection.id.substring(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Order details */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <h2 className="font-bold text-base mb-3">Delivery Details</h2>
          <Row label="Customer" value={inspection.customer_name || '—'} />
          {inspection.company_name && <Row label="Company" value={inspection.company_name} />}
          {units.length > 0 && (
            <Row label="Units" value={units.map((u) => `${u.serial_id} (${u.unit_type})`).join(', ')} />
          )}
          <Row label="Site Address" value={inspection.site_address || '—'} />
          <Row label="Delivery Date" value={
            inspection.delivery_date ? format(new Date(inspection.delivery_date), 'dd MMMM yyyy') : '—'
          } />
          {inspection.delivery_time && <Row label="Time" value={inspection.delivery_time} />}
          {inspection.rental_start && (
            <Row label="Rental Period" value={
              `${format(new Date(inspection.rental_start), 'dd MMM yyyy')} — ${inspection.rental_end ? format(new Date(inspection.rental_end), 'dd MMM yyyy') : '?'}`
            } />
          )}
        </div>

        {/* Photos per unit */}
        {units.length > 0 && (
          <div>
            <h2 className="font-bold text-base mb-3">Photos</h2>
            {units.map((unit) => (
              <div key={unit.id} className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1 h-4 bg-amber-400 rounded-full" />
                  <p className="text-xs font-black uppercase tracking-wider font-mono">{unit.serial_id}</p>
                  <span className="text-xs text-gray-400">{unit.unit_type}</span>
                  <span className="text-xs text-gray-400 ml-auto">{(unit.photos || []).length} photos</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(unit.photos || []).map((photo) => (
                    <button key={photo.id} type="button" onClick={() => setSelectedPhoto(photo)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 active:scale-95 transition-transform">
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
          </div>
        )}

        {/* Checklist */}
        <div>
          <h2 className="font-bold text-base mb-3">Condition Checklist</h2>
          {CHECKLIST_GROUPS.map((group) => (
            <div key={group.id} className="mb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const entry = inspection.checklist?.[item.id];
                  const status = entry?.status ?? null;
                  return (
                    <div key={item.id}
                      className={`flex items-start justify-between py-2 px-3 rounded-lg text-sm
                        ${status === 'issue' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                      <div className="flex-1 pr-2">
                        <span>{item.label}</span>
                        {entry?.notes && <p className="text-amber-600 text-xs mt-0.5">{entry.notes}</p>}
                      </div>
                      <span className={`font-bold flex-shrink-0 ${status === 'pass' ? 'text-green-600' : status === 'issue' ? 'text-amber-600' : 'text-gray-400'}`}>
                        {status === 'pass' ? '✓' : status === 'issue' ? '⚠' : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Issues summary */}
        {issueEntries.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <p className="text-sm font-bold text-amber-800 mb-2">Issues Noted</p>
            {issueEntries.map(([key, v]) => (
              <p key={key} className="text-sm text-amber-700">• {v.notes || key}</p>
            ))}
          </div>
        )}

        {inspection.general_notes && (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-500 mb-1">General Notes</p>
            <p className="text-sm text-gray-700">{inspection.general_notes}</p>
          </div>
        )}

        {/* Signature */}
        {inspection.signed_at && (
          <div className="border border-gray-200 rounded-xl p-4">
            <h2 className="font-bold text-base mb-3">Signature</h2>
            {inspection.signature_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={inspection.signature_image_url} alt="Signature"
                className="border border-gray-200 rounded-lg bg-white max-h-24 mb-3" />
            )}
            <div className="space-y-1">
              <Row label="Signed By" value={inspection.signer_name || '—'} />
              {inspection.signer_position && <Row label="Position" value={inspection.signer_position} />}
              <Row label="Date" value={format(new Date(inspection.signed_at), 'dd MMMM yyyy, HH:mm')} />
            </div>
          </div>
        )}

        {/* AI Dispute Summary — only when both checkout and checkin exist */}
        {hasBothRecords && (
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-base">AI Dispute Summary</h2>
              <span className="text-xs bg-black text-white px-2 py-0.5 rounded-full font-bold">AI</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Generates a factual comparison of delivery vs. collection condition for insurance claims or customer disputes.
            </p>

            {disputeSummary ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{disputeSummary}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(disputeSummary);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex-1 py-2.5 border border-black text-black text-sm font-bold rounded-lg active:bg-gray-100"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={downloadDisputePdf}
                    className="flex-1 py-2.5 bg-black text-white text-sm font-bold rounded-lg active:bg-gray-800"
                  >
                    Download PDF
                  </button>
                </div>
                <button
                  onClick={generateDisputeSummary}
                  disabled={generating}
                  className="w-full py-2 text-xs text-gray-400 underline"
                >
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            ) : (
              <button
                onClick={generateDisputeSummary}
                disabled={generating}
                className="w-full py-3 bg-black text-white font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating…
                  </span>
                ) : 'Generate Dispute Summary'}
              </button>
            )}
          </div>
        )}

        {/* Download certificate */}
        {inspection.pdf_url && (
          <a href={inspection.pdf_url} target="_blank" rel="noopener noreferrer"
            className="block w-full border-2 border-black text-black font-bold py-4 rounded-xl text-base text-center">
            Download Certificate (PDF)
          </a>
        )}
      </div>

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedPhoto.url} alt={selectedPhoto.label}
            className="max-w-full max-h-full rounded-lg object-contain" />
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
