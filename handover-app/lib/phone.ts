// Normalise a phone number to international format (+<country><number>) for WhatsApp.
// UK numbers written locally (07..., 01..., 02...) become +44. Returns null if it can't be read.
export function toInternationalPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+44') && s.charAt(3) === '0') s = '+44' + s.slice(4); // +44 (0)7...
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = '+44' + s.slice(1);
    else if (s.startsWith('44')) s = '+' + s;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** Shows only the last 3 digits, for logs and alerts. */
export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${phone.slice(0, 3)}${'•'.repeat(Math.max(0, phone.length - 6))}${phone.slice(-3)}` : phone;
}
