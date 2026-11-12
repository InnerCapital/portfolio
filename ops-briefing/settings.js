/**
 * Settings Manager
 * Add/remove accounts, check status, configure the briefing system.
 *
 * Usage:
 *   node settings.js                     — Show current config & status
 *   node settings.js add-gmail EMAIL     — Add & authorize a Gmail account
 *   node settings.js remove-gmail EMAIL  — Remove a Gmail account
 *   node settings.js add-slack TOKEN     — Set Slack bot token
 *   node settings.js test-gmail          — Test Gmail connection for all accounts
 *   node settings.js test-all            — Test all configured sources
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ─── Show Status ───
function showStatus() {
  const config = loadConfig();
  const tokensDir = path.join(__dirname, 'tokens');
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  const hasSlack = !!process.env.SLACK_BOT_TOKEN;
  const hasCreds = fs.existsSync(path.join(__dirname, 'credentials.json'));

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     DAILY BRIEFING — SETTINGS & STATUS       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Core
  console.log('── CORE ──');
  console.log(`  Anthropic API Key:  ${hasApiKey ? '✓ Set' : '✗ Missing (add to .env)'}`);
  console.log(`  Google Credentials: ${hasCreds ? '✓ Found' : '✗ Missing (download from GCP)'}`);
  console.log(`  Slack Token:        ${hasSlack ? '✓ Set' : '✗ Missing (add SLACK_BOT_TOKEN to .env)'}`);
  console.log(`  Test Mode:          ${config._testMode.enabled ? '⚠ ON (using sample data)' : '✓ OFF (using real data)'}`);

  // Gmail accounts
  console.log('\n── GMAIL ACCOUNTS ──');
  const accounts = config.streams.business.gmail.accounts || [];
  if (accounts.length === 0) {
    console.log('  No accounts configured.');
    console.log('  Add one: node settings.js add-gmail yourname@gmail.com');
  } else {
    for (const acct of accounts) {
      const tokenFile = path.join(tokensDir, `${acct}.json`);
      const hasToken = fs.existsSync(tokenFile);
      console.log(`  ${hasToken ? '✓' : '✗'} ${acct} ${hasToken ? '(authorized)' : '(needs authorization)'}`);
    }
  }

  // Schedule
  console.log('\n── SCHEDULE ──');
  console.log(`  Generate at: ${config.briefing.generateAt} ${config.briefing.timezone}`);
  console.log(`  Deliver at:  ${config.briefing.deliverAt}`);
  console.log(`  Days:        ${config.briefing.days.join(', ')}`);

  // Other sources
  console.log('\n── OTHER SOURCES ──');
  const biz = config.streams.business;
  const pers = config.streams.personal;
  console.log(`  Calendar:    ${biz.calendar.enabled ? '✓ Enabled' : '○ Disabled'}`);
  console.log(`  Slack:       ${biz.slack.enabled ? (hasSlack ? '✓ Enabled' : '⚠ Enabled but no token') : '○ Disabled'}`);
  console.log(`  Drive:       ${biz.drive.enabled ? '✓ Enabled' : '○ Disabled'}`);
  console.log(`  Xero:        ${biz.xero.enabled ? '✓ Enabled' : '○ Disabled (needs API setup)'}`);
  console.log(`  iCloud Mail: ${pers.icloudMail.enabled ? '✓ Enabled' : '○ Disabled'}`);
  console.log(`  WhatsApp:    ${pers.whatsapp.enabled ? '✓ Enabled' : '○ Disabled (needs Playwright setup)'}`);
  console.log(`  LinkedIn:    ${pers.linkedin.enabled ? '✓ Enabled' : '○ Disabled (needs Playwright setup)'}`);

  // Delivery
  console.log('\n── DELIVERY ──');
  console.log(`  Slack:  ${config.delivery.slack.enabled ? `✓ → ${config.delivery.slack.channel}` : '○ Disabled'}`);
  console.log(`  Email:  ${config.delivery.email.enabled ? `✓ → ${config.delivery.email.recipients.join(', ')}` : '○ Disabled'}`);

  console.log('\n── COMMANDS ──');
  console.log('  node settings.js add-gmail EMAIL     Add & authorize Gmail account');
  console.log('  node settings.js remove-gmail EMAIL  Remove Gmail account');
  console.log('  node settings.js add-slack TOKEN     Set Slack bot token');
  console.log('  node settings.js test-gmail          Test all Gmail connections');
  console.log('  node settings.js test-all            Test all sources');
  console.log('  node generate-briefing.js            Generate briefing now');
  console.log('');
}

// ─── Add Gmail ───
async function addGmail(email) {
  if (!email || !email.includes('@')) {
    console.log('\n✗ Please provide a valid email: node settings.js add-gmail user@gmail.com\n');
    return;
  }

  const config = loadConfig();
  const accounts = config.streams.business.gmail.accounts;

  if (!accounts.includes(email)) {
    accounts.push(email);
    saveConfig(config);
    console.log(`\n✓ Added ${email} to config`);
  } else {
    console.log(`\n${email} already in config`);
  }

  // Authorize
  console.log(`\nAuthorizing ${email}...\n`);
  try {
    const { getAuthClient } = require('./collectors/google-auth');
    await getAuthClient(email);
    console.log(`\n✓ ${email} is authorized and ready!\n`);
  } catch (e) {
    console.log(`\n✗ Authorization failed: ${e.message}`);
    console.log('  Try again: node settings.js add-gmail ' + email + '\n');
  }
}

// ─── Remove Gmail ───
function removeGmail(email) {
  const config = loadConfig();
  const accounts = config.streams.business.gmail.accounts;
  const idx = accounts.indexOf(email);

  if (idx === -1) {
    console.log(`\n✗ ${email} not found in config\n`);
    return;
  }

  accounts.splice(idx, 1);
  saveConfig(config);

  // Remove token file
  const tokenFile = path.join(__dirname, 'tokens', `${email}.json`);
  if (fs.existsSync(tokenFile)) {
    fs.unlinkSync(tokenFile);
    console.log(`\n✓ Removed ${email} and deleted saved token\n`);
  } else {
    console.log(`\n✓ Removed ${email} from config\n`);
  }
}

// ─── Add Slack ───
function addSlack(token) {
  if (!token || !token.startsWith('xoxb-')) {
    console.log('\n✗ Please provide a valid Slack bot token (starts with xoxb-)\n');
    console.log('  Get one from: https://api.slack.com/apps → OAuth & Permissions\n');
    return;
  }

  // Update .env file
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  if (envContent.includes('SLACK_BOT_TOKEN=')) {
    envContent = envContent.replace(/SLACK_BOT_TOKEN=.*/g, `SLACK_BOT_TOKEN=${token}`);
  } else {
    envContent += `\nSLACK_BOT_TOKEN=${token}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log('\n✓ Slack bot token saved to .env\n');
}

// ─── Test Gmail ───
async function testGmail() {
  const config = loadConfig();
  const accounts = config.streams.business.gmail.accounts;

  if (accounts.length === 0) {
    console.log('\n✗ No Gmail accounts configured. Add one: node settings.js add-gmail EMAIL\n');
    return;
  }

  const { google } = require('googleapis');
  const { getAuthClient } = require('./collectors/google-auth');

  console.log('\n── Testing Gmail connections ──\n');

  for (const acct of accounts) {
    try {
      const auth = await getAuthClient(acct);
      const gmail = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const msgCount = profile.data.messagesTotal;
      console.log(`  ✓ ${acct} — connected (${msgCount.toLocaleString()} total messages)`);
    } catch (e) {
      console.log(`  ✗ ${acct} — ${e.message}`);
    }
  }
  console.log('');
}

// ─── Test All ───
async function testAll() {
  console.log('\n── Testing all sources ──\n');

  // Gmail
  await testGmail();

  // Slack
  if (process.env.SLACK_BOT_TOKEN) {
    try {
      const { WebClient } = require('@slack/web-api');
      const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
      const auth = await slack.auth.test();
      console.log(`  ✓ Slack — connected as ${auth.user} in ${auth.team}\n`);
    } catch (e) {
      console.log(`  ✗ Slack — ${e.message}\n`);
    }
  } else {
    console.log('  ○ Slack — no token configured\n');
  }

  // Calendar
  try {
    const { google } = require('googleapis');
    const { getAuthClient } = require('./collectors/google-auth');
    const config = loadConfig();
    const firstAcct = config.streams.business.gmail.accounts[0];
    if (firstAcct) {
      const auth = await getAuthClient(firstAcct);
      const cal = google.calendar({ version: 'v3', auth });
      const now = new Date();
      const res = await cal.events.list({
        calendarId: 'primary',
        timeMin: new Date(now.setHours(0, 0, 0, 0)).toISOString(),
        timeMax: new Date(now.setHours(23, 59, 59, 999)).toISOString(),
        maxResults: 5,
        singleEvents: true,
      });
      console.log(`  ✓ Calendar — ${(res.data.items || []).length} events today\n`);
    }
  } catch (e) {
    console.log(`  ✗ Calendar — ${e.message}\n`);
  }
}

// ─── Main ───
const cmd = process.argv[2];
const arg = process.argv[3];

switch (cmd) {
  case 'add-gmail':
    addGmail(arg).catch(e => console.error(e.message));
    break;
  case 'remove-gmail':
    removeGmail(arg);
    break;
  case 'add-slack':
    addSlack(arg);
    break;
  case 'test-gmail':
    testGmail().catch(e => console.error(e.message));
    break;
  case 'test-all':
    testAll().catch(e => console.error(e.message));
    break;
  default:
    showStatus();
}
