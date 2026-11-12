/**
 * Claude API Briefing Prompt
 * Matches Jordan's spec: two-stream (Business/Personal), urgency scoring,
 * priority-ordered output with Slack Block Kit formatting
 */

/**
 * Truncate collected data to stay within Claude's context limits.
 * Limits per source prevent prompt bloat when many messages are collected.
 */
function truncateData(data) {
  const d = JSON.parse(JSON.stringify(data)); // deep clone

  // No email limit per account — send everything to Claude
  // Claude's 200K context can handle 1000+ emails

  // WhatsApp: last 10 messages per thread (keep recent context)
  if (d.personal && d.personal.whatsapp && Array.isArray(d.personal.whatsapp)) {
    for (const thread of d.personal.whatsapp) {
      if (thread.lastMessages && thread.lastMessages.length > 10) {
        thread.lastMessages = thread.lastMessages.slice(-10);
      }
    }
  }

  // Slack: no limit — send all
  // LinkedIn: no limit — send all
  // Drive: no limit — send all

  // Only safety cap: if total JSON > 150KB, trim email snippets to save space
  const jsonStr = JSON.stringify(d);
  if (jsonStr.length > 150000) {
    console.log('  Data exceeds 150KB — trimming email snippets to 100 chars');
    if (d.business && d.business.gmail) {
      d.business.gmail.forEach(e => { if (e.summary) e.summary = e.summary.substring(0, 100); });
    }
  }

  return d;
}

