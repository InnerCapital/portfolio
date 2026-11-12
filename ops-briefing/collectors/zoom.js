'use strict';

/**
 * Zoom collector — official Server-to-Server OAuth API (no scraping, no captcha).
 * Replaces the old LinkedIn scraper.
 *
 * Provides two things for the briefing:
 *   1. upcomingMeetings — Zoom meetings (topic, time, join link) to enrich the calendar.
 *   2. meetingNotes     — AI Companion meeting summaries + next steps (richer context).
 *
 * Requires env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 * Optional env: ZOOM_USER_ID (email or userId; defaults to 'me').
 * Meeting summaries require a paid Zoom plan with AI Companion + Meeting Summary enabled,
 * and the S2S app scopes: meeting_summary:read:list_summaries:admin,
 * meeting_summary:read:summary:admin, meeting:read:list_meetings:admin.
 */

const https = require('https');

function httpsRequest(options, body) {
  return new Promise(function (resolve) {
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (d) { data += d; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, json: json, raw: data });
      });
    });
    req.on('error', function () { resolve({ status: 0, json: null, raw: '' }); });
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom not configured (set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in Railway).');
  }
  const auth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  const path = '/oauth/token?grant_type=account_credentials&account_id=' + encodeURIComponent(accountId);
  const r = await httpsRequest({
    hostname: 'zoom.us', path: path, method: 'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Length': 0 },
  });
  if (r.status !== 200 || !r.json || !r.json.access_token) {
    throw new Error('Zoom auth failed (' + r.status + '): ' + ((r.json && (r.json.reason || r.json.message)) || r.raw.slice(0, 200)));
  }
  return r.json.access_token;
}

function apiGet(token, path) {
  return httpsRequest({
    hostname: 'api.zoom.us', path: path, method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  });
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

async function collectZoom(config) {
  const token = await getToken();
  const result = { upcomingMeetings: [], meetingNotes: [] };
  const lookbackDays = (config && config.lookbackDays) || 2;
  const userId = process.env.ZOOM_USER_ID || 'me';

  // ── Upcoming meetings (calendar enrichment) ── best effort
  try {
    const r = await apiGet(token, '/v2/users/' + encodeURIComponent(userId) + '/meetings?type=upcoming&page_size=30');
    if (r.status === 200 && r.json && Array.isArray(r.json.meetings)) {
      result.upcomingMeetings = r.json.meetings.map(function (m) {
        return { topic: m.topic, start_time: m.start_time, duration: m.duration, join_url: m.join_url, id: m.id };
      });
    } else if (r.status === 404) {
      console.log('  Zoom: user "' + userId + '" not found for meetings — set ZOOM_USER_ID to Alex\'s Zoom email.');
    }
  } catch (e) { /* non-fatal */ }

  // ── Meeting summaries (AI Companion notes) in the lookback window ──
  try {
    const to = new Date();
    const from = new Date(Date.now() - lookbackDays * 86400000);
    const listR = await apiGet(token, '/v2/meetings/meeting_summaries?from=' + fmtDate(from) + '&to=' + fmtDate(to) + '&page_size=30');
    if (listR.status === 200 && listR.json && Array.isArray(listR.json.summaries)) {
      for (const s of listR.json.summaries) {
        let overview = '', details = [], nextSteps = [];
        try {
          const uuid = s.meeting_uuid || String(s.meeting_id);
          // Zoom requires double URL-encoding for UUIDs that start with / or contain //
          let idPath = encodeURIComponent(uuid);
          if (uuid.indexOf('/') === 0 || uuid.indexOf('//') !== -1) idPath = encodeURIComponent(encodeURIComponent(uuid));
          const dR = await apiGet(token, '/v2/meetings/' + idPath + '/meeting_summary');
          if (dR.status === 200 && dR.json) {
            overview = dR.json.summary_overview || '';
            details = (dR.json.summary_details || []).map(function (d) { return { label: d.label, summary: d.summary }; });
            nextSteps = dR.json.next_steps || [];
          }
        } catch (e) { /* skip this summary's detail */ }
        result.meetingNotes.push({
          topic: s.meeting_topic,
          start_time: s.meeting_start_time,
          host: s.meeting_host_email,
          overview: overview,
          details: details,
          nextSteps: nextSteps,
        });
      }
    } else if (listR.status === 400 || listR.status === 401) {
      console.log('  Zoom summaries unavailable (' + listR.status + '): needs AI Companion + meeting_summary scopes on the S2S app.');
    }
  } catch (e) { /* non-fatal */ }

  return result;
}

/**
 * Create a Zoom meeting on the account and return the join link.
 * opts: { topic, start_time (ISO 8601, optional), duration (minutes), timezone }
 * Omit start_time for an instant meeting. Needs the meeting:write scope on the app.
 */
async function createMeeting(opts) {
  const token = await getToken();
  const userId = process.env.ZOOM_USER_ID || 'me';
  const payload = {
    topic: opts.topic || 'Meeting',
    type: opts.start_time ? 2 : 1, // 2 = scheduled, 1 = instant
    duration: opts.duration || 30,
    timezone: opts.timezone || 'Europe/London',
    settings: { join_before_host: true, waiting_room: false },
  };
  if (opts.start_time) payload.start_time = opts.start_time;
  const body = JSON.stringify(payload);
  const r = await httpsRequest({
    hostname: 'api.zoom.us',
    path: '/v2/users/' + encodeURIComponent(userId) + '/meetings',
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if (r.status === 201 && r.json) {
    return { ok: true, topic: r.json.topic, start_time: r.json.start_time || null, join_url: r.json.join_url, start_url: r.json.start_url, id: r.json.id };
  }
  return { ok: false, error: 'Zoom create meeting failed (' + r.status + '): ' + ((r.json && r.json.message) || r.raw.slice(0, 200)) };
}

module.exports = { collectZoom, getToken, createMeeting };
