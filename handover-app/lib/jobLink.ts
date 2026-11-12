import type { NextRequest } from 'next/server';

// Header proxy.ts sets on requests made under a job link (never trusted from
// the client: the proxy strips any incoming copy). Its value is the one
// inspection id the link is for.
export const JOB_HEADER = 'x-ah-job-inspection';

// How long a job link stays valid after staff create it.
export const JOB_LINK_HOURS = 24;

// Returns the inspection id if this request was made under a job link, else null
// (i.e. a signed-in staff request).
export function jobInspectionId(req: NextRequest): string | null {
  return req.headers.get(JOB_HEADER);
}

// Fields a job-link user may write. Units are merged server-side so only photos
// and photo checks change, never serial numbers or unit types.
export const JOB_WRITABLE_FIELDS = [
  'checklist',
  'power_connected',
  'power_notes',
  'general_notes',
  'ai_overrides',
] as const;
