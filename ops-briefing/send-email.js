'use strict';

/**
 * HTTPS-based email senders. Railway blocks outbound SMTP (587/465) on
 * Hobby/Trial plans, so nodemailer/SMTP times out. These providers send
 * over HTTPS (443), which Railway allows.
 *
 *   - Resend:  needs RESEND_API_KEY + a verified sending DOMAIN.
 *   - Brevo:   needs BREVO_API_KEY + a verified single SENDER (email link,
 *              no DNS) — the interim option while the domain is pending.
 *
 * attachments: [{ filename, content: Buffer }]
 */

const https = require('https');

// Parse "Name <email>" or "email" into { name, email }
function parseFrom(from) {
  const m = /^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$/.exec(from || '');
  if (m) return { name: m[1], email: m[2] };
  return { name: null, email: (from || '').trim() };
}

function sendViaResend(opts) {
  const apiKey = opts.apiKey;
  const payload = {
    from: opts.from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.text) payload.text = opts.text;
  if (opts.attachments && opts.attachments.length) {
    payload.attachments = opts.attachments.map(function (a) {
      return {
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64'),
      };
    });
  }

  const body = JSON.stringify(payload);

  return new Promise(function (resolve) {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      function (res) {
        let data = '';
        res.on('data', function (d) { data += d; });
        res.on('end', function () {
          let json = {};
          try { json = JSON.parse(data); } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, id: json.id || null, response: 'Resend accepted (id ' + (json.id || 'n/a') + ')' });
          } else {
            // Resend returns { message, name } on error — surface it plainly
            resolve({ ok: false, error: (json && json.message) || ('Resend HTTP ' + res.statusCode + ': ' + data.slice(0, 300)) });
          }
        });
      }
    );
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.write(body);
    req.end();
  });
}

function sendViaBrevo(opts) {
  const apiKey = opts.apiKey;
  const from = parseFrom(opts.from);
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(function (e) { return { email: e }; });

  const payload = {
    sender: from.name ? { email: from.email, name: from.name } : { email: from.email },
    to: to,
    subject: opts.subject,
  };
  if (opts.html) payload.htmlContent = opts.html;
  if (opts.text) payload.textContent = opts.text;
  if (!payload.htmlContent && !payload.textContent) payload.textContent = ' ';
  if (opts.attachments && opts.attachments.length) {
    payload.attachment = opts.attachments.map(function (a) {
      return {
        name: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64'),
      };
    });
  }

  const body = JSON.stringify(payload);

  return new Promise(function (resolve) {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      function (res) {
        let data = '';
        res.on('data', function (d) { data += d; });
        res.on('end', function () {
          let json = {};
          try { json = JSON.parse(data); } catch (e) {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, id: (json && json.messageId) || null, response: 'Brevo accepted (' + ((json && json.messageId) || 'sent') + ')' });
          } else {
            resolve({ ok: false, error: (json && json.message) || ('Brevo HTTP ' + res.statusCode + ': ' + data.slice(0, 300)) });
          }
        });
      }
    );
    req.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    req.write(body);
    req.end();
  });
}

/**
 * Picks a provider from env and sends. Priority: explicit EMAIL_PROVIDER,
 * else Resend key, else Brevo key, else none.
 * Returns { ok, via, response?, error? }.
 */
async function sendEmail(opts) {
  const forced = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasBrevo = !!process.env.BREVO_API_KEY;

  let provider = forced;
  if (!provider) provider = hasResend ? 'resend' : (hasBrevo ? 'brevo' : '');

  if (provider === 'resend') {
    if (!process.env.RESEND_API_KEY) return { ok: false, via: 'resend', error: 'RESEND_API_KEY not set' };
    const r = await sendViaResend(Object.assign({ apiKey: process.env.RESEND_API_KEY }, opts));
    return Object.assign({ via: 'resend' }, r);
  }
  if (provider === 'brevo') {
    if (!process.env.BREVO_API_KEY) return { ok: false, via: 'brevo', error: 'BREVO_API_KEY not set' };
    const r = await sendViaBrevo(Object.assign({ apiKey: process.env.BREVO_API_KEY }, opts));
    return Object.assign({ via: 'brevo' }, r);
  }
  return { ok: false, via: 'none', error: 'No email provider configured (set BREVO_API_KEY or RESEND_API_KEY)' };
}

module.exports = { sendViaResend, sendViaBrevo, sendEmail };
