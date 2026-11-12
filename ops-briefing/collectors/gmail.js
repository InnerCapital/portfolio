/**
 * Gmail Collector
 * Fetches emails from multiple Gmail accounts, applies urgency scoring,
 * flags unreplied threads
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');

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

/**
 * Score urgency based on keywords in subject and snippet
 * 3 = urgent, 2 = needs confirmation, 1 = informational
 */
function scoreUrgency(subject, snippet, config) {
  const text = `${subject} ${snippet}`.toLowerCase();
  for (const kw of (config.urgencyKeywords.high || [])) {
    if (text.includes(kw.toLowerCase())) return 3;
  }
  for (const kw of (config.urgencyKeywords.medium || [])) {
    if (text.includes(kw.toLowerCase())) return 2;
  }
  return 1;
}

/**
 * Check if Alex has replied to a thread
 */
async function isUnreplied(gmail, threadId, accountEmail) {
  try {
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['From', 'Date'],
    });

    const messages = thread.data.messages || [];
    if (messages.length === 0) return { unreplied: false, hours: 0 };

    const lastMsg = messages[messages.length - 1];
    const fromHeader = (lastMsg.payload.headers || []).find(h => h.name === 'From');
    const dateHeader = (lastMsg.payload.headers || []).find(h => h.name === 'Date');

    const from = fromHeader ? fromHeader.value : '';
    const isFromAlex = from.toLowerCase().includes(accountEmail.toLowerCase());

    if (isFromAlex) return { unreplied: false, hours: 0 };

    // Last message is from someone else — check how long ago
    const msgDate = dateHeader ? new Date(dateHeader.value) : new Date();
    const hours = Math.round((Date.now() - msgDate.getTime()) / 3600000);

    return { unreplied: true, hours };
  } catch (e) {
    return { unreplied: false, hours: 0 };
  }
}

/**
 * Collect emails from one Gmail account
 */
async function collectFromAccount(accountEmail, config) {
  console.log(`  Scanning ${accountEmail}...`);

  const auth = await getAuthClient(accountEmail);
  const gmail = google.gmail({ version: 'v1', auth });

  // Calculate time range
  const lookback = config.lookbackHours || 24;
  const after = Math.floor((Date.now() - lookback * 3600000) / 1000);

  // Fetch messages
  const res = await callWithRetry(() => gmail.users.messages.list({
    userId: 'me',
    q: `after:${after} in:inbox`,
    maxResults: 500, // Gmail API max per request
  }));

  const messages = res.data.messages || [];
  console.log(`  Found ${messages.length} messages`);

  const emails = [];

  for (const msg of messages) {
    try {
      const detail = await callWithRetry(() => gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      }));

      const headers = detail.data.payload.headers || [];
      const fromH = headers.find(h => h.name === 'From');
      const subjectH = headers.find(h => h.name === 'Subject');
      const dateH = headers.find(h => h.name === 'Date');

      const from = fromH ? fromH.value : 'Unknown';
      const subject = subjectH ? subjectH.value : '(No subject)';
      const snippet = detail.data.snippet || '';
      const date = dateH ? dateH.value : '';

      // Parse sender name and email
      const senderMatch = from.match(/^(.+?)\s*<(.+?)>$/);
      const senderName = senderMatch ? senderMatch[1].replace(/"/g, '') : from.split('@')[0];
      const senderEmail = senderMatch ? senderMatch[2] : from;

      // Urgency scoring
      const urgency = scoreUrgency(subject, snippet, config);

      // Check if unreplied
      const threadId = detail.data.threadId;
      let unreplied = false;
      let unrepliedHours = 0;

      if (config.flagUnrepliedAfterHours) {
        const reply = await isUnreplied(gmail, threadId, accountEmail);
        unreplied = reply.unreplied && reply.hours >= config.flagUnrepliedAfterHours;
        unrepliedHours = reply.hours;
      }

      // Format time
      const msgDate = new Date(date);
      const now = new Date();
      const isToday = msgDate.toDateString() === now.toDateString();
      const time = isToday
        ? msgDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : msgDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
          msgDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      emails.push({
        account: accountEmail,
        sender: senderName,
        senderEmail,
        subject,
        time,
        urgency,
        summary: snippet.substring(0, 200),
        unreplied,
        unrepliedHours,
      });
    } catch (e) {
      console.log(`  ⚠ Error reading message: ${e.message}`);
    }
  }

  // Sort by urgency (highest first)
  emails.sort((a, b) => b.urgency - a.urgency);

  return emails;
}

/**
 * Main collector — fetches from all configured accounts
 */
async function collectGmail(config) {
  const allEmails = [];

  for (const account of config.accounts) {
    try {
      const emails = await collectFromAccount(account, config);
      allEmails.push(...emails);
    } catch (e) {
      console.log(`  ✗ Failed for ${account}: ${e.message}`);
    }
  }

  // Sort all by urgency
  allEmails.sort((a, b) => b.urgency - a.urgency);
  return allEmails;
}

module.exports = { collectGmail };
