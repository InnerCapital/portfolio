/**
 * Slack Collector
 * Fetches channel messages and DMs from last 24 hours
 */

const { WebClient } = require('@slack/web-api');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cache user lookups to avoid redundant API calls
const userCache = new Map();

async function lookupUser(slack, userId) {
  if (userCache.has(userId)) return userCache.get(userId);
  try {
    const userInfo = await slack.users.info({ user: userId });
    const name = userInfo.user.real_name || userInfo.user.name || 'Unknown';
    userCache.set(userId, name);
    return name;
  } catch (e) {
    userCache.set(userId, userId);
    return userId;
  }
}

async function collectSlack(config) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN not set in .env');

  const slack = new WebClient(token);
  const results = [];
  const lookbackHours = config.lookbackHours || 24;
  const lookback = Math.floor((Date.now() - lookbackHours * 3600000) / 1000);

  // Get user info for Alex detection
  const authTest = await slack.auth.test();
  const botUserId = authTest.user_id;

  // Get all channels the bot is in
  const channels = await slack.conversations.list({
    types: 'public_channel,private_channel,im,mpim',
    limit: 200,
  });

  const flagKeywords = (config.flagKeywords || []).map(k => k.toLowerCase());

  for (const ch of (channels.channels || [])) {
    try {
      // Rate limit: Slack Tier 3 allows ~1 req/sec for conversations.history
      await sleep(1100);

      const history = await slack.conversations.history({
        channel: ch.id,
        oldest: String(lookback),
        limit: 20,
      });

      const msgs = history.messages || [];
      if (msgs.length === 0) continue;

      const isDM = ch.is_im || ch.is_mpim;
      const channelName = isDM ? `DM` : `#${ch.name}`;

      for (const msg of msgs) {
        if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave') continue;

        const text = msg.text || '';
        const mentionsAlex = text.includes(`<@${botUserId}>`) || text.toLowerCase().includes('alex');
        const matchedKeywords = flagKeywords.filter(kw => text.toLowerCase().includes(kw));

        // Get sender name (cached to avoid redundant API calls)
        let sender = 'Unknown';
        if (msg.user) {
          sender = await lookupUser(slack, msg.user);
        }

        const timestamp = new Date(parseFloat(msg.ts) * 1000);
        const isToday = timestamp.toDateString() === new Date().toDateString();
        const timeStr = isToday
          ? timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : timestamp.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
            timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        results.push({
          channel: channelName,
          sender,
          message: text.substring(0, 300),
          timestamp: timeStr,
          mentionsAlex,
          isDM,
          keywords: matchedKeywords,
        });
      }
    } catch (e) {
      // Skip channels we can't access
    }
  }

  // Sort: DMs first, then flagged, then rest
  results.sort((a, b) => {
    if (a.isDM && !b.isDM) return -1;
    if (!a.isDM && b.isDM) return 1;
    if (a.mentionsAlex && !b.mentionsAlex) return -1;
    if (!a.mentionsAlex && b.mentionsAlex) return 1;
    if (a.keywords.length > 0 && b.keywords.length === 0) return -1;
    return 0;
  });

  console.log(`  Slack: ${results.length} messages (${results.filter(r => r.isDM).length} DMs, ${results.filter(r => r.mentionsAlex).length} mentions)`);
  return results;
}

module.exports = { collectSlack };