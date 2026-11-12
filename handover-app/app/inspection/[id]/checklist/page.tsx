'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { StepIndicator } from '@/components/StepIndicator';
import { getChecklistGroups } from '@/lib/checklist';
import type { ChecklistItem, InspectionLocation, Photo } from '@/lib/supabase';

type ItemStatus = 'pass' | 'issue' | null;

interface ChecklistState {
  [itemId: string]: ChecklistItem & { ai_drafted?: boolean };
}

interface DraftState {
  [itemId: string]: { loading: boolean; draft: string | null; shown: boolean };
}

// Maps checklist item IDs to the photo label most likely to contain visual evidence
const PHOTO_FOR_ITEM: Record<string, string> = {
  'ext_structural': 'Front',
  'ext_paintwork': 'Front',
  'ext_canopy': 'Front',
  'ext_shutter': 'Front',
  'int_walls': 'Interior — Overview',
  'int_flooring': 'Interior — Overview',
  'int_ceiling': 'Interior — Overview',
  'int_sinks': 'Interior — Overview',
  'int_benches': 'Interior — Overview',
  'eq_fridge_present': 'Interior — Overview',
  'eq_fridge_functional': 'Interior — Overview',
  'eq_extraction_canopy': 'Interior — Overview',
  'eq_extraction_fan': 'Interior — Overview',
  'eq_boiler': 'Interior — Overview',
  'eq_plumbing': 'Interior — Overview',
  'eq_screens': 'Screen 1',
  'eq_tracker': 'Tracker & Starlink',
  'eq_starlink': 'Tracker & Starlink',
  'cln_surfaces': 'Cleanliness — Prep Surfaces & Sinks',
  'cln_sinks': 'Cleanliness — Prep Surfaces & Sinks',
  'cln_floor': 'Cleanliness — Floor',
  'cln_extraction': 'Cleanliness — Extraction Filters',
  'cln_fridge_interior': 'Interior — Overview',
  'cln_general': 'Interior — Overview',
};

