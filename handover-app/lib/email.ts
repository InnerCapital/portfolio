import { Resend } from 'resend';
import type { Inspection } from './supabase';
import { format } from 'date-fns';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendSignInviteEmail(inspection: Inspection): Promise<void> {
  if (!inspection.customer_email) throw new Error('No customer email on inspection');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const signUrl = `${baseUrl}/sign/${inspection.customer_sign_token}`;
  const orderId = inspection.booqable_order_id || inspection.id.substring(0, 8).toUpperCase();
  const deliveryDate = inspection.delivery_date
    ? format(new Date(inspection.delivery_date), 'dd MMMM yyyy')
    : '—';
  const unitList = (inspection.units || []).map((u) => `${u.serial_id} — ${u.unit_type}`).join('<br>') || '—';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #000000; padding: 32px; border-bottom: 4px solid #f59e0b; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; letter-spacing: 3px; }
    .header p { color: #f59e0b; margin: 6px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
    .body { padding: 32px; }
    .body p { color: #333; line-height: 1.6; }
    .details-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    .details-table td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    .details-table td:first-child { font-weight: bold; color: #555; width: 40%; }
    .cta-block { text-align: center; padding: 24px 0; }
    .btn-sign { display: inline-block; padding: 16px 40px; background: #f59e0b; color: #000000; border-radius: 4px; text-decoration: none; font-weight: 900; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; }
    .link-fallback { font-size: 12px; color: #888; word-break: break-all; margin-top: 12px; }
    .footer { background: #f5f5f5; padding: 24px 32px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ACME HIRE</h1>
      <p>Handover Certificate</p>
    </div>
    <div class="body">
      <p>Hi ${inspection.customer_name || 'there'},</p>
      <p>Your Acme Hire unit has been delivered and a condition record has been prepared. Please review the details and sign your handover certificate using the button below.</p>

      <table class="details-table">
        <tr><td>Order Reference</td><td>${orderId}</td></tr>
        <tr><td>Units</td><td>${unitList}</td></tr>
        <tr><td>Site Address</td><td>${inspection.site_address || '—'}</td></tr>
        <tr><td>Delivery Date</td><td>${deliveryDate}</td></tr>
      </table>

      <div class="cta-block">
        <a href="${signUrl}" class="btn-sign">Review &amp; Sign Certificate</a>
        <p class="link-fallback">Or copy this link into your browser:<br>${signUrl}</p>
      </div>

      <p style="font-size:13px; color:#888;">
        By signing you confirm the condition of the unit at the time of delivery. This forms part of your rental agreement with Acme Hire. If you have any questions before signing, contact us at <a href="mailto:hello@acmehire.example">hello@acmehire.example</a>.
      </p>
    </div>
    <div class="footer">
      <p><strong>Acme Hire — Acme Hire Limited</strong></p>
      <p>This link is unique to your order. Please do not forward it.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const { error } = await resend.emails.send({
    from: 'Acme Hire <noreply@acmehire.example>',
    to: `${inspection.customer_name || ''} <${inspection.customer_email}>`.trim(),
    subject: `Action required — Sign your Acme Hire handover certificate [${orderId}]`,
    html,
  });
  if (error) throw new Error(error.message);
}

export async function sendHandoverCertificateEmail(inspection: Inspection): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  // The customer's own signed view (token-gated). /record/[id] is staff-only.
  const recordUrl = `${baseUrl}/sign/${inspection.customer_sign_token}/complete`;
  const pdfUrl = inspection.pdf_url || recordUrl;
  const orderId = inspection.booqable_order_id || inspection.id;
  const deliveryDate = inspection.delivery_date
    ? format(new Date(inspection.delivery_date), 'dd MMMM yyyy')
    : '—';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #000000; padding: 32px; }
    .header h1 { color: #ffffff; font-size: 24px; margin: 0; letter-spacing: 2px; }
    .header p { color: #f59e0b; margin: 4px 0 0; font-size: 14px; }
    .body { padding: 32px; }
    .body p { color: #333; line-height: 1.6; }
    .details-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    .details-table td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    .details-table td:first-child { font-weight: bold; color: #555; width: 40%; }
    .btn { display: inline-block; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px; margin: 8px 4px; }
    .btn-primary { background: #000000; color: #ffffff; }
    .btn-secondary { background: #f59e0b; color: #000000; }
    .footer { background: #f5f5f5; padding: 24px 32px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ACME HIRE</h1>
      <p>Handover Certificate</p>
    </div>
    <div class="body">
      <p>Hi ${inspection.customer_name || 'there'},</p>
      <p>Thank you for signing your Acme Hire handover certificate. Your unit has been delivered and the condition record is now complete.</p>

      <table class="details-table">
        <tr><td>Order Reference</td><td>${orderId}</td></tr>
        <tr><td>Units</td><td>${(inspection.units || []).map((u) => `${u.serial_id} (${u.unit_type})`).join(', ') || '—'}</td></tr>
        <tr><td>Site Address</td><td>${inspection.site_address || '—'}</td></tr>
        <tr><td>Delivery Date</td><td>${deliveryDate}</td></tr>
        <tr><td>Signed By</td><td>${inspection.signer_name || '—'}</td></tr>
      </table>

      <p>You can view and download your certificate at any time using the buttons below:</p>

      <div style="text-align:center; padding: 16px 0;">
        <a href="${recordUrl}" class="btn btn-primary">View Your Certificate</a>
        <a href="${pdfUrl}" class="btn btn-secondary">Download PDF</a>
      </div>

      <p style="font-size:13px; color:#888;">
        Please keep a copy of this certificate for your records. It confirms the agreed condition of the unit at the point of delivery and forms part of your rental agreement.
      </p>
    </div>
    <div class="footer">
      <p><strong>Acme Hire — Acme Hire Limited</strong></p>
      <p>Questions? Contact us at <a href="mailto:hello@acmehire.example">hello@acmehire.example</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();

  if (!inspection.customer_email) return; // no email address — skip silently

  const { error } = await resend.emails.send({
    from: 'Acme Hire <noreply@acmehire.example>',
    to: `${inspection.customer_name || ''} <${inspection.customer_email}>`.trim(),
    subject: `Acme Hire — Your Handover Certificate [${orderId}]`,
    html,
  });
  if (error) throw new Error(error.message);
}
