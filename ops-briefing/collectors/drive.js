/**
 * Google Drive Collector
 * Fetches recently shared/modified files relevant to Alex
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');
const fs = require('fs');
const path = require('path');

async function collectDrive(config) {
  // Use first available Gmail account for Drive access
  let authAccount = config._authAccount;
  if (!authAccount) {
    // Read the persistent config (Railway volume), not the empty repo default
    const configFilePath = process.env.PERSISTENT_DATA_DIR
      ? path.join(process.env.PERSISTENT_DATA_DIR, 'config.json')
      : path.join(__dirname, '..', 'config.json');
    const mainCfg = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    authAccount = (mainCfg.streams.business.gmail.accounts || [])[0];
    if (!authAccount) throw new Error('No Gmail accounts configured — add one in Settings');
  }
  const auth = await getAuthClient(authAccount);
  const drive = google.drive({ version: 'v3', auth });

  const lookback = new Date(Date.now() - (config.lookbackHours || 24) * 3600000).toISOString();
  const results = [];

  // Files shared with Alex in last 24 hours
  try {
    const shared = await drive.files.list({
      q: `sharedWithMe and modifiedTime > '${lookback}'`,
      fields: 'files(id, name, modifiedTime, sharingUser, webViewLink, owners)',
      orderBy: 'modifiedTime desc',
      pageSize: 20,
    });

    for (const f of (shared.data.files || [])) {
      results.push({
        filename: f.name,
        sharedBy: f.sharingUser ? f.sharingUser.displayName : 'Unknown',
        modified: new Date(f.modifiedTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        hasComments: false, // Would need separate comments API call
        link: f.webViewLink || '',
      });
    }
  } catch (e) {
    console.log(`  ⚠ Drive shared files error: ${e.message}`);
  }

  // Files owned by Alex, modified by others recently
  try {
    const owned = await drive.files.list({
      q: `'me' in owners and modifiedTime > '${lookback}' and not lastModifyingUser = 'me'`,
      fields: 'files(id, name, modifiedTime, lastModifyingUser, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 20,
    });

    for (const f of (owned.data.files || [])) {
      // Avoid duplicates
      if (!results.find(r => r.filename === f.name)) {
        results.push({
          filename: f.name,
          sharedBy: f.lastModifyingUser ? f.lastModifyingUser.displayName : 'Team member',
          modified: new Date(f.modifiedTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          hasComments: false,
          link: f.webViewLink || '',
        });
      }
    }
  } catch (e) {
    console.log(`  ⚠ Drive owned files error: ${e.message}`);
  }

  console.log(`  Drive: ${results.length} files with recent activity`);
  return results;
}

module.exports = { collectDrive };
