// Acme Hire asset IDs, e.g. AHUKB260001:
//   AH + UK + type letter (B Bar, D Dark Kitchen, K Street Kitchen) + 2-digit year + 4-digit number.
// Unit plates carry a QR code for https://assets.acmehire.example/<ID>. Older plates may point at
// https://acmehire.example/assets/<ID> or use ?asset=<ID>. A bare ID is accepted too.

export const ASSET_ID_RE = /^AH[A-Z]{2}[A-Z]\d{6}$/;

const TYPE_BY_LETTER: Record<string, string> = {
  B: 'Bar',
  D: 'Dark Kitchen',
  K: 'Street Kitchen',
};

/** Pulls a valid asset ID out of a scanned QR payload, or returns null. */
export function parseAssetId(raw: string): string | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const candidates: string[] = [];
  try {
    const url = new URL(text);
    const q = url.searchParams.get('asset');
    if (q) candidates.push(q);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length) candidates.push(parts[parts.length - 1]);
  } catch {
    candidates.push(text);
  }

  for (const c of candidates) {
    let id: string;
    try {
      id = decodeURIComponent(c).trim().toUpperCase();
    } catch {
      continue;
    }
    if (ASSET_ID_RE.test(id)) return id;
  }
  return null;
}

/** Unit type implied by the ID's type letter, or '' when unknown. */
export function unitTypeFromAssetId(id: string): string {
  const clean = (id || '').trim().toUpperCase();
  if (!ASSET_ID_RE.test(clean)) return '';
  return TYPE_BY_LETTER[clean.charAt(4)] ?? '';
}
