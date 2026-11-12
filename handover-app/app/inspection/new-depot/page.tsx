'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import type { InspectionType } from '@/lib/supabase';

const UNIT_TYPES = ['Street Kitchen', 'Dark Kitchen', 'Bar'];

interface UnitInput {
  _key: string;
  serial_id: string;
  unit_type: string;
}

const newUnit = (): UnitInput => ({
  _key: Math.random().toString(36).slice(2),
  serial_id: '',
  unit_type: '',
});

export default function NewDepotCheckPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [type, setType] = useState<InspectionType>('checkout');
  const [booqableOrderId, setBooqableOrderId] = useState('');
  const [units, setUnits] = useState<UnitInput[]>([newUnit()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const actionWord = type === 'checkin' ? 'Post-Return Depot Check' : 'Pre-Dispatch Depot Check';

  const chooseType = (t: InspectionType) => {
    setType(t);
    setStarted(true);
  };

  const setUnit = (key: string, field: keyof Omit<UnitInput, '_key'>, value: string) =>
    setUnits((prev) => prev.map((u) => u._key === key ? { ...u, [field]: value } : u));

  const addUnit = () => setUnits((prev) => [...prev, newUnit()]);
  const removeUnit = (key: string) => setUnits((prev) => prev.filter((u) => u._key !== key));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const incomplete = units.find((u) => !u.serial_id.trim() || !u.unit_type);
    if (incomplete) {
      setSubmitError('Each unit needs a Serial ID and Unit Type.');
      return;
    }
    const dupes = units.map((u) => u.serial_id.trim().toUpperCase());
    if (new Set(dupes).size !== dupes.length) {
      setSubmitError('Duplicate serial IDs — each unit must have a unique serial ID.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        type,
        location: 'depot',
        booqable_order_id: booqableOrderId.trim() || undefined,
        units: units.map(({ _key, ...u }) => ({
          id: _key,
          serial_id: u.serial_id.trim().toUpperCase(),
          unit_type: u.unit_type,
          photos: [],
        })),
      };
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create depot check');
      const data = await res.json();
      router.push(`/inspection/${data.id}/photos`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  if (!started) {
    return (
      <div className="min-h-screen bg-[var(--ah-black)] text-white flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
          <Logo size="lg" />
          <p className="mt-6 text-[var(--ah-yellow)] text-xs tracking-[0.2em] font-medium uppercase font-[family-name:var(--font-mono-brand)]">
            Depot Check
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-condensed)] font-bold text-4xl uppercase tracking-tight">
            Which check?
          </h1>

          <div className="w-full mt-10 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => chooseType('checkout')}
              className="w-full bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-[var(--ah-yd)] transition-colors"
            >
              Pre-Dispatch
            </button>
            <button
              type="button"
              onClick={() => chooseType('checkin')}
              className="w-full border-2 border-white/30 text-white font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-white/10 transition-colors"
            >
              Post-Return
            </button>
          </div>

          <p className="mt-6 text-xs text-white/40">
            Pre-Dispatch before a unit leaves the depot, Post-Return after it comes back
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-black text-white px-4 pt-10 pb-6 border-b-4 border-amber-400">
        <Logo inverted />
        <p className="text-amber-400 text-xs mt-2 tracking-[0.2em] font-semibold uppercase">
          Depot Check
        </p>
      </div>

      <div className="px-4 pt-6 pb-12 max-w-lg mx-auto">
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-sm px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span className="text-sm font-black uppercase tracking-wide">{actionWord}</span>
          </div>
          <button
            type="button"
            onClick={() => setStarted(false)}
            className="text-xs font-bold uppercase tracking-wide text-gray-400 active:text-black transition-colors"
          >
            Change
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <Section label="Booqable Order" hint="Optional — links this check to an order">
            <input
              type="text"
              value={booqableOrderId}
              onChange={(e) => setBooqableOrderId(e.target.value)}
              placeholder="Booqable order ID"
              className={inputCls}
            />
          </Section>

          <Section label="Units" hint={`${units.length} unit${units.length !== 1 ? 's' : ''} added`}>
            <div className="space-y-3">
              {units.map((unit, i) => (
                <div key={unit._key} className="border border-gray-200 rounded-sm overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs font-black uppercase tracking-wider text-gray-600">
                      Unit {i + 1}
                      {unit.serial_id && (
                        <span className="ml-2 text-amber-600 font-mono normal-case tracking-normal">
                          {unit.serial_id.toUpperCase()}
                        </span>
                      )}
                    </span>
                    {units.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUnit(unit._key)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1 -mr-1"
                        aria-label="Remove unit"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <Field label="Asset Serial ID" required>
                      <input
                        type="text"
                        value={unit.serial_id}
                        onChange={(e) => setUnit(unit._key, 'serial_id', e.target.value)}
                        placeholder="e.g. AHUKK250001"
                        className={`${inputCls} font-mono tracking-wider uppercase`}
                      />
                    </Field>
                    <Field label="Unit Type" required>
                      <select
                        value={unit.unit_type}
                        onChange={(e) => setUnit(unit._key, 'unit_type', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select type…</option>
                        {UNIT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addUnit}
                className="w-full py-3 border-2 border-dashed border-amber-300 rounded-sm text-sm font-black text-amber-600 uppercase tracking-wide active:bg-amber-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Add Another Unit
              </button>
            </div>
          </Section>

          {submitError && (
            <div className="bg-red-50 border-l-4 border-red-500 px-4 py-3 text-red-700 text-sm font-medium rounded-sm">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-amber-400 text-black font-black py-4 rounded-sm text-base tracking-widest uppercase disabled:opacity-50 active:bg-amber-500 transition-colors mt-2 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Creating…
              </>
            ) : (
              <>
                Start Depot Check
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="w-1 h-4 bg-amber-400 rounded-full flex-shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-[0.15em] text-black">{label}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        {label}{required && <span className="text-amber-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full border border-gray-200 rounded-sm px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 bg-white appearance-none text-gray-900 transition-colors';
