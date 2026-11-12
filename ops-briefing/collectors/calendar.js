/**
 * Google Calendar Collector
 * Fetches today's events, detects conflicts, flags imminent meetings
 */

const { google } = require('googleapis');
const { getAuthClient } = require('./google-auth');
const fs = require('fs');
const path = require('path');

async function collectCalendar(config) {
  // Read the SAME config the rest of the app uses (persistent volume on Railway),
  // not the repo default — otherwise the connected accounts list is empty.
  const configFilePath = process.env.PERSISTENT_DATA_DIR
    ? path.join(process.env.PERSISTENT_DATA_DIR, 'config.json')
    : path.join(__dirname, '..', 'config.json');
  const mainCfg = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

  // Read across EVERY connected Google account (e.g. acmehire.example) — not just one.
  let accounts = config._authAccount ? [config._authAccount] : (mainCfg.streams.business.gmail.accounts || []);
  if (!accounts || accounts.length === 0) throw new Error('No Google accounts connected — add one in Settings');

  // Read timezone from main config; fallback to Europe/London
  let tz = (mainCfg.briefing && mainCfg.briefing.timezone) || 'Europe/London';

  // Today's boundaries in configured timezone
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  const startOfDay = new Date(todayStr + 'T00:00:00');
  const endOfDay = new Date(todayStr + 'T23:59:59.999');

  let events = [];

  // For each connected account, read EVERY calendar it can see (not just 'primary').
  for (const accountEmail of accounts) {
    let calendar;
    try {
      const auth = await getAuthClient(accountEmail);
      calendar = google.calendar({ version: 'v3', auth });
    } catch (e) {
      console.log(`  Calendar (${accountEmail}): auth failed — ${e.message}`);
      continue;
    }

    let calendarIds = [{ id: 'primary', name: 'Primary' }];
    try {
      const listRes = await calendar.calendarList.list({ maxResults: 50 });
      const items = (listRes.data.items || []).filter(c => c.selected !== false);
      if (items.length > 0) {
        calendarIds = items.map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id }));
      }
    } catch (e) {
      console.log(`  Calendar (${accountEmail}): could not list calendars (${e.message}) — using primary only`);
    }

    for (const cal of calendarIds) {
    try {
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 30,
      });
      const mapped = (res.data.items || []).map(ev => {
        const start = ev.start.dateTime || ev.start.date;
        const end = ev.end.dateTime || ev.end.date;
        const isAllDay = !ev.start.dateTime;
        const startDate = new Date(start);
        const endDate = new Date(end);

        const minutesUntilStart = Math.round((startDate - now) / 60000);
        const durationMin = isAllDay ? null : Math.round((endDate - startDate) / 60000);

        return {
          time: isAllDay ? 'All day' : startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
          title: ev.summary || 'Untitled',
          duration: durationMin ? `${durationMin} min` : 'All day',
          location: ev.location || (ev.hangoutLink ? 'Google Meet' : ''),
          calendarName: cal.name,
          account: accountEmail,
          source: 'business',
          attendees: (ev.attendees || []).length,
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          isAllDay,
          imminent: !isAllDay && minutesUntilStart >= 0 && minutesUntilStart <= (config.flagWithinMinutes || 30),
          isConflict: false, // set below
        };
      });
      events = events.concat(mapped);
    } catch (e) {
      console.log(`  Calendar "${cal.name}" (${accountEmail}): ${e.message}`);
    }
    } // end calendars loop
  } // end accounts loop

  // Sort merged events by start time
  events.sort((a, b) => a.startMs - b.startMs);

  // Detect conflicts (overlapping non-all-day events)
  const timed = events.filter(e => !e.isAllDay);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[i].endMs > timed[j].startMs && timed[i].startMs < timed[j].endMs) {
        timed[i].isConflict = true;
        timed[j].isConflict = true;
      }
    }
  }

  console.log(`  Calendar: ${events.length} events (${timed.filter(e => e.isConflict).length} conflicts)`);
  return events;
}

module.exports = { collectCalendar };
