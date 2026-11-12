'use client';

import { use, useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import type { Asset, AssetDefect, AssetEvent } from '@/lib/supabase';
import { format } from 'date-fns';

interface RentalHistoryEntry {
  id: string;
  booqable_order_id?: string;
  type: string;
  status: string;
  customer_name?: string;
  rental_start?: string;
  rental_end?: string;
  delivery_date?: string;
  created_at?: string;
}

interface AssetPageData {
  asset: Asset;
  events: AssetEvent[];
  defects: AssetDefect[];
  rentalHistory: RentalHistoryEntry[];
}

const STATUS_BADGE: Record<string, string> = {
  pass: 'bg-green-100 text-green-700',
  fail: 'bg-red-100 text-red-700',
  pending_reinspection: 'bg-amber-100 text-amber-700',
  service_due: 'bg-amber-100 text-amber-700',
};

const STATUS_LABEL: Record<string, string> = {
  pass: '✓ Pass',
  fail: '✕ Fail',
  pending_reinspection: 'Pending Re-inspection',
  service_due: 'Service Due',
};

export default function AssetPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [data, setData] = useState<AssetPageData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assets/${params.id}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setData(await r.json());
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <Logo />
        <p className="mt-6 text-red-600">Asset not found.</p>
      </div>
    );
  }

  const { asset, events, defects, rentalHistory } = data;
  const openDefects = defects.filter((d) => d.status === 'open' || d.status === 'pending_reinspection');

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">Asset Register</p>
      </div>

      <div className="px-4 pt-6 pb-16 max-w-lg mx-auto space-y-8">
        {/* Header */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-mono font-black uppercase text-lg">{asset.asset_id}</h1>
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${STATUS_BADGE[asset.status] || 'bg-gray-100 text-gray-700'}`}>
              {STATUS_LABEL[asset.status] || asset.status}
            </span>
          </div>
          <div className="space-y-1">
            <Row label="Category" value={asset.category || '—'} />
            <Row label="Manufacturer Serial" value={asset.manufacturer_serial || '—'} />
            <Row label="Depot" value={asset.depot_location || '—'} />
            <Row label="Booqable Status" value={asset.booqable_status || '—'} />
            {asset.build_date && <Row label="Build Date" value={format(new Date(asset.build_date), 'MMMM yyyy')} />}
          </div>
        </div>

        {/* Current condition */}
        <div>
          <h2 className="font-bold text-base mb-3">Current Condition</h2>
          {openDefects.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
              No open defects.
            </div>
          ) : (
            <div className="space-y-2">
              {openDefects.map((d) => (
                <div key={d.id} className="bg-amber-50 border border-amber-300 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-amber-800">{d.description}</p>
                    <span className="text-xs font-bold uppercase text-amber-600">
                      {d.status === 'pending_reinspection' ? 'Pending Re-inspection' : 'Open'}
                    </span>
                  </div>
                  {d.callout_status && (
                    <p className="text-xs text-amber-700">Call-out: {d.callout_status}{d.contractor ? ` — ${d.contractor}` : ''}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inspection timeline */}
        <div>
          <h2 className="font-bold text-base mb-3">Inspection Timeline</h2>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400">No events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${e.source === 'inspection' ? 'bg-black' : 'bg-amber-400'}`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{e.summary}</p>
                      {e.resulting_status && (
                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${STATUS_BADGE[e.resulting_status] || 'bg-gray-100 text-gray-700'}`}>
                          {e.resulting_status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(e.occurred_at), 'dd MMM yyyy, HH:mm')} · {e.source}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Defect history */}
        <div>
          <h2 className="font-bold text-base mb-3">Defect History</h2>
          {defects.length === 0 ? (
            <p className="text-sm text-gray-400">No defects recorded.</p>
          ) : (
            <div className="space-y-2">
              {defects.map((d) => {
                const resolved = d.status === 'resolved';
                return (
                  <div key={d.id} className={`rounded-lg p-3 text-sm ${resolved ? 'bg-gray-50 text-gray-400' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold ${resolved ? '' : 'text-amber-800'}`}>{d.description}</p>
                      <span className="text-xs uppercase font-bold flex-shrink-0 ml-2">{d.status}</span>
                    </div>
                    <div className="text-xs mt-1 space-x-3">
                      {d.contractor && <span>Contractor: {d.contractor}</span>}
                      {d.scheduled_date && <span>Scheduled: {format(new Date(d.scheduled_date), 'dd MMM yyyy')}</span>}
                      {d.completion_date && <span>Completed: {format(new Date(d.completion_date), 'dd MMM yyyy')}</span>}
                      {typeof d.cost === 'number' && <span>£{d.cost.toFixed(2)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rental history — reference only */}
        <div>
          <h2 className="font-bold text-base mb-3">Rental History</h2>
          {rentalHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No rental history recorded.</p>
          ) : (
            <div className="space-y-1">
              {rentalHistory.map((r) => (
                <a key={r.id} href={`/record/${r.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
                  <span className="font-medium">{r.customer_name || r.booqable_order_id || r.id.substring(0, 8)}</span>
                  <span className="text-gray-400 text-xs">
                    {r.type} · {r.rental_start ? format(new Date(r.rental_start), 'dd MMM yyyy') : '—'}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
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
