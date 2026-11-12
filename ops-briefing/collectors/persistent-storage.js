/**
 * Persistent Storage Paths
 *
 * Single source of truth for every path the briefing system reads or writes.
 *
 * On Railway:   set PERSISTENT_DATA_DIR=/data in Variables panel
 *               credentials.json is decoded from GOOGLE_CREDENTIALS_B64 by the
 *               start command in railway.toml and lands in the project root
 * Locally:      leave PERSISTENT_DATA_DIR unset — falls back to project root
 *               (identical to the original behaviour before this change)
 *
 * Directories managed here:
 *   tokens/          — Google OAuth refresh tokens (one JSON file per account)
 *   playwright-data/ — Playwright browser profiles (WhatsApp + LinkedIn sessions)
 *   output/          — Generated briefings, cache files, debug screenshots
 */

const path = require('path');
const fs = require('fs');

// Railway: set PERSISTENT_DATA_DIR=/data in Variables panel
// Local/Mac: falls back to project root
const BASE = process.env.PERSISTENT_DATA_DIR
  ? path.resolve(process.env.PERSISTENT_DATA_DIR)
  : path.join(__dirname, '..');

// Project root is always the directory above collectors/
// Used for credentials.json which must live next to server.js
const PROJECT_ROOT = path.join(__dirname, '..');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

const PATHS = {
  // Base directories
  tokens:         () => ensureDir(path.join(BASE, 'tokens')),
  playwrightData: () => ensureDir(path.join(BASE, 'playwright-data')),
  output:         () => ensureDir(path.join(BASE, 'output')),

  // credentials.json always lives in the project root
  // On Railway it is decoded there by the start command in railway.toml
  credentials:    () => path.join(PROJECT_ROOT, 'credentials.json'),

  // Specific file helpers
  googleToken:    (email) => path.join(
    PATHS.tokens(),
    email.replace(/[^a-zA-Z0-9@._-]/g, '_') + '.json'
  ),
  whatsappSession: (id) => ensureDir(path.join(PATHS.playwrightData(), 'whatsapp-' + (id || 'default'))),
  linkedinSession: (id) => ensureDir(path.join(PATHS.playwrightData(), 'linkedin-' + (id || 'default'))),
  whatsappCache:  ()    => path.join(PATHS.output(), 'whatsapp-cache.json'),
};

module.exports = PATHS;
