/**
 * Main Briefing Pipeline
 * Collects data from all sources → Writes to Sheet → Calls Claude API → Delivers
 *
 * Run: node generate-briefing.js
 * Schedule: cron "45 6 * * 1-5" (06:45 weekdays BST)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
// Load config from persistent volume if available, fall back to project default
const configPath = process.env.PERSISTENT_DATA_DIR
  ? path.join(process.env.PERSISTENT_DATA_DIR, 'config.json')
  : path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { buildPrompt, toSlackBlocks, toHtmlEmail } = require('./briefing-prompt');
const PATHS = require('./collectors/persistent-storage');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, BorderStyle } = require('docx');

// CLI flags: --collect-only (collect & save data, skip generate/deliver)
//            --deliver-only (load saved data, generate & deliver)
const MODE_COLLECT_ONLY = process.argv.includes('--collect-only');
const MODE_DELIVER_ONLY = process.argv.includes('--deliver-only');
const COLLECTED_DATA_FILE = path.join(PATHS.output(), 'collected-data.json');

// Set timezone for date operations
process.env.TZ = config.briefing.timezone || 'UTC';

const now = new Date();
const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Auto-extend lookback on Mondays to cover weekend
const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
const configLookback = config.streams.business.gmail.lookbackHours || 24;
// Monday auto-extend: only if config has mondayAutoExtend enabled (default: true)
const mondayAutoExtend = config.briefing.mondayAutoExtend !== false;
if (dayOfWeek === 1 && configLookback <= 24 && mondayAutoExtend) {
  config.streams.business.gmail.lookbackHours = 72;
  console.log('  Monday detected — auto-extending lookback to 72 hours for weekend coverage');
  console.log('  (Disable in Settings → uncheck "Auto-extend on Mondays")');
} else {
  config.streams.business.gmail.lookbackHours = configLookback;
}

async function callWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      const delay = Math.pow(2, i + 1) * 1000;
      console.log(`  Retry ${i+1}/${maxRetries} in ${delay/1000}s: ${e.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Progress tracking — write to file so settings page can read it
const progressFile = path.join(PATHS.output(), 'progress.json');
function updateProgress(step, total, message) {
  const pct = Math.round((step / total) * 100);
  const progress = { step, total, pct, message, timestamp: new Date().toISOString() };
  try { fs.writeFileSync(progressFile, JSON.stringify(progress)); } catch {}
}

// Hard cap any collector so a hang (e.g. a stuck WhatsApp browser) can never
// stall the whole briefing. Rejects after `ms`; the caller's try/catch handles it.
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function collectData() {
  const data = { business: {}, personal: {} };
  const totalSteps = 7; // gmail, calendar, slack, drive, whatsapp, linkedin, generate
  let currentStep = 0;

  try {
  // ─── BUSINESS STREAM ───
  const biz = config.streams.business;

  // Gmail
  if (biz.gmail.enabled) {
    try {
      updateProgress(++currentStep, totalSteps, 'Scanning Gmail accounts...');
      const { collectGmail } = require('./collectors/gmail');
      data.business.gmail = await collectGmail(biz.gmail);
      console.log(`✓ Gmail: ${data.business.gmail.length} emails across ${biz.gmail.accounts.length} accounts`);
    } catch (e) {
      console.log(`✗ Gmail: ${e.message}`);
      data.business.gmail = [];
    }
  }

  // Calendar
  if (biz.calendar.enabled) {
    try {
      updateProgress(++currentStep, totalSteps, 'Reading calendar...');
      const { collectCalendar } = require('./collectors/calendar');
      data.business.calendar = await collectCalendar(biz.calendar);
      console.log(`✓ Calendar: ${data.business.calendar.length} events`);
    } catch (e) {
      console.log(`✗ Calendar: ${e.message}`);
      data.business.calendar = [];
    }
  }

  // Slack
  if (biz.slack.enabled) {
    try {
      updateProgress(++currentStep, totalSteps, 'Checking Slack channels...');
      const { collectSlack } = require('./collectors/slack');
      const slackConfig = Object.assign({}, biz.slack, { lookbackHours: config.streams.business.gmail.lookbackHours || 24 });
      data.business.slack = await collectSlack(slackConfig);
      console.log(`✓ Slack: ${data.business.slack.length} messages`);
    } catch (e) {
      console.log(`✗ Slack: ${e.message}`);
      data.business.slack = [];
    }
  }

  // Drive
  if (biz.drive.enabled) {
    try {
      const { collectDrive } = require('./collectors/drive');
      const driveConfig = Object.assign({}, biz.drive, { lookbackHours: config.streams.business.gmail.lookbackHours || 24 });
      data.business.drive = await collectDrive(driveConfig);
      console.log(`✓ Drive: ${data.business.drive.length} files`);
    } catch (e) {
      console.log(`✗ Drive: ${e.message}`);
      data.business.drive = [];
    }
  }

  // Xero
  if (biz.xero.enabled) {
    try {
      const { collectXero } = require('./collectors/xero');
      data.business.xero = await collectXero(biz.xero);
      console.log(`✓ Xero: data collected`);
    } catch (e) {
      console.log(`✗ Xero: ${e.message}`);
      data.business.xero = null;
    }
  }

  // Zoom — meetings (calendar enrichment) + AI Companion meeting notes (replaces LinkedIn)
  if (biz.zoom && biz.zoom.enabled) {
    try {
      updateProgress(++currentStep, totalSteps, 'Fetching Zoom meetings & notes...');
      const { collectZoom } = require('./collectors/zoom');
      data.business.zoom = await collectZoom(biz.zoom);
      console.log(`✓ Zoom: ${data.business.zoom.upcomingMeetings.length} upcoming meetings, ${data.business.zoom.meetingNotes.length} meeting notes`);
    } catch (e) {
      console.log(`✗ Zoom: ${e.message}`);
      data.business.zoom = { upcomingMeetings: [], meetingNotes: [] };
    }
  }

  // ─── PERSONAL STREAM ───
  const pers = config.streams.personal;

  // iCloud Mail
  if (pers.icloudMail.enabled) {
    try {
      const { collectICloudMail } = require('./collectors/icloud-mail');
      data.personal.icloudMail = await collectICloudMail(pers.icloudMail);
      console.log(`✓ iCloud Mail: ${data.personal.icloudMail.length} messages`);
    } catch (e) {
      console.log(`✗ iCloud Mail: ${e.message}`);
      data.personal.icloudMail = [];
    }
  }

  // WhatsApp — scan all configured accounts
  updateProgress(++currentStep, totalSteps, 'Scanning WhatsApp...');
  if (pers.whatsapp.enabled) {
    data.personal.whatsapp = [];
    const { collectWhatsApp } = require('./collectors/whatsapp');
    const waAccounts = (pers.whatsapp.accounts && pers.whatsapp.accounts.length > 0) ? pers.whatsapp.accounts : [{ id: 'default', label: 'WhatsApp' }];
    for (const wa of waAccounts) {
      try {
        const waConfig = Object.assign({}, pers.whatsapp, { lookbackHours: config.streams.business.gmail.lookbackHours || 24 });
        const threads = await withTimeout(collectWhatsApp(waConfig, wa.id), 180000, 'WhatsApp');
        // Tag threads with account label
        threads.forEach(t => t.accountLabel = wa.label || wa.id);
        data.personal.whatsapp.push(...threads);
        console.log(`✓ WhatsApp (${wa.label}): ${threads.length} threads`);
      } catch (e) {
        console.log(`✗ WhatsApp (${wa.label}): ${e.message}`);
      }
    }
  }

  // LinkedIn removed — replaced by the Zoom integration (business stream, above).
  // LinkedIn scraping was unreliable (datacenter-IP captcha) and against LinkedIn ToS.
  } catch (e) {
    console.error('⚠ collectData hit an unexpected error — returning partial data so the briefing still runs:', e.message);
  }

  return data;
}

async function generateBriefing(data) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = buildPrompt(data, today);

  updateProgress(7, 7, 'Generating briefing with Claude AI...');
  console.log('\n🔄 Generating briefing via Claude API...');

  const response = await callWithRetry(() => client.messages.create({
    model: config.infrastructure.claudeModel,
    max_tokens: config.infrastructure.maxTokens,
    temperature: config.infrastructure.temperature,
    messages: [{ role: "user", content: prompt }]
  }));

  const briefingText = response.content[0].text;
  console.log(`✓ Briefing generated (${response.usage.output_tokens} tokens)`);

  return briefingText;
}

async function toDocx(briefingText, date) {
  const children = [];
  const genTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // ── Design tokens (matching PDF spec) ──
  const FONT_HEADING = 'Calibri';
  const FONT_MONO = 'Consolas';
  const FONT_BODY = 'Calibri';
  const CLR_TITLE = '1a3c5e';
  const CLR_ACCENT = '2e86ab';
  const CLR_BODY = '2c3e50';
  const CLR_MUTED = '636366';
  const CLR_URGENT = 'FF3B30';
  const CLR_DECISION = 'FF9500';
  const CLR_FYI = '8E8E93';
  const CLR_DETAIL = '6b7a8d';

  // ── Title block ──
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'GOOD MORNING, ALEX', font: FONT_MONO, size: 14, letterSpacing: 80, color: CLR_MUTED }),
    ],
    spacing: { after: 60 },
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Daily Briefing', font: FONT_HEADING, size: 44, bold: true, color: CLR_TITLE }),
    ],
    spacing: { after: 40 },
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `${date}  ·  ${genTime} ${Intl.DateTimeFormat('en-GB', { timeZoneName: 'short', timeZone: config.briefing.timezone || 'Europe/London' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || 'BST'}`, font: FONT_MONO, size: 16, color: CLR_MUTED }),
    ],
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: CLR_ACCENT } },
    spacing: { after: 240 },
  }));

  // ── Parse briefing text ──
  const lines = briefingText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 60 } }));
      continue;
    }

    // Section headers: ### ═══ SOMETHING ═══
    if (/^###\s*═══/.test(trimmed)) {
      const headerText = trimmed.replace(/^###\s*═══\s*/, '').replace(/\s*═══\s*$/, '').trim();
      // Spacer before section
      children.push(new Paragraph({ spacing: { after: 120 } }));
      children.push(new Paragraph({
        children: [
          new TextRun({ text: headerText, font: FONT_MONO, size: 18, bold: true, letterSpacing: 60, color: CLR_ACCENT }),
        ],
        spacing: { before: 240, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: CLR_ACCENT } },
      }));
      continue;
    }

    // Sub-headers: ### something
    if (/^###\s+/.test(trimmed)) {
      const headerText = trimmed.replace(/^###\s+/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: headerText, font: FONT_HEADING, size: 22, bold: true, color: CLR_BODY }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 180, after: 60 },
      }));
      continue;
    }

    // H1 headers: # something
    if (/^#\s+/.test(trimmed)) {
      const headerText = trimmed.replace(/^#\s+/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: headerText, font: FONT_HEADING, size: 28, bold: true, color: CLR_TITLE }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 100 },
      }));
      continue;
    }

    // Urgent lines
    if (trimmed.startsWith('\u{1F534}')) {
      const text = trimmed.replace(/^🔴\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'URGENT  ', font: FONT_MONO, size: 14, bold: true, color: 'FFFFFF', shading: { type: 'clear', fill: CLR_URGENT } }),
          new TextRun({ text: ' ', font: FONT_BODY, size: 20 }),
          ...parseBoldRuns(text, { font: FONT_BODY, size: 20, color: CLR_URGENT, bold: true }),
        ],
        spacing: { after: 60 },
        indent: { left: 120 },
      }));
      continue;
    }

    // Decision lines
    if (trimmed.startsWith('\u{1F7E0}')) {
      const text = trimmed.replace(/^🟠\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'DECISION  ', font: FONT_MONO, size: 14, bold: true, color: 'FFFFFF', shading: { type: 'clear', fill: CLR_DECISION } }),
          new TextRun({ text: ' ', font: FONT_BODY, size: 20 }),
          ...parseBoldRuns(text, { font: FONT_BODY, size: 20, color: CLR_DECISION, bold: true }),
        ],
        spacing: { after: 60 },
        indent: { left: 120 },
      }));
      continue;
    }

    // FYI lines
    if (trimmed.startsWith('⚪')) {
      const text = trimmed.replace(/^⚪\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'FYI  ', font: FONT_MONO, size: 14, bold: true, color: 'FFFFFF', shading: { type: 'clear', fill: CLR_FYI } }),
          new TextRun({ text: ' ', font: FONT_BODY, size: 20 }),
          ...parseBoldRuns(text, { font: FONT_BODY, size: 20, color: CLR_FYI }),
        ],
        spacing: { after: 60 },
        indent: { left: 120 },
      }));
      continue;
    }

    // Detail lines (└)
    if (trimmed.startsWith('└') || trimmed.startsWith('└')) {
      const text = trimmed.replace(/^└\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `└ ${text}`, font: FONT_MONO, size: 16, color: CLR_DETAIL, italics: true }),
        ],
        spacing: { after: 30 },
        indent: { left: 480 },
      }));
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ')) {
      const text = trimmed.replace(/^-\s+/, '');
      children.push(new Paragraph({
        children: parseBoldRuns(text, { font: FONT_BODY, size: 20, color: CLR_BODY }),
        spacing: { after: 40 },
        bullet: { level: 0 },
      }));
      continue;
    }

    // Numbered priority items
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      const num = numMatch[1];
      let rest = numMatch[2];
      let color = CLR_BODY;
      let badgeText = '';
      let badgeColor = '';
      if (rest.startsWith('\u{1F534}')) { badgeText = 'URGENT'; badgeColor = CLR_URGENT; rest = rest.replace(/^🔴\s*/, ''); }
      else if (rest.startsWith('\u{1F7E0}')) { badgeText = 'DECISION'; badgeColor = CLR_DECISION; rest = rest.replace(/^🟠\s*/, ''); }
      else if (rest.startsWith('⚪')) { badgeText = 'FYI'; badgeColor = CLR_FYI; rest = rest.replace(/^⚪\s*/, ''); }

      const runs = [
        new TextRun({ text: String(num).padStart(2, '0'), font: FONT_MONO, size: 28, bold: true, color: CLR_ACCENT }),
        new TextRun({ text: '  ', font: FONT_BODY, size: 20 }),
      ];
      if (badgeText) {
        runs.push(new TextRun({ text: ` ${badgeText} `, font: FONT_MONO, size: 14, bold: true, color: 'FFFFFF', shading: { type: 'clear', fill: badgeColor } }));
        runs.push(new TextRun({ text: ' ', font: FONT_BODY, size: 20 }));
        color = badgeColor;
      }
      runs.push(...parseBoldRuns(rest, { font: FONT_BODY, size: 20, color, bold: !!badgeText }));

      children.push(new Paragraph({
        children: runs,
        spacing: { after: 80 },
        indent: { left: 120 },
      }));
      continue;
    }

    // Bold-only lines
    if (/^\*\*.+\*\*$/.test(trimmed)) {
      const text = trimmed.replace(/^\*\*/, '').replace(/\*\*$/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text, font: FONT_HEADING, size: 22, bold: true, color: CLR_BODY }),
        ],
        spacing: { before: 140, after: 60 },
      }));
      continue;
    }

    // Warning lines
    if (trimmed.startsWith('⚠')) {
      const text = trimmed.replace(/^⚠️?\s*/, '');
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'WARNING  ', font: FONT_MONO, size: 14, bold: true, color: 'FFFFFF', shading: { type: 'clear', fill: CLR_DECISION } }),
          new TextRun({ text: ' ', font: FONT_BODY, size: 20 }),
          ...parseBoldRuns(text, { font: FONT_BODY, size: 20, color: CLR_DECISION }),
        ],
        spacing: { after: 60 },
        indent: { left: 120 },
      }));
      continue;
    }

    // Default paragraph
    children.push(new Paragraph({
      children: parseBoldRuns(trimmed, { font: FONT_BODY, size: 20, color: CLR_BODY }),
      spacing: { after: 50 },
    }));
  }

  // ── Footer ──
  children.push(new Paragraph({ spacing: { before: 300 } }));
  children.push(new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D5D8DC' } },
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'JORDAN BRIEFING SYSTEM  —  AUTO-GENERATED', font: FONT_MONO, size: 14, color: CLR_MUTED, letterSpacing: 40 }),
    ],
    alignment: AlignmentType.CENTER,
  }));

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'default-bullet',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 180 } } },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: FONT_BODY, size: 20 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
        },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Parse inline **bold** markers within a text string and return an array of TextRun objects.
 */
