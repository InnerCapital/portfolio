/**
 * Google OAuth Setup Script
 * Authorizes Gmail accounts one at a time.
 *
 * Usage:
 *   node setup/google-auth-setup.js alex@acmehire.example
 *   node setup/google-auth-setup.js alex@acmecapital.example
 *   node setup/google-auth-setup.js alex@acmebrands.example
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getAuthClient } = require('../collectors/google-auth');

const email = process.argv[2];

if (!email) {
  console.log('\nUsage: node setup/google-auth-setup.js <email@example.com>\n');
  console.log('This will open your browser to authorize the email account.');
  console.log('The token is saved and reused automatically.\n');
  console.log('Accounts to authorize for Alex:');
  console.log('  node setup/google-auth-setup.js alex@acmehire.example');
  console.log('  node setup/google-auth-setup.js alex@acmecapital.example');
  console.log('  node setup/google-auth-setup.js alex@acmebrands.example\n');
  process.exit(1);
}

async function main() {
  console.log(`\n🔐 Authorizing: ${email}\n`);

  try {
    const auth = await getAuthClient(email);
    console.log(`\n✓ Successfully authorized: ${email}`);
    console.log('  Token saved. This account is now ready for the briefing system.\n');
  } catch (e) {
    console.error(`\n✗ Authorization failed: ${e.message}\n`);
    process.exit(1);
  }
}

main();
