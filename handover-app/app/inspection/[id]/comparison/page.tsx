'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import type { Photo, Inspection } from '@/lib/supabase';

interface ComparisonResult {
  label: string;
  hasChange: boolean;
  description: string | null;
  reviewed: boolean;
  confirmed: boolean;
}

export default function ComparisonPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [checkinInspection, setCheckinInspection] = useState<Inspection | null>(null);
  const [checkoutInspection, setCheckoutInspection] = useState<Inspection | null>(null);
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/inspections/${params.id}`)
      .then((r) => r.json())
      .then(async (checkin: Inspection) => {
        setCheckinInspection(checkin);
        if (!checkin.booqable_order_id) return;

        // Find the checkout inspection for the same order
        const res = await fetch(`/api/inspections/by-order?orderId=${checkin.booqable_order_id}&type=checkout`);
        if (res.ok) {
          const checkout: Inspection = await res.json();
          setCheckoutInspection(checkout);
        }
      });
  }, [params.id]);

  const runComparisons = async () => {
    if (!checkinInspection || !checkoutInspection) return;
    setRunning(true);

    const checkinPhotos: Photo[] = (checkinInspection.units || []).flatMap((u) => u.photos || []);
    const checkoutPhotos: Photo[] = (checkoutInspection.units || []).flatMap((u) => u.photos || []);

    const comparisons = await Promise.all(
      checkinPhotos.map(async (checkinPhoto) => {
        const checkoutPhoto = checkoutPhotos.find((p) => p.label === checkinPhoto.label);
        if (!checkoutPhoto) return { label: checkinPhoto.label, hasChange: false, description: null, reviewed: true, confirmed: false };

        const checkoutBase64 = checkoutPhoto.url.startsWith('data:') ? checkoutPhoto.url.split(',')[1] : null;
        const checkinBase64 = checkinPhoto.url.startsWith('data:') ? checkinPhoto.url.split(',')[1] : null;

        if (!checkoutBase64 || !checkinBase64) {
          return { label: checkinPhoto.label, hasChange: false, description: null, reviewed: true, confirmed: false };
        }

        try {
          const res = await fetch('/api/ai/compare-photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              checkoutImageBase64: checkoutBase64,
              checkinImageBase64: checkinBase64,
              mediaType: 'image/jpeg',
              slotLabel: checkinPhoto.label,
            }),
          });
          const { hasChange, description } = await res.json();
          return { label: checkinPhoto.label, hasChange, description, reviewed: !hasChange, confirmed: false };
        } catch {
          return { label: checkinPhoto.label, hasChange: false, description: null, reviewed: true, confirmed: false };
        }
      })
    );

    setResults(comparisons);
    setRunning(false);
  };

  const reviewItem = (label: string, confirmed: boolean) => {
    setResults((prev) => prev.map((r) => r.label === label ? { ...r, reviewed: true, confirmed } : r));
  };

  const allReviewed = results.length > 0 && results.every((r) => r.reviewed);

  const handleContinue = async () => {
    if (!checkinInspection) return;
    setSaving(true);

    const aiComparisons = results.map((r) => ({
      label: r.label,
      has_change: r.confirmed,
      description: r.confirmed ? r.description : null,
    }));

    // Build pre-populated checklist entries from confirmed changes
    const autoChecklist: Record<string, { status: 'issue'; notes: string }> = {};
    results.filter((r) => r.confirmed && r.description).forEach((r) => {
      const key = `ai_damage_${r.label.toLowerCase().replace(/\s+/g, '_')}`;
      autoChecklist[key] = { status: 'issue', notes: r.description! };
    });

    await fetch(`/api/inspections/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ai_comparisons: aiComparisons,
        checklist: autoChecklist,
      }),
    });

    setSaving(false);
    setDone(true);
    router.push(`/inspection/${params.id}/checklist`);
  };

  const changeCount = results.filter((r) => r.hasChange).length;
  const confirmedCount = results.filter((r) => r.confirmed).length;

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">AI Damage Review</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto">
        <h2 className="font-bold text-lg mb-1">Review Potential Changes</h2>
        <p className="text-gray-500 text-sm mb-6">
          AI is comparing delivery and collection photos. Review any flagged differences before completing the checklist.
        </p>

        {!checkoutInspection && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-amber-800">No delivery record found</p>
            <p className="text-xs text-amber-700 mt-1">Cannot run comparison without a matching delivery inspection.</p>
            <button onClick={() => router.push(`/inspection/${params.id}/checklist`)}
              className="mt-3 w-full py-3 bg-black text-white font-bold rounded-xl text-sm">
              Continue to Checklist
            </button>
          </div>
        )}

        {checkoutInspection && results.length === 0 && !running && (
          <button onClick={runComparisons}
            className="w-full py-4 bg-black text-white font-bold rounded-xl text-base mb-6">
            Run AI Comparison
          </button>
        )}

        {running && (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="w-10 h-10 border-3 border-black border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Comparing {(checkinInspection?.units || []).flatMap((u) => u.photos || []).length} photos…</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-4">
              {changeCount > 0 ? (
                <span className="text-sm font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                  {changeCount} potential change{changeCount > 1 ? 's' : ''} detected
                </span>
              ) : (
                <span className="text-sm font-bold px-3 py-1 rounded-full bg-green-100 text-green-700">
                  No changes detected
                </span>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {results.map((result) => (
                <div key={result.label} className={`rounded-xl border p-3 ${result.hasChange ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-sm">{result.label}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${result.hasChange ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                      {result.hasChange ? 'Change detected' : 'No change'}
                    </span>
                  </div>

                  {result.hasChange && result.description && (
                    <p className="text-xs text-amber-700 mb-3">{result.description}</p>
                  )}

                  {result.hasChange && !result.reviewed && (
                    <div className="flex gap-2">
                      <button onClick={() => reviewItem(result.label, true)}
                        className="flex-1 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg">
                        Confirm issue
                      </button>
                      <button onClick={() => reviewItem(result.label, false)}
                        className="flex-1 py-2 border border-gray-300 text-gray-600 text-xs font-bold rounded-lg">
                        Not an issue
                      </button>
                    </div>
                  )}

                  {result.reviewed && result.hasChange && (
                    <p className={`text-xs font-bold ${result.confirmed ? 'text-amber-600' : 'text-gray-400'}`}>
                      {result.confirmed ? '⚠ Issue confirmed — will appear in checklist' : '✓ Dismissed'}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {confirmedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-sm font-semibold text-amber-800">{confirmedCount} issue{confirmedCount > 1 ? 's' : ''} will be pre-filled in the checklist</p>
              </div>
            )}

            <button onClick={handleContinue} disabled={!allReviewed || saving || done}
              className="w-full py-4 bg-black text-white font-bold rounded-xl text-base disabled:opacity-40">
              {saving ? 'Saving…' : 'Continue to Checklist →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