function parseBoldRuns(text, defaults) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      runs.push(new TextRun({
        text: inner,
        font: defaults.font || 'Arial',
        size: defaults.size || 20,
        color: defaults.color || '2c3e50',
        bold: true,
      }));
    } else {
      runs.push(new TextRun({
        text: part,
        font: defaults.font || 'Arial',
        size: defaults.size || 20,
        color: defaults.color || '2c3e50',
        bold: defaults.bold || false,
      }));
    }
  }
  return runs;
}

// Post a one-off alert to the briefing's Slack channel (used for hard failures
// like the Anthropic API running out of credits).
async function sendSlackAlert(text) {
  try {
    if (!process.env.SLACK_BOT_TOKEN) { console.log('  (no SLACK_BOT_TOKEN — alert not sent)'); return; }
    const channel = config.delivery && config.delivery.slack && config.delivery.slack.channel;
    if (!channel) { console.log('  (no Slack channel configured — alert not sent)'); return; }
    const { WebClient } = require('@slack/web-api');
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    await slack.chat.postMessage({ channel, text });
    console.log('  ⚠ Alert posted to Slack');
  } catch (e) {
    console.error('  Could not post Slack alert:', e.message);
  }
}

async function deliver(briefingText) {
  const del = config.delivery;
  const dateStr = new Date().toISOString().split('T')[0];
  const outDir = PATHS.output();

  // Generate DOCX first — used for both file save and email attachment
  let docxBuffer = null;
  try {
    docxBuffer = await toDocx(briefingText, today);
    console.log('✓ DOCX generated');
  } catch (e) {
    console.log(`✗ DOCX generation: ${e.message}`);
  }

  // Slack
  if (del.slack.enabled && !config._testMode.skipDelivery) {
    try {
      const { WebClient } = require('@slack/web-api');
      const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
      const blocks = toSlackBlocks(briefingText, today);
      await slack.chat.postMessage({
        channel: del.slack.channel,
        blocks,
        text: `Daily Briefing — ${today}` // fallback
      });
      console.log(`✓ Posted to Slack ${del.slack.channel}`);
    } catch (e) {
      console.log(`✗ Slack delivery: ${e.message}`);
    }
  }

  // Email — with .docx attachment. Uses an HTTPS provider (Resend/Brevo) because
  // Railway blocks outbound SMTP on Hobby/Trial plans.
  if (del.email.enabled && !config._testMode.skipDelivery) {
    const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'hello@acmehire.example';
    const html = toHtmlEmail(briefingText, today);
    const attachments = docxBuffer
      ? [{ filename: `Daily-Briefing-${dateStr}.docx`, content: docxBuffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]
      : [];

    const { sendEmail } = require('./send-email');
    const r = await sendEmail({
      from: emailFrom,
      to: del.email.recipients,
      subject: `Daily Briefing — ${today}`,
      html: html,
      attachments: attachments,
    });
    if (r.ok) console.log(`✓ Email sent via ${r.via} to: ${del.email.recipients.join(', ')} — ${r.response}`);
    else console.log(`✗ Email delivery (${r.via}): ${r.error}`);
  }

  // Always save to file
  if (config._testMode.outputToFile) {
    fs.writeFileSync(path.join(outDir, `briefing-${dateStr}.txt`), briefingText);
    fs.writeFileSync(path.join(outDir, `briefing-${dateStr}.html`), toHtmlEmail(briefingText, today));
    console.log(`✓ Saved to output/briefing-${dateStr}.txt and .html`);

    if (docxBuffer) {
      fs.writeFileSync(path.join(outDir, `briefing-${dateStr}.docx`), docxBuffer);
      console.log(`✓ Saved output/briefing-${dateStr}.docx`);
    }
  }
}

async function main() {
  const modeLabel = MODE_COLLECT_ONLY ? ' [COLLECT ONLY]' : MODE_DELIVER_ONLY ? ' [DELIVER ONLY]' : '';
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📋 Alex Morgan Daily Briefing${modeLabel}`);
  console.log(`📅 ${today}`);
  console.log(`${'='.repeat(50)}\n`);

  // Ensure output directory exists
  const outDir = PATHS.output();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let data;

  if (MODE_DELIVER_ONLY) {
    console.log('📂 Loading previously collected data...\n');
    data = JSON.parse(fs.readFileSync(COLLECTED_DATA_FILE, 'utf8'));
  } else {
    try {
      data = await collectData();
    } catch (e) {
      console.error('⚠ Collection failed — still generating/delivering the briefing with whatever we have:', e.message);
      data = data || { business: {}, personal: {} };
    }
    try { fs.writeFileSync(COLLECTED_DATA_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
    if (MODE_COLLECT_ONLY) {
      console.log('\n✅ Data collected. Run with --deliver-only to generate and deliver.\n');
      return;
    }
  }

  let briefingText;
  try {
    briefingText = await generateBriefing(data);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const nested = (e && e.error && e.error.error && e.error.error.message) || '';
    const isCredit = /credit balance is too low|billing|insufficient|quota|payment required/i.test(msg + ' ' + nested);
    const alert = isCredit
      ? ':red_circle: *Daily Briefing failed — Anthropic API is out of credits.*\nToday\'s briefing could not be generated. Fix: go to console.anthropic.com → Plans & Billing → add credits (turn on Auto-reload so this doesn\'t recur).'
      : ':red_circle: *Daily Briefing failed to generate.*\nError: ' + msg.slice(0, 300);
    console.error('✗ Generation failed:', msg);
    await sendSlackAlert(alert);
    return; // do not deliver a broken/empty briefing
  }

  // If WhatsApp isn't connected, add a clear callout + how to restore it,
  // inserted right after the greeting so it's the first thing Alex sees.
  if (whatsappNeedsSetup(data)) {
    const dash = process.env.DASHBOARD_URL || 'https://ops-briefing.example.app';
    const notice =
      '### ═══ SETUP NEEDED ═══\n' +
      '📱 **WhatsApp is not connected**, so it has been left out of today\'s briefing.\n' +
      'To restore it: open the dashboard → **WhatsApp → Start QR Setup**, then on your phone open **WhatsApp → Settings → Linked Devices → Link a Device** and scan the QR shown on screen.\n' +
      dash + '\n\n';
    const idx = briefingText.indexOf('### ═══');
    briefingText = idx >= 0
      ? briefingText.slice(0, idx) + notice + briefingText.slice(idx)
      : briefingText + '\n\n' + notice;
  }

  await deliver(briefingText);
}

// True when WhatsApp is enabled but no session is connected (or it's expired).
function whatsappNeedsSetup(data) {
  const wa = config.streams.personal && config.streams.personal.whatsapp;
  if (!wa || !wa.enabled) return false;
  try {
    const accts = (wa.accounts && wa.accounts.length) ? wa.accounts : [{ id: 'default' }];
    const anyConnected = accts.some((a) => {
      const dir = PATHS.whatsappSession(a.id || a);
      return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
    });
    let expired = false;
    try {
      const health = require('./collectors/session-health').getHealthSummary();
      expired = Object.keys(health).some((k) => k.indexOf('whatsapp:') === 0 && health[k].status === 'expired');
    } catch (e) {}
    return !anyConnected || expired;
  } catch (e) {
    return true; // if unsure, show the callout — better to prompt than stay silent
  }
}

// Never let a stray async rejection (e.g. a Playwright/WhatsApp browser crash) kill the whole run
process.on('unhandledRejection', (reason) => {
  console.error('⚠ Unhandled rejection (ignored so the briefing can continue):', reason && reason.message ? reason.message : reason);
});

main().catch(console.error);