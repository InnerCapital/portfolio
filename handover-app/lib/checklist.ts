import type { InspectionLocation } from '@/lib/supabase';

export interface ChecklistGroup {
  id: string;
  label: string;
  items: { id: string; label: string }[];
  appliesTo?: InspectionLocation[];
}

export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    id: 'exterior',
    label: 'Exterior',
    items: [
      { id: 'ext_structural', label: 'No visible structural damage' },
      { id: 'ext_paintwork', label: 'External paintwork in acceptable condition' },
      { id: 'ext_canopy', label: 'Weather canopy present and intact' },
      { id: 'ext_shutter', label: 'Steel shutter operational' },
    ],
  },
  {
    id: 'interior',
    label: 'Interior',
    items: [
      { id: 'int_walls', label: 'Walls and cladding in good condition' },
      { id: 'int_flooring', label: 'Flooring undamaged and level' },
      { id: 'int_ceiling', label: 'Ceiling grid and LED panels functioning' },
      { id: 'int_sinks', label: 'Sinks installed and undamaged' },
      { id: 'int_benches', label: 'Stainless steel benches present' },
    ],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    items: [
      { id: 'eq_fridge_present', label: 'Refrigeration units present' },
      { id: 'eq_fridge_functional', label: 'Refrigeration visually functional' },
      { id: 'eq_extraction_canopy', label: 'Extraction canopy installed' },
      { id: 'eq_extraction_fan', label: 'Extraction fan operational' },
      { id: 'eq_boiler', label: 'Water boiler installed' },
      { id: 'eq_plumbing', label: 'Plumbing connections visually intact' },
      { id: 'eq_screens', label: 'Menu screens present and undamaged' },
      { id: 'eq_tracker', label: 'GPS tracker present' },
      { id: 'eq_starlink', label: 'Starlink unit present' },
    ],
  },
  {
    id: 'cleanliness',
    label: 'Cleanliness',
    appliesTo: ['site'],
    items: [
      { id: 'cln_surfaces', label: 'Food prep surfaces clean, no residue' },
      { id: 'cln_sinks', label: 'Sinks clean, no food debris or residue' },
      { id: 'cln_floor', label: 'Floor clean, no spillage or residue' },
      { id: 'cln_extraction', label: 'Extraction canopy and filters clean, no grease build-up' },
      { id: 'cln_fridge_interior', label: 'Refrigeration units clean internally' },
      { id: 'cln_general', label: 'Unit generally clean and hygienic (no odours, stains, pest signs)' },
    ],
  },
];

export const ALL_CHECKLIST_ITEM_IDS = CHECKLIST_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export function getChecklistGroups(location: InspectionLocation): ChecklistGroup[] {
  return CHECKLIST_GROUPS.filter((g) => !g.appliesTo || g.appliesTo.includes(location));
}

export interface PhotoSlot {
  id: string;
  label: string;
  appliesTo?: InspectionLocation[];
}

export const PHOTO_SLOTS: PhotoSlot[] = [
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Left Side' },
  { id: 'right', label: 'Right Side' },
  { id: 'interior_overview', label: 'Interior — Overview' },
  { id: 'screen_1', label: 'Screen 1', appliesTo: ['site'] },
  { id: 'screen_2', label: 'Screen 2', appliesTo: ['site'] },
  { id: 'tracker_starlink', label: 'Tracker & Starlink' },
  { id: 'serial_plate', label: 'Serial Number Plate' },
  { id: 'cleanliness_surfaces', label: 'Cleanliness — Prep Surfaces & Sinks', appliesTo: ['site'] },
  { id: 'cleanliness_floor', label: 'Cleanliness — Floor', appliesTo: ['site'] },
  { id: 'cleanliness_extraction', label: 'Cleanliness — Extraction Filters', appliesTo: ['site'] },
];

export function getPhotoSlots(location: InspectionLocation): PhotoSlot[] {
  return PHOTO_SLOTS.filter((s) => !s.appliesTo || s.appliesTo.includes(location));
}
