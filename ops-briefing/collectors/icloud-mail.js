/**
 * iCloud Mail Collector (IMAP)
 * Fetches unread emails from owner@example.com via IMAP
 *
 * Requires: app-specific password from appleid.apple.com
 */

async function collectICloudMail(config) {
  const { ImapFlow } = require('imapflow');

  const email = config.email || process.env.ICLOUD_EMAIL;
  const password = process.env.ICLOUD_APP_PASSWORD;

  if (!email || !password) {
    throw new Error('ICLOUD_EMAIL and ICLOUD_APP_PASSWORD required in .env');
  }

  const client = new ImapFlow({
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  const results = [];

  try {
    // Fetch unseen messages from last 24 hours
    const since = new Date(Date.now() - 24 * 3600000);

    const msgs = client.fetch(
      { seen: false, since },
      { envelope: true, bodyStructure: true, source: { size: 500 } }
    );

    for await (const msg of msgs) {
      const env = msg.envelope;
      const from = env.from && env.from[0];

      results.push({
        sender: from ? (from.name || `${from.mailbox}@${from.host}`) : 'Unknown',
        senderEmail: from ? `${from.mailbox}@${from.host}` : '',
        subject: env.subject || '(No subject)',
        time: env.date ? new Date(env.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
        snippet: '', // IMAP doesn't provide snippets easily
      });
    }
  } finally {
    lock.release();
  }

  await client.logout();

  console.log(`  iCloud Mail: ${results.length} unread messages`);
  return results;
}

module.exports = { collectICloudMail };