function buildPrompt(data, date) {
  const truncated = truncateData(data);

  // ── Pre-organize Gmail emails by account ──
  const emailsByAccount = {};
  if (truncated.business && truncated.business.gmail && Array.isArray(truncated.business.gmail)) {
    for (const email of truncated.business.gmail) {
      const acct = email.account || email.accountEmail || 'unknown';
      if (!emailsByAccount[acct]) emailsByAccount[acct] = [];
      emailsByAccount[acct].push(email);
    }
  }

  // ── Pre-organize WhatsApp threads by account label ──
  const whatsappByAccount = {};
  if (truncated.personal && truncated.personal.whatsapp && Array.isArray(truncated.personal.whatsapp)) {
    for (const thread of truncated.personal.whatsapp) {
      const acct = thread.accountLabel || 'WhatsApp';
      if (!whatsappByAccount[acct]) whatsappByAccount[acct] = [];
      whatsappByAccount[acct].push(thread);
    }
  }

  // ── Build pre-organized EMAIL section ──
  let emailDataSection = '## EMAIL DATA (organized by account)\n\n';
  const emailAccounts = Object.keys(emailsByAccount);
  if (emailAccounts.length > 0) {
    for (const acct of emailAccounts) {
      const emails = emailsByAccount[acct];
      emailDataSection += `### Account: ${acct} (${emails.length} emails)\n`;
      emailDataSection += JSON.stringify(emails, null, 2) + '\n\n';
    }
  } else {
    emailDataSection += 'No email data collected.\n\n';
  }

  // ── Build pre-organized WHATSAPP section ──
  let whatsappDataSection = '## WHATSAPP DATA (organized by account)\n\n';
  const waAccounts = Object.keys(whatsappByAccount);
  if (waAccounts.length > 0) {
    for (const acct of waAccounts) {
      const threads = whatsappByAccount[acct];
      whatsappDataSection += `### Account: ${acct} (${threads.length} threads)\n`;
      whatsappDataSection += JSON.stringify(threads, null, 2) + '\n\n';
    }
  } else {
    whatsappDataSection += 'No WhatsApp data collected.\n\n';
  }

  // ── Build OTHER DATA section (everything except gmail and whatsapp) ──
  const otherData = JSON.parse(JSON.stringify(truncated));
  if (otherData.business) delete otherData.business.gmail;
  if (otherData.personal) delete otherData.personal.whatsapp;

  let otherDataSection = '## OTHER DATA (Calendar, Slack, Drive, LinkedIn, Xero, iCloud)\n\n';
  otherDataSection += JSON.stringify(otherData, null, 2) + '\n';

  return `You are generating the Daily Briefing for ${date}.

You will receive structured data from multiple sources. The data has been PRE-ORGANIZED by account.
Your job: preserve this account separation EXACTLY in the output. NEVER merge data from different accounts.

## STYLE RULES (follow exactly)
- British English. Concise, calm, direct. Built for SCANNING, not reading.
- NEVER invent facts, names, companies, contract numbers, dates, or emails. Use ONLY what appears in the data below. If something is not in the data, leave it out.
- Output PLAIN text with light markdown (** for bold, • for bullets). Do NOT emit stray backslashes, escape characters, or repeated section markers.
- Each section appears ONCE. Never duplicate a section or its heading.
- Available mailbox accounts (name the correct one when a reply is needed, but never write the reply): ${emailAccounts.length > 0 ? emailAccounts.join(', ') : 'none'}.
- You surface and summarise. You do NOT draft replies, write messages, or compose emails — that is the human EA's job.

## OUTPUT FORMAT

Begin with a two-line greeting (NO section marker before it):
Morning Alex,
[One warm sentence that references the single biggest thing in his day — e.g. a round of golf, a key meeting, travel. If nothing stands out, use "Here's your briefing for today."]

Then output these sections IN THIS ORDER. Each section MUST start on its own line with its exact marker "### ═══ NAME ═══". Omit a section entirely if it has no real content (do not print an empty heading).

### ═══ YOUR DAY ═══
The day's schedule from Calendar as clean lines:
• **[time or time range]** — [title] | [location] *(calendar name if useful)*
If a Zoom meeting (in OTHER DATA → business.zoom.upcomingMeetings) matches or adds to an event, include its join link inline: — [Zoom join link].
⚠ Flag overlaps and anything starting within 30 minutes. If nothing is scheduled, write "No scheduled events today."

### ═══ MEETING NOTES ═══
Only if OTHER DATA → business.zoom.meetingNotes has entries. For each recent meeting summary, give Alex the gist he'd want before his day:
**[Meeting topic]** *(when)*
• [2–4 tight bullets from the summary overview/details — the decisions and points that matter]
Action items (from next_steps): • [item] • [item]
If there are no meeting notes, omit this whole section.

### ═══ TODAY'S PRIORITIES ═══
The things that most need actioning today, GROUPED BY the person or organisation they relate to. For each group:
**[Person / Organisation]**
• [Specific action — e.g. "Sign Contract 354127", "Reply to the Investor Club follow-up"]

### ═══ DIARY & BOOKINGS ═══
Newly scheduled or changed meetings, calls and bookings:
• **[Person (Company)]** — [what + when]

### ═══ CORRESPONDENCE ═══
A scannable one-line-each list of notable incoming items worth awareness. Where a reply is needed, say so and name the mailbox it arrived in — but DO NOT write the reply:
• **[Person]** — [what it's about] *(needs reply — [mailbox])*

### ═══ STILL OUTSTANDING ═══
Open items carried over / not yet actioned, one per line:
• [item]

### ═══ REMINDERS ═══
Personal and admin reminders surfaced from the data, one per line:
• [item]

### ═══ TOP PRIORITIES ═══
The 3 single most important actions for today, numbered 1–3:
1. [action]
2. [action]
3. [action]

## PRE-ORGANIZED DATA

${emailDataSection}
${whatsappDataSection}
${otherDataSection}

Generate the briefing now. Be thorough but concise. PRESERVE account separation exactly as organized above.`;
}

/**
 * Convert briefing text to Slack Block Kit format
 */
