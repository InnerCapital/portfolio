// Public OAuth client ID (GCP project "Acme Hire Handover"), shared with the
// quote tool and Trader Briefing ops tool. Not a secret. Kept in its own module
// so the login page can import it without pulling in google-auth-library.
export const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