export default function ChecklistPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  const [items, setItems] = useState<ChecklistState>({});
  const [drafts, setDrafts] = useState<DraftState>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [location, setLocation] = useState<InspectionLocation>('site');
  const [powerConnected, setPowerConnected] = useState<boolean | null>(null);
  const [powerSuccess, setPowerSuccess] = useState<boolean | null>(null);
  const [powerNotes, setPowerNotes] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Opened through a one-off job link (customer or courier) rather than by staff
  const [jobMode, setJobMode] = useState(false);
  const draftTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load photos from inspection so AI draft-note can reference them
  useEffect(() => {
    fetch(`/api/inspections/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.photos) setPhotos(data.photos);
        if (data.location) setLocation(data.location);
        if (data.job_mode) setJobMode(true);
      });
  }, [params.id]);

  const checklistGroups = getChecklistGroups(location);
  const checklistItemIds = checklistGroups.flatMap((g) => g.items.map((i) => i.id));

  const setStatus = (id: string, status: ItemStatus) => {
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], status } }));

    // Trigger AI draft after 500ms if issue is set and notes are empty
    if (status === 'issue') {
      clearTimeout(draftTimers.current[id]);
      draftTimers.current[id] = setTimeout(() => {
        triggerDraft(id);
      }, 500);
    } else {
      clearTimeout(draftTimers.current[id]);
      setDrafts((prev) => ({ ...prev, [id]: { loading: false, draft: null, shown: false } }));
    }
  };

  const setNotes = (id: string, notes: string) => {
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], notes, ai_drafted: false } }));
  };

  const triggerDraft = useCallback(async (itemId: string) => {
    const photoLabel = PHOTO_FOR_ITEM[itemId];
    const photo = photos.find((p) => p.label === photoLabel);
    if (!photo) return;

    // Only draft if notes are currently empty
    setDrafts((prev) => {
      if (prev[itemId]?.shown) return prev; // already shown/accepted
      return { ...prev, [itemId]: { loading: true, draft: null, shown: false } };
    });

    try {
      // Extract base64 from data URL or use URL directly
      const imageBase64 = photo.url.startsWith('data:')
        ? photo.url.split(',')[1]
        : null;

      if (!imageBase64) {
        setDrafts((prev) => ({ ...prev, [itemId]: { loading: false, draft: null, shown: false } }));
        return;
      }

      const res = await fetch('/api/ai/draft-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mediaType: 'image/jpeg',
          itemLabel: itemId.replace(/_/g, ' '),
        }),
      });
      const { draft } = await res.json();
      setDrafts((prev) => ({
        ...prev,
        [itemId]: { loading: false, draft, shown: true },
      }));
    } catch {
      setDrafts((prev) => ({ ...prev, [itemId]: { loading: false, draft: null, shown: false } }));
    }
  }, [photos]);

  const acceptDraft = (itemId: string) => {
    const draft = drafts[itemId]?.draft;
    if (!draft) return;
    setItems((prev) => ({ ...prev, [itemId]: { ...prev[itemId], notes: draft, ai_drafted: true } }));
    setDrafts((prev) => ({ ...prev, [itemId]: { loading: false, draft: null, shown: false } }));
  };

  const clearDraft = (itemId: string) => {
    setDrafts((prev) => ({ ...prev, [itemId]: { loading: false, draft: null, shown: false } }));
  };

  const allMarked = checklistItemIds.every((id) => items[id]?.status != null) && powerConnected !== null;
  const issueCount = Object.values(items).filter((v) => v?.status === 'issue').length;

  const handleContinue = async () => {
    if (!allMarked) {
      setError('Please mark every item before continuing.');
      return;
    }
    setSaving(true);
    setError('');
    const res = await fetch(`/api/inspections/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checklist: items,
        power_connected: powerConnected,
        power_notes: powerNotes,
        general_notes: generalNotes,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not save the checklist, please try again.');
      setSaving(false);
      return;
    }
    router.push(jobMode ? `/inspection/${params.id}/done` : `/inspection/${params.id}/complete`);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[var(--ah-black)] text-white px-4 pt-10 pb-6 border-b-4 border-[var(--ah-yellow)]">
        <Logo inverted />
        <p className="text-[var(--ah-yellow)] text-xs mt-2 tracking-[0.2em] font-medium uppercase font-[family-name:var(--font-mono-brand)]">Condition Checklist</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto">
        <StepIndicator current={3} total={3} labels={['Details', 'Photos', 'Checklist']} />

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-[family-name:var(--font-condensed)] font-bold text-2xl uppercase tracking-tight">Condition Check</h2>
          {issueCount > 0 && (
            <span className="text-sm font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
              {issueCount} issue{issueCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="space-y-6">
          {checklistGroups.map((group) => (
            <div key={group.id}>
              <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 font-[family-name:var(--font-mono-brand)] mb-3 border-b border-gray-100 pb-2">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => {
                  const entry = items[item.id];
                  const status = entry?.status ?? null;
                  const draftState = drafts[item.id];
                  return (
                    <div key={item.id} className={`rounded-xl border transition-colors ${status === 'issue' ? 'border-amber-300 bg-amber-50' : status === 'pass' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center gap-2 p-3">
                        <span className="flex-1 text-sm font-medium leading-tight">{item.label}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setStatus(item.id, 'pass')}
                            className={`min-w-[56px] py-2 px-3 rounded-lg text-sm font-bold transition-colors
                              ${status === 'pass' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 active:bg-green-100'}`}
                          >
                            ✓ Pass
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(item.id, 'issue')}
                            className={`min-w-[56px] py-2 px-3 rounded-lg text-sm font-bold transition-colors
                              ${status === 'issue' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 active:bg-amber-100'}`}
                          >
                            ⚠ Issue
                          </button>
                        </div>
                      </div>

                      {status === 'issue' && (
                        <div className="px-3 pb-3 space-y-2">
                          {/* AI draft suggestion */}
                          {draftState?.loading && (
                            <div className="flex items-center gap-2 py-2 px-3 bg-white border border-amber-200 rounded-lg">
                              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                              <span className="text-xs text-amber-600">AI analysing photo…</span>
                            </div>
                          )}

                          {draftState?.shown && draftState.draft && !entry?.notes && (
                            <div className="bg-white border border-amber-200 rounded-lg p-2">
                              <p className="text-xs font-bold text-amber-600 mb-1">AI suggested</p>
                              <p className="text-sm text-gray-700 italic mb-2">&ldquo;{draftState.draft}&rdquo;</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => acceptDraft(item.id)}
                                  className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => clearDraft(item.id)}
                                  className="flex-1 py-1.5 border border-gray-300 text-gray-500 text-xs font-bold rounded-lg"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="relative">
                            <input
                              type="text"
                              placeholder={draftState?.loading ? 'Getting AI suggestion…' : 'Describe the issue…'}
                              value={entry?.notes || ''}
                              onChange={(e) => setNotes(item.id, e.target.value)}
                              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                            />
                            {entry?.ai_drafted && (
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-amber-500 font-semibold">AI</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Power Connection */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 font-[family-name:var(--font-mono-brand)] mb-3 border-b border-gray-100 pb-2">
              Power Connection
            </h3>
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Power connection attempted?</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPowerConnected(true)}
                    className={`py-2 px-4 rounded-lg text-sm font-bold ${powerConnected === true ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                    Yes
                  </button>
                  <button type="button" onClick={() => { setPowerConnected(false); setPowerSuccess(null); }}
                    className={`py-2 px-4 rounded-lg text-sm font-bold ${powerConnected === false ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>
                    No
                  </button>
                </div>
              </div>

              {powerConnected === true && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-sm font-medium">Connection successful?</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPowerSuccess(true)}
                      className={`py-2 px-4 rounded-lg text-sm font-bold ${powerSuccess === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      Yes
                    </button>
                    <button type="button" onClick={() => setPowerSuccess(false)}
                      className={`py-2 px-4 rounded-lg text-sm font-bold ${powerSuccess === false ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      No
                    </button>
                  </div>
                </div>
              )}

              <input type="text" placeholder="Power notes (optional)" value={powerNotes}
                onChange={(e) => setPowerNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>

          {/* General Notes */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gray-400 font-[family-name:var(--font-mono-brand)] mb-3">General Notes</h3>
            <textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Any other observations…" rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none" />
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        )}

        <button onClick={handleContinue} disabled={saving}
          className="w-full mt-6 bg-[var(--ah-yellow)] text-[var(--ah-black)] font-[family-name:var(--font-condensed)] font-bold py-4 rounded-xl text-lg uppercase tracking-wide disabled:opacity-40 active:bg-[var(--ah-yd)]">
          {saving ? 'Saving…' : allMarked ? 'Complete Inspection →' : 'Mark all items to continue'}
        </button>
      </div>
    </div>
  );
}