function toSlackBlocks(briefingText, date) {
  const sections = briefingText.split(/### ═══|═══/g).filter(s => s.trim());

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `📋 Daily Briefing — ${date}` }
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Generated at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST` }]
    },
    { type: "divider" }
  ];

  // Split into business and personal sections
  const parts = briefingText.split(/={3,}\s*(BUSINESS|PERSONAL|PRIORITIES)\s*={3,}/gi);

  for (const part of parts) {
    if (!part.trim()) continue;

    // Add section as markdown block
    const lines = part.trim().split('\n');
    let currentBlock = '';

    for (const line of lines) {
      if (line.startsWith('**') && line.endsWith('**')) {
        // Section header
        if (currentBlock) {
          blocks.push({ type: "section", text: { type: "mrkdwn", text: currentBlock.trim() } });
          currentBlock = '';
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${line.replace(/\*/g, '')}*` } });
      } else {
        currentBlock += line + '\n';
        // Slack has a 3000 char limit per block
        if (currentBlock.length > 2800) {
          blocks.push({ type: "section", text: { type: "mrkdwn", text: currentBlock.trim() } });
          currentBlock = '';
        }
      }
    }

    if (currentBlock.trim()) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: currentBlock.trim() } });
    }

    blocks.push({ type: "divider" });
  }

  return blocks;
}

/**
 * Convert briefing text to HTML email format
 * Light theme — professional, readable, email-ready
 */
