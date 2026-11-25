'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Logo } from '@/components/Logo';
import { StepIndicator } from '@/components/StepIndicator';
import titleBg from '@/public/title-bg.webp';
import type { InspectionType } from '@/lib/supabase';
import { QrScanner, ScanButton } from '@/components/QrScanner';
import { unitTypeFromAssetId } from '@/lib/assetId';

const UNIT_TYPES = ['Street Kitchen', 'Dark Kitchen', 'Bar'];

interface UnitInput {
  _key: string;
  serial_id: string;
  unit_type: string;
}

interface FormData {
  type: InspectionType;
  booqable_order_id: string;
  customer_name: string;
  company_name: string;
  customer_email: string;
  site_address: string;
  rental_start: string;
  rental_end: string;
  delivery_date: string;
  delivery_time: string;
}

const emptyForm: FormData = {
  type: 'checkout',
  booqable_order_id: '',
  customer_name: '',
  company_name: '',
  customer_email: '',
  site_address: '',
  rental_start: '',
  rental_end: '',
  delivery_date: '',
  delivery_time: '',
};

const newUnit = (): UnitInput => ({
  _key: Math.random().toString(36).slice(2),
  serial_id: '',
  unit_type: '',
});

export default function NewInspectionPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [units, setUnits] = useState<UnitInput[]>([newUnit()]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupSuccess, setLookupSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // QR scanning: which unit row the camera is filling, and what the booking says it holds.
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<{ key: string; text: string } | null>(null);
  const [bookedCount, setBookedCount] = useState<number | null>(null);
  const [bookedSerials, setBookedSerials] = useState<string[]>([]);

  const setField = (field: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const setType = (t: InspectionType) => setForm((f) => ({ ...f, type: t }));
  const actionWord = form.type === 'checkin' ? 'Collection' : 'Handover';

  const chooseType = (t: InspectionType) => {
    setType(t);
    setStarted(true);
  };

  const setUnit = (key: string, field: keyof Omit<UnitInput, '_key'>, value: string) =>
    setUnits((prev) => prev.map((u) => u._key === key ? { ...u, [field]: value } : u));

  const addUnit = () => setUnits((prev) => [...prev, newUnit()]);
  const removeUnit = (key: string) => setUnits((prev) => prev.filter((u) => u._key !== key));

  const handleScan = useCallback((assetId: string) => {
    const key = scanFor;
    setScanFor(null);
    if (!key) return;
    const dupeIndex = units.findIndex((u) => u._key !== key && u.serial_id.trim().toUpperCase() === assetId);
    if (dupeIndex !== -1) {
      setScanNote({ key, text: `${assetId} is already added as Unit ${dupeIndex + 1}.` });
      return;
    }
    setScanNote(null);
    const type = unitTypeFromAssetId(assetId);
    setUnits((prev) => prev.map((u) => (u._key === key ? { ...u, serial_id: assetId, unit_type: type || u.unit_type } : u)));
  }, [scanFor, units]);
  const closeScanner = useCallback(() => setScanFor(null), []);

  const onBooking = (serial: string): boolean | null => {
    if (!bookedSerials.length || !serial.trim()) return null;
    return bookedSerials.includes(serial.trim().toUpperCase());
  };

  const handleLookup = async () => {
    if (!form.booqable_order_id.trim()) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupSuccess(false);
    try {
      const res = await fetch(`/api/booqable?orderId=${encodeURIComponent(form.booqable_order_id.trim())}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Lookup failed');
      const data = await res.json();
      setForm((f) => ({
        ...f,
        customer_name: data.customer_name || f.customer_name,
        company_name: data.company_name || f.company_name,
        customer_email: data.customer_email || f.customer_email,
        rental_start: data.rental_start || f.rental_start,
        rental_end: data.rental_end || f.rental_end,
        site_address: data.site_address || f.site_address,
      }));
      setBookedCount(typeof data.booked_unit_count === 'number' ? data.booked_unit_count : null);
      setBookedSerials(
        (data.units || [])
          .map((u: { serial_id?: string }) => (u.serial_id || '').trim().toUpperCase())
          .filter(Boolean),
      );
      // Pre-fill units from Booqable stock items if any were returned
      if (data.units && data.units.length > 0) {
        setUnits(data.units.map((u: { id: string; serial_id: string; unit_type: string }) => ({
          _key: u.id,
          serial_id: u.serial_id,
          unit_type: u.unit_type,
        })));
      }
      setLookupSuccess(true);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed — enter details manually');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_name || !form.site_address || !form.delivery_date) {
      setSubmitError(`Please fill in Customer Name, Site Address and ${actionWord} Date.`);
      return;
    }
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
        ...form,
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
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create inspection');
      const data = await res.json();
      router.push(`/inspection/${data.id}/photos`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  if (!started) {
    return (
      <div className="min-h-screen bg-[var(--ah-black)] text-white flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Background photo — dark overlay keeps it almost not visible */}
        <div className="absolute inset-0">
          <Image src={titleBg} alt="" fill priority className="object-cover opacity-[0.22]" />
          <div className="absolute inset-0 bg-[var(--ah-black)]/75" />
        </div>

        <div className="w-full max-w-sm flex flex-col items-center text-center relative z-10">
          <Logo size="lg" />
          <p className="mt-6 text-[var(--ah-yellow)] text-xs tracking-[0.2em] font-medium uppercase font-[family-name:var(--font-mono-brand)] animate-fade-up" style={{ animationDelay: '0.1s' }}>
            New Inspection
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-condensed)] font-bold text-4xl uppercase tracking-tight animate-fade-up" style={{ animationDelay: '0.18s' }}>
            What&rsquo;s happening today?
          </h1>

          <div className="w-full mt-10 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => chooseType('checkout')}
              className="w-full bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-[var(--ah-yd)] transition-colors animate-fade-up"
              style={{ animationDelay: '0.26s' }}
            >
              Handover
            </button>
            <button
              type="button"
              onClick={() => chooseType('checkin')}
              className="w-full border-2 border-white/30 text-white font-[family-name:var(--font-condensed)] font-bold py-5 rounded-sm text-xl uppercase tracking-wide active:bg-white/10 transition-colors animate-fade-up"
              style={{ animationDelay: '0.34s' }}
            >
              Collection
            </button>
          </div>

          <p className="mt-6 text-xs text-white/40 animate-fade-up" style={{ animationDelay: '0.42s' }}>
            Handover for delivery, Collection for return
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
          New Inspection
        </p>
      </div>

      <div className="px-4 pt-6 pb-12 max-w-lg mx-auto">
        <StepIndicator current={1} total={3} labels={['Details', 'Photos', 'Checklist']} />

        {/* Current moment — with a way back to the title screen */}
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

          {/* Booqable lookup */}
          <Section label="Order Lookup" hint="Optional — auto-fills customer details">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.booqable_order_id}
                onChange={(e) => setField('booqable_order_id', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleLookup())}
                placeholder="Booqable order ID"
                className={inputCls}
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={!form.booqable_order_id.trim() || lookupLoading}
                className="px-4 py-3 bg-amber-400 text-black rounded-sm text-sm font-black uppercase tracking-wide disabled:opacity-40 active:bg-amber-500 whitespace-nowrap transition-colors"
              >
                {lookupLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin inline-block" />
                    Looking up
                  </span>
                ) : 'Look up'}
              </button>
            </div>
            {lookupSuccess && (
              <div className="flex items-start gap-2 mt-2">
                <span className="w-5 h-5 bg-amber-400 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-black">Pre-filled from Booqable</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {units.some((u) => u.serial_id)
                      ? `${units.length} unit${units.length !== 1 ? 's' : ''} loaded — verify serial IDs and add any missing units`
                      : 'Customer details filled — enter unit serial IDs below'}
                  </p>
                </div>
              </div>
            )}
            {lookupError && (
              <p className="text-amber-600 text-sm mt-2 font-medium">{lookupError}</p>
            )}
          </Section>

          {/* Customer details */}
          <Section label="Customer Details">
            <div className="space-y-3">
              <Field label="Customer Name" required>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => setField('customer_name', e.target.value)}
                  placeholder="Full name"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Company Name">
                <input
                  type="text"
                  value={form.company_name}
                  onChange={(e) => setField('company_name', e.target.value)}
                  placeholder="Trading name (if applicable)"
                  className={inputCls}
                />
              </Field>
              <Field label="Customer Email" required>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setField('customer_email', e.target.value)}
                  placeholder="customer@example.com"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Site Address" required>
                <input
                  type="text"
                  value={form.site_address}
                  onChange={(e) => setField('site_address', e.target.value)}
                  placeholder={`Full ${actionWord.toLowerCase()} address`}
                  required
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* Units */}
          <Section
            label="Units on This Order"
            hint={`${units.length} unit${units.length !== 1 ? 's' : ''} added${bookedCount != null ? ` · booking has ${bookedCount}` : ''}`}
          >
            <div className="space-y-3">
              {bookedCount != null && units.filter((u) => u.serial_id.trim()).length !== bookedCount && (
                <p className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2" role="status">
                  The booking has {bookedCount} unit{bookedCount !== 1 ? 's' : ''}; {units.filter((u) => u.serial_id.trim()).length} entered so far. Scan each unit&rsquo;s plate.
                </p>
              )}
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
                      {onBooking(unit.serial_id) === true && (
                        <span className="ml-2 text-green-700 normal-case tracking-normal">&#10003; On this booking</span>
                      )}
                      {onBooking(unit.serial_id) === false && (
                        <span className="ml-2 text-red-600 normal-case tracking-normal">Not on this booking</span>
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
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={unit.serial_id}
                          onChange={(e) => setUnit(unit._key, 'serial_id', e.target.value)}
                          placeholder="e.g. AHUKK250001"
                          className={`${inputCls} font-mono tracking-wider uppercase flex-1 min-w-0`}
                        />
                        <ScanButton onClick={() => { setScanNote(null); setScanFor(unit._key); }} />
                      </div>
                      {scanNote?.key === unit._key && (
                        <p className="text-sm text-red-600 mt-1" role="alert">{scanNote.text}</p>
                      )}
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

          {/* Rental & Handover/Collection */}
          <Section label={`Rental & ${actionWord}`}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rental Start">
                  <input
                    type="date"
                    value={form.rental_start}
                    onChange={(e) => setField('rental_start', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Rental End">
                  <input
                    type="date"
                    value={form.rental_end}
                    onChange={(e) => setField('rental_end', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${actionWord} Date`} required>
                  <input
                    type="date"
                    value={form.delivery_date}
                    onChange={(e) => setField('delivery_date', e.target.value)}
                    required
                    className={inputCls}
                  />
                </Field>
                <Field label={`${actionWord} Time`}>
                  <input
                    type="time"
                    value={form.delivery_time}
                    onChange={(e) => setField('delivery_time', e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>
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
                Start Inspection
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
      {scanFor && <QrScanner onResult={handleScan} onClose={closeScanner} />}
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
