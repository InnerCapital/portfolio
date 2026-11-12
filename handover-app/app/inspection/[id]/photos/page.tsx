'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { format } from 'date-fns';
import { StepIndicator } from '@/components/StepIndicator';
import { JobLinkPanel } from '@/components/JobLinkPanel';
import { getPhotoSlots } from '@/lib/checklist';
import type { InspectionLocation, Photo, Unit } from '@/lib/supabase';

type SlotStatus = 'idle' | 'checking' | 'accepted' | 'failed' | 'overridden' | 'uploading';

interface SlotState {
  status: SlotStatus;
  photo: Photo | null;
  failReason: string | null;
  failCount: number;
  dataUrl: string | null;
}

interface AIOverride {
  unit_serial: string;
  slot: string;
  reason: string;
  overridden_at: string;
}

const emptySlot = (): SlotState => ({
  status: 'idle',
  photo: null,
  failReason: null,
  failCount: 0,
  dataUrl: null,
});

async function checkPhotoQuality(imageBase64: string, mediaType: string, slotLabel: string) {
  try {
    const res = await fetch('/api/ai/check-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mediaType, slotLabel }),
    });
    return (await res.json()) as { passed: boolean; reason: string | null };
  } catch {
    return { passed: true, reason: null };
  }
}

export default function PhotosPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();

  const [units, setUnits] = useState<Unit[]>([]);
  const [location, setLocation] = useState<InspectionLocation>('site');
  // jobMode: opened through a one-off job link. jobSubmittedAt: staff view of a
  // check the customer/courier already submitted through its job link.
  const [jobMode, setJobMode] = useState(false);
  const [jobSubmittedAt, setJobSubmittedAt] = useState<string | null>(null);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  // unitSlots[unitIndex][slotIndex]
  const [unitSlots, setUnitSlots] = useState<SlotState[][]>([]);
  const [overrides, setOverrides] = useState<AIOverride[]>([]);
  const [continuing, setContinuing] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch(`/api/inspections/${params.id}`)
      .then(async (r) => {
        // A job link that has already been submitted: nothing more to do here.
        if (r.status === 410) {
          router.replace(`/inspection/${params.id}/done`);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const u: Unit[] = data.units || [];
        const loc: InspectionLocation = data.location || 'site';
        setUnits(u);
        setLocation(loc);
        setJobMode(Boolean(data.job_mode));
        setJobSubmittedAt(data.job_mode ? null : data.job_link_used_at ?? null);
        setUnitSlots(u.map(() => getPhotoSlots(loc).map(emptySlot)));
        setLoading(false);
      });
  }, [params.id]);

  const photoSlots = getPhotoSlots(location);
  const activeSlots = unitSlots[activeUnitIndex] ?? [];
  const activeUnit = units[activeUnitIndex];

  const acceptedForUnit = (ui: number) =>
    (unitSlots[ui] ?? []).filter((s) => s.photo !== null).length;

  const allUnitsComplete = units.length > 0 &&
    units.every((_, ui) => acceptedForUnit(ui) === photoSlots.length);

  const setSlot = (unitIndex: number, slotIndex: number, patch: Partial<SlotState>) =>
    setUnitSlots((prev) => {
      const next = prev.map((row) => [...row]);
      next[unitIndex][slotIndex] = { ...next[unitIndex][slotIndex], ...patch };
      return next;
    });

  const handleCapture = async (slotIndex: number, file: File) => {
    if (!file || !activeUnit) return;
    const slot = photoSlots[slotIndex];
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const mediaType = file.type || 'image/jpeg';
    const base64 = dataUrl.split(',')[1];

    setSlot(activeUnitIndex, slotIndex, { status: 'checking', failReason: null, dataUrl });

    const { passed, reason } = await checkPhotoQuality(base64, mediaType, slot.label);

    if (passed) {
      await uploadAndAccept(activeUnitIndex, slotIndex, slot, dataUrl, mediaType);
    } else {
      setSlot(activeUnitIndex, slotIndex, {
        status: 'failed',
        failReason: reason,
        failCount: (unitSlots[activeUnitIndex]?.[slotIndex]?.failCount ?? 0) + 1,
        photo: null,
      });
    }
  };

  const uploadAndAccept = async (
    unitIndex: number,
    slotIndex: number,
    slot: { id: string; label: string },
    dataUrl: string,
    _mediaType: string,
  ) => {
    const unit = units[unitIndex];
    setSlot(unitIndex, slotIndex, { status: 'uploading' });
    const photoId = `${unit.serial_id}_${slot.id}_${Date.now()}`;
    const label = `${unit.serial_id} — ${slot.label}`;
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId: params.id, photoId, label, dataUrl }),
      });
      const result = await res.json();
      const photo: Photo = {
        id: photoId,
        label,
        url: result.url || dataUrl,
        driveFileId: result.driveFileId,
        timestamp: new Date().toISOString(),
      };
      setSlot(unitIndex, slotIndex, { status: 'accepted', photo, dataUrl });
    } catch {
      setSlot(unitIndex, slotIndex, { status: 'failed', failReason: 'Upload failed — tap to retry', photo: null });
    }
  };

  const handleOverride = async (slotIndex: number) => {
    const slot = photoSlots[slotIndex];
    const state = activeSlots[slotIndex];
    if (!state.dataUrl || !activeUnit) return;

    const override: AIOverride = {
      unit_serial: activeUnit.serial_id,
      slot: slot.label,
      reason: state.failReason || 'Unknown',
      overridden_at: new Date().toISOString(),
    };
    const updated = [...overrides, override];
    setOverrides(updated);

    await fetch(`/api/inspections/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_overrides: updated }),
    });

    const mediaType = state.dataUrl.split(';')[0].replace('data:', '') || 'image/jpeg';
    setSlot(activeUnitIndex, slotIndex, { status: 'overridden' });
    await uploadAndAccept(activeUnitIndex, slotIndex, slot, state.dataUrl, mediaType);
    setSlot(activeUnitIndex, slotIndex, { status: 'overridden' });
  };

  const handleContinue = async () => {
    setContinuing(true);
    const updatedUnits = units.map((unit, ui) => ({
      ...unit,
      photos: (unitSlots[ui] ?? []).map((s) => s.photo).filter(Boolean) as Photo[],
      ai_photo_checks: (unitSlots[ui] ?? []).map((s, si) => ({
        slot: photoSlots[si].label,
        status: s.status,
        overridden: s.status === 'overridden',
      })),
    }));

    await fetch(`/api/inspections/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: updatedUnits }),
    });
    router.push(`/inspection/${params.id}/checklist`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (jobSubmittedAt) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-[var(--ah-black)] text-white px-4 pt-10 pb-6 border-b-4 border-[var(--ah-yellow)]">
          <Logo inverted />
          <p className="text-[var(--ah-yellow)] text-xs mt-2 tracking-[0.2em] font-medium uppercase font-[family-name:var(--font-mono-brand)]">Photos</p>
        </div>
        <div className="px-4 pt-8 pb-10 max-w-lg mx-auto">
          <h2 className="font-[family-name:var(--font-condensed)] font-bold text-2xl uppercase tracking-tight">
            Submitted through job link
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            The photos and checklist were completed on {format(new Date(jobSubmittedAt), 'dd MMM yyyy, HH:mm')}. Review
            them and send the certificate for signing.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/inspection/${params.id}/complete`)}
            className="mt-6 w-full bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-4 rounded-sm text-lg uppercase tracking-wide min-h-[44px]"
          >
            Continue to signing
          </button>
        </div>
      </div>
    );
  }

  const activeCount = acceptedForUnit(activeUnitIndex);
  const totalPhotos = units.length * photoSlots.length;
  const donePhotos = units.reduce((sum, _, ui) => sum + acceptedForUnit(ui), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[var(--ah-black)] text-white px-4 pt-10 pb-6 border-b-4 border-[var(--ah-yellow)]">
        <Logo inverted />
        <p className="text-[var(--ah-yellow)] text-xs mt-2 tracking-[0.2em] font-medium uppercase font-[family-name:var(--font-mono-brand)]">Photos</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto">
        <StepIndicator current={2} total={3} labels={['Details', 'Photos', 'Checklist']} />

        {!jobMode && location === 'site' && <JobLinkPanel inspectionId={params.id} />}

        {/* Overall progress */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-[family-name:var(--font-condensed)] font-bold text-2xl uppercase tracking-tight">Photo Inspection</h2>
          <span className={`text-sm font-bold px-3 py-1 rounded-sm ${allUnitsComplete ? 'bg-[var(--ah-yellow)] text-[var(--ah-black)]' : 'bg-gray-100 text-gray-600'}`}>
            {donePhotos} / {totalPhotos}
          </span>
        </div>

        {/* Unit tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {units.map((unit, ui) => {
            const done = acceptedForUnit(ui);
            const complete = done === photoSlots.length;
            const active = ui === activeUnitIndex;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => setActiveUnitIndex(ui)}
                className={`flex-shrink-0 px-3 py-2 rounded-sm border-2 text-left transition-colors
                  ${active
                    ? 'bg-[var(--ah-black)] border-[var(--ah-black)] text-white'
                    : complete
                    ? 'bg-[var(--ah-yellow)] border-[var(--ah-yellow)] text-[var(--ah-black)]'
                    : 'bg-white border-gray-200 text-gray-700'}`}
              >
                <div className="flex items-center gap-1.5">
                  {complete && !active && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
                      <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  <span className="text-xs font-black uppercase tracking-wider font-mono">{unit.serial_id}</span>
                </div>
                <p className="text-xs mt-0.5 opacity-70">{unit.unit_type}</p>
                {!complete && (
                  <p className="text-xs mt-0.5 font-semibold opacity-80">{done}/{photoSlots.length}</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Active unit header */}
        {activeUnit && (
          <div className="bg-white border border-gray-200 rounded-sm px-4 py-3 mb-4 flex items-center gap-3">
            <div className="w-1 h-10 bg-[var(--ah-yellow)] rounded-full flex-shrink-0" />
            <div>
              <p className="font-black text-sm uppercase tracking-wider font-mono">{activeUnit.serial_id}</p>
              <p className="text-xs text-gray-500">{activeUnit.unit_type} · {activeCount}/{photoSlots.length} photos</p>
            </div>
          </div>
        )}

        {/* Photo grid for active unit */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {photoSlots.map((slot, slotIndex) => {
            const state = activeSlots[slotIndex] ?? emptySlot();
            const isActive = ['idle', 'failed'].includes(state.status);
            return (
              <div key={slot.id}>
                <input
                  ref={(el) => { fileRefs.current[slotIndex] = el; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCapture(slotIndex, file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => isActive && fileRefs.current[slotIndex]?.click()}
                  disabled={!isActive}
                  className={`w-full aspect-square rounded-sm overflow-hidden relative flex flex-col items-center justify-center border-2 transition-all active:scale-95
                    ${state.status === 'accepted' || state.status === 'overridden' ? 'border-[var(--ah-yellow)]' :
                      state.status === 'failed' ? 'border-red-300 bg-red-50' :
                      state.status === 'checking' || state.status === 'uploading' ? 'border-amber-300 bg-amber-50' :
                      'border-dashed border-gray-300 bg-white'}`}
                >
                  {(state.status === 'checking' || state.status === 'uploading') ? (
                    <div className="flex flex-col items-center gap-1 px-1">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-amber-600 text-center leading-tight">
                        {state.status === 'checking' ? 'Checking…' : 'Uploading…'}
                      </span>
                    </div>
                  ) : (state.status === 'accepted' || state.status === 'overridden') && state.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={state.photo.url} alt={slot.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 px-1">
                      <CameraIcon />
                      <span className="text-xs text-gray-400 text-center leading-tight">{slot.label}</span>
                    </div>
                  )}

                  {state.status === 'accepted' && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--ah-yellow)] rounded-sm flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                  {state.status === 'overridden' && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-gray-800 rounded-sm flex items-center justify-center">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L3.8 7.5L8.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
                <p className="text-xs text-center text-gray-500 mt-1 truncate px-1">{slot.label}</p>
              </div>
            );
          })}
        </div>

        {/* AI failure panels */}
        {activeSlots.map((state, slotIndex) => {
          if (state.status !== 'failed') return null;
          const slot = photoSlots[slotIndex];
          const showOverride = state.failCount >= 2;
          return (
            <div key={slot.id} className="mb-3 bg-red-50 border-l-4 border-red-500 px-3 py-3 rounded-sm">
              <p className="text-sm font-bold text-red-700 mb-1">{slot.label} — Retake needed</p>
              <p className="text-xs text-red-600 mb-3">{state.failReason}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRefs.current[slotIndex]?.click()}
                  className="flex-1 py-2 bg-black text-white text-sm font-bold rounded-sm active:bg-gray-800"
                >
                  Retake
                </button>
                {showOverride && (
                  <button
                    type="button"
                    onClick={() => handleOverride(slotIndex)}
                    className="flex-1 py-2 border-2 border-[var(--ah-yellow)] text-black text-sm font-bold rounded-sm active:bg-amber-50"
                  >
                    Accept anyway
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Next unit / continue */}
        {activeCount === photoSlots.length && activeUnitIndex < units.length - 1 ? (
          <button
            type="button"
            onClick={() => setActiveUnitIndex(activeUnitIndex + 1)}
            className="w-full mt-2 bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-4 rounded-sm text-lg tracking-wide uppercase active:bg-[var(--ah-yd)] flex items-center justify-center gap-2"
          >
            Next Unit — {units[activeUnitIndex + 1]?.serial_id}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <button
            onClick={handleContinue}
            disabled={!allUnitsComplete || continuing}
            className="w-full mt-2 bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-4 rounded-sm text-lg tracking-wide uppercase disabled:opacity-40 active:bg-[var(--ah-yd)] flex items-center justify-center gap-2 transition-colors"
          >
            {continuing ? (
              <>
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : allUnitsComplete ? (
              <>
                Continue to Checklist
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            ) : (
              `${totalPhotos - donePhotos} photos remaining`
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