function toHtmlEmail(briefingText, date) {
  const genTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Section styling — light theme with accent colors per section
  const sectionConfig = {
    // New synthesised briefing sections
    'SETUP NEEDED':      { icon: '&#x1F4F1;',  accent: '#d35400', label: 'SETUP NEEDED' },
    'YOUR DAY':          { icon: '&#x1F5D3;',  accent: '#8e44ad', label: 'YOUR DAY' },
    "TODAY'S PRIORITIES":{ icon: '&#x2605;',   accent: '#c0392b', label: "TODAY'S PRIORITIES" },
    'MEETING NOTES':     { icon: '&#x1F4DD;',  accent: '#2D8CFF', label: 'MEETING NOTES' },
    'DIARY & BOOKINGS':  { icon: '&#x1F4C5;',  accent: '#2e86ab', label: 'DIARY & BOOKINGS' },
    'CORRESPONDENCE':    { icon: '&#x1F4E7;',  accent: '#1a3c5e', label: 'CORRESPONDENCE' },
    'STILL OUTSTANDING': { icon: '&#x23F3;',   accent: '#d35400', label: 'STILL OUTSTANDING' },
    'REMINDERS':         { icon: '&#x1F514;',  accent: '#8e44ad', label: 'REMINDERS' },
    'TOP PRIORITIES':    { icon: '&#x1F3AF;',  accent: '#c0392b', label: 'TOP PRIORITIES' },
    // Legacy per-source sections (kept for backward compatibility)
    'EMAIL':       { icon: '&#x1F4E7;', accent: '#2e86ab', label: 'EMAIL' },
    'CALENDAR':    { icon: '&#x1F4C5;', accent: '#8e44ad', label: 'CALENDAR' },
    'SLACK':       { icon: '&#x1F4AC;', accent: '#611f69', label: 'SLACK' },
    'DRIVE':       { icon: '&#x1F4C1;', accent: '#1e8449', label: 'DRIVE' },
    'WHATSAPP':    { icon: '&#x1F4AC;', accent: '#25d366', label: 'WHATSAPP' },
    'LINKEDIN':    { icon: '&#x1F310;', accent: '#0077b5', label: 'LINKEDIN' },
    'PRIORITIES':  { icon: '&#x1F3AF;', accent: '#c0392b', label: 'PRIORITIES' },
    'XERO':        { icon: '&#x1F4B0;', accent: '#13b5ea', label: 'XERO' },
    'iCLOUD MAIL': { icon: '&#x2601;',  accent: '#5856d6', label: 'iCLOUD MAIL' },
    'iCLOUD':      { icon: '&#x2601;',  accent: '#5856d6', label: 'iCLOUD MAIL' },
    'COMMS':       { icon: '&#x1F4F1;', accent: '#1e8449', label: 'COMMS' },
  };

  // Badge builder — inline status badges matching PDF design
  function badge(label, bg, border) {
    return `<span style="display:inline-block;background:${bg};${border ? 'border:1px solid ' + border + ';' : ''}color:#fff;font-size:9px;font-family:'Courier New',monospace;font-weight:600;letter-spacing:0.08em;padding:2px 7px;border-radius:2px;text-transform:uppercase;vertical-align:middle;margin-right:4px;">${label}</span>`;
  }

  // Split briefing into sections by the ═══ markers
  const rawSections = briefingText.split(/### ═══\s*/);
  let sectionsHtml = '';

  for (const rawSection of rawSections) {
    if (!rawSection.trim()) continue;

    const headerMatch = rawSection.match(/^(.+?)═══/);
    const sectionName = headerMatch ? headerMatch[1].trim() : '';
    const sectionBody = headerMatch ? rawSection.slice(headerMatch[0].length) : rawSection;
    const cfg = sectionConfig[sectionName] || null;

    // Process body text
    let bodyHtml = sectionBody
      // Status badges — light theme
      .replace(/🔴/g, badge('URGENT', '#c0392b'))
      .replace(/🟠/g, badge('ACTION', '#d35400'))
      .replace(/⚪/g, badge('FYI', '#95a5a6', '#bdc3c7'))
      .replace(/⚠️?/g, badge('WARNING', '#d35400'))
      // Bold text
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1a3c5e;">$1</strong>')
      // Sub-headers
      .replace(/### (.+)/g, '<div style="font-size:12px;font-weight:700;color:#1a3c5e;margin:16px 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e8ecf1;">$1</div>');

    // Numbered priority items — styled ranking
    bodyHtml = bodyHtml.replace(/^(\d+)\.\s+/gm, function(match, num) {
      return '<span style="display:inline-block;font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;color:#2C2C2E;width:28px;margin-right:8px;">' + String(num).padStart(2, '0') + '</span>';
    });

    // Account headers — email and WhatsApp
    bodyHtml = bodyHtml.replace(/📧\s*(.+)/g, '<div style="background:#eaf2f8;border-left:3px solid #2e86ab;padding:8px 12px;margin:10px 0 6px 0;font-weight:600;color:#1a3c5e;font-size:13px;border-radius:0 4px 4px 0;">&#x1F4E7; $1</div>');
    bodyHtml = bodyHtml.replace(/💬\s*(.+)/g, '<div style="background:#e8f5e9;border-left:3px solid #25d366;padding:8px 12px;margin:10px 0 6px 0;font-weight:600;color:#1a3c5e;font-size:13px;border-radius:0 4px 4px 0;">&#x1F4AC; $1</div>');

    // Detail lines
    bodyHtml = bodyHtml.replace(/└\s*(.+)/g, '<div style="margin-left:20px;padding:2px 0;color:#6b7a8d;font-size:11px;">&#x2514; $1</div>');

    // Line breaks
    bodyHtml = bodyHtml.replace(/\n/g, '<br>');

    if (cfg) {
      sectionsHtml += `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
        <tr>
          <td style="background:${cfg.accent};padding:8px 16px;border-radius:6px 6px 0 0;">
            <span style="color:#fff;font-size:14px;font-weight:700;">${cfg.icon} ${cfg.label}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;border:1px solid #e8ecf1;border-top:none;border-radius:0 0 6px 6px;">
            <div style="font-size:13px;line-height:1.7;color:#1a2332;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
      </table>`;
    } else if (sectionBody.trim()) {
      sectionsHtml += `<div style="margin-top:12px;font-size:13px;line-height:1.7;color:#1a2332;">${bodyHtml}</div>`;
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Briefing - ${date}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fb;">
    <tr><td align="center" style="padding:20px 10px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:700px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a3c5e 0%,#2e86ab 100%);padding:24px 24px 20px 24px;">
            <div style="font-size:22px;font-weight:700;color:#ffffff;">Daily Briefing</div>
            <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${date}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;">Generated at ${genTime} BST</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:16px 24px 32px 24px;">
            ${sectionsHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:12px 24px;border-top:1px solid #e8ecf1;text-align:center;">
            <p style="margin:0;color:#8e9baa;font-size:10px;">Daily Briefing System &mdash; Auto-generated</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { buildPrompt, toSlackBlocks, toHtmlEmail };
