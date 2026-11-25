import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import type { Inspection, Photo, ChecklistItem } from './supabase';
import { getChecklistGroups } from './checklist';
import { format } from 'date-fns';

const TITLES = {
  site: { checkout: 'Handover & Commissioning Certificate', checkin: 'Collection Certificate' },
  depot: { checkout: 'Pre-Dispatch Depot Check', checkin: 'Post-Return Depot Check' },
} as const;

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_GREY = rgb(0.9, 0.9, 0.9);
const AMBER = rgb(0.95, 0.6, 0.1);
const GREEN = rgb(0.1, 0.7, 0.3);
const WHITE = rgb(1, 1, 1);

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = BLACK
) {
  page.drawText(text, { x, y, font, size, color });
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x, y, width: w, height: h,
    color,
    borderColor,
    borderWidth: borderColor ? 0.5 : 0,
  });
}

export async function generatePdf(inspection: Inspection): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595; // A4
  const pageHeight = 842;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  // Header bar
  const isDepot = inspection.location === 'depot';
  const certTitle = TITLES[inspection.location ?? 'site'][inspection.type];
  drawRect(page, 0, pageHeight - 60, pageWidth, 60, BLACK);
  drawText(page, 'ACME HIRE', margin, pageHeight - 38, boldFont, 20, WHITE);
  drawText(page, certTitle, pageWidth - margin - 230, pageHeight - 38, regularFont, 10, WHITE);
  y = pageHeight - 75;

  // Order details table
  ensureSpace(120);
  drawRect(page, margin, y - 100, contentWidth, 100, LIGHT_GREY);
  drawText(page, 'DELIVERY DETAILS', margin + 10, y - 15, boldFont, 9, GREY);

  const col1x = margin + 10;
  const col2x = margin + contentWidth / 2 + 10;
  const rows = [
    ['Customer', inspection.customer_name || '—', 'Company', inspection.company_name || '—'],
    ['Site Address', inspection.site_address || '—', 'Units', (inspection.units || []).map((u) => u.serial_id).join(', ') || '—'],
    ['Delivery Date', inspection.delivery_date ? format(new Date(inspection.delivery_date), 'dd MMM yyyy') : '—', 'Delivery Time', inspection.delivery_time || '—'],
    ['Rental Start', inspection.rental_start ? format(new Date(inspection.rental_start), 'dd MMM yyyy') : '—', 'Rental End', inspection.rental_end ? format(new Date(inspection.rental_end), 'dd MMM yyyy') : '—'],
  ];

  rows.forEach((row, i) => {
    const ry = y - 30 - i * 18;
    drawText(page, row[0] + ':', col1x, ry, boldFont, 8, GREY);
    drawText(page, row[1], col1x + 65, ry, regularFont, 8);
    drawText(page, row[2] + ':', col2x, ry, boldFont, 8, GREY);
    drawText(page, row[3], col2x + 70, ry, regularFont, 8);
  });
  y -= 115;

  // Power & notes
  if (inspection.power_connected !== undefined || inspection.general_notes) {
    ensureSpace(50);
    drawText(page, 'Power Connection:', margin, y, boldFont, 9);
    drawText(page, inspection.power_connected ? 'Connected' : 'Not connected', margin + 110, y, regularFont, 9,
      inspection.power_connected ? GREEN : AMBER);
    y -= 14;
    if (inspection.power_notes) {
      drawText(page, 'Power Notes: ' + inspection.power_notes, margin, y, regularFont, 8, GREY);
      y -= 14;
    }
    if (inspection.general_notes) {
      drawText(page, 'General Notes: ' + inspection.general_notes.substring(0, 120), margin, y, regularFont, 8, GREY);
      y -= 14;
    }
    y -= 6;
  }

  // Photos section
  ensureSpace(20);
  drawText(page, 'PHOTOGRAPHIC EVIDENCE', margin, y, boldFont, 10);
  y -= 18;

  const photos: Photo[] = (inspection.units || []).flatMap((u) => u.photos || []);
  const photoSlotW = (contentWidth - 20) / 3;
  const photoSlotH = 90;
  const photoCols = 3;

  for (let i = 0; i < photos.length; i++) {
    const col = i % photoCols;
    const isRowStart = col === 0;

    if (isRowStart && i > 0) y -= photoSlotH + 20;
    ensureSpace(photoSlotH + 25);
    if (isRowStart && i > 0) {
      // already adjusted
    }

    const px = margin + col * (photoSlotW + 10);
    const py = y - photoSlotH;

    drawRect(page, px, py, photoSlotW, photoSlotH, LIGHT_GREY, GREY);

    try {
      if (photos[i].url && photos[i].url.startsWith('data:image/')) {
        const base64 = photos[i].url.split(',')[1];
        const imgBytes = Buffer.from(base64, 'base64');
        let embeddedImg;
        if (photos[i].url.includes('image/png')) {
          embeddedImg = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImg = await pdfDoc.embedJpg(imgBytes);
        }
        const dims = embeddedImg.scaleToFit(photoSlotW - 4, photoSlotH - 4);
        page.drawImage(embeddedImg, {
          x: px + (photoSlotW - dims.width) / 2,
          y: py + (photoSlotH - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      }
    } catch {
      // photo embed failed — show placeholder
    }

    drawText(page, photos[i].label, px + 4, py - 12, regularFont, 7, GREY);
  }

  const photosInLastRow = photos.length % photoCols;
  if (photosInLastRow === 0 && photos.length > 0) y -= photoSlotH + 25;
  else if (photos.length > 0) y -= photoSlotH + 25;

  // Checklist section
  ensureSpace(30);
  y -= 10;
  drawText(page, 'CONDITION CHECKLIST', margin, y, boldFont, 10);
  y -= 16;

  const checklist = inspection.checklist || {};
  const issueItems: string[] = [];

  for (const group of getChecklistGroups(inspection.location ?? 'site')) {
    ensureSpace(20);
    drawText(page, group.label.toUpperCase(), margin, y, boldFont, 8, GREY);
    y -= 14;

    for (const item of group.items) {
      ensureSpace(16);
      const entry: ChecklistItem = checklist[item.id] || { status: null };
      const statusColor = entry.status === 'pass' ? GREEN : entry.status === 'issue' ? AMBER : GREY;
      const statusText = entry.status === 'pass' ? 'PASS' : entry.status === 'issue' ? 'ISSUE' : '—';

      drawText(page, item.label, margin + 10, y, regularFont, 8);
      drawText(page, statusText, margin + contentWidth - 60, y, boldFont, 8, statusColor);
      y -= 12;

      if (entry.status === 'issue' && entry.notes) {
        issueItems.push(`${item.label}: ${entry.notes}`);
        drawText(page, '   ' + entry.notes, margin + 10, y, regularFont, 7, AMBER);
        y -= 11;
      }
    }
    y -= 6;
  }

  // Issues summary
  if (issueItems.length > 0) {
    ensureSpace(20 + issueItems.length * 12);
    drawRect(page, margin, y - (issueItems.length * 12 + 14), contentWidth, issueItems.length * 12 + 20, rgb(1, 0.97, 0.9));
    drawText(page, 'ISSUES NOTED', margin + 8, y - 6, boldFont, 9, AMBER);
    y -= 20;
    for (const issue of issueItems) {
      drawText(page, '• ' + issue.substring(0, 90), margin + 8, y, regularFont, 8);
      y -= 12;
    }
    y -= 8;
  }

  // Acknowledgement text — customer legal block for site events only. Depot checks
  // are internal (no customer party), so this is a plain inspected-by line instead.
  if (isDepot) {
    ensureSpace(30);
    y -= 8;
    drawText(
      page,
      `Inspected by: ${inspection.signer_name || '—'}${inspection.signer_position ? ` (${inspection.signer_position})` : ''} — ${inspection.signed_at ? format(new Date(inspection.signed_at), 'dd MMM yyyy HH:mm') : '—'}`,
      margin,
      y,
      regularFont,
      9
    );
    y -= 20;
  } else {
    ensureSpace(100);
    y -= 8;
    drawRect(page, margin, y - 90, contentWidth, 95, rgb(0.97, 0.97, 0.97));
    const ackLines = [
      'By signing below, you confirm that:',
      '(a) The Acme Hire unit(s) have been delivered, installed, and commissioned as described.',
      '(b) The condition of the unit(s) is as recorded in this certificate, subject to any notes stated.',
      '(c) Acme Hire has taken photographs of the unit condition at delivery, which form part of the agreed condition evidence.',
      '(d) Responsibility for the unit(s), including risk of loss or damage, transfers to you upon signature.',
      '(e) You have read and accept all obligations in the Master Rental Agreement.',
    ];
    let ay = y - 12;
    for (const line of ackLines) {
      drawText(page, line, margin + 8, ay, line.startsWith('By') ? boldFont : regularFont, 7);
      ay -= 12;
    }
    y -= 98;
  }

  // Signature section
  ensureSpace(80);
  y -= 10;
  drawText(page, 'SIGNATURE', margin, y, boldFont, 10);
  y -= 18;

  drawText(page, 'Name:', margin, y, boldFont, 9);
  drawText(page, inspection.signer_name || '—', margin + 45, y, regularFont, 9);
  drawText(page, 'Position:', margin + contentWidth / 2, y, boldFont, 9);
  drawText(page, inspection.signer_position || '—', margin + contentWidth / 2 + 55, y, regularFont, 9);
  y -= 14;

  drawText(page, 'Date:', margin, y, boldFont, 9);
  drawText(page, inspection.signed_at ? format(new Date(inspection.signed_at), 'dd MMM yyyy HH:mm') : '—', margin + 45, y, regularFont, 9);
  y -= 20;

  if (inspection.signature_image_url) {
    try {
      const base64 = inspection.signature_image_url.split(',')[1];
      const imgBytes = Buffer.from(base64, 'base64');
      const sigImg = await pdfDoc.embedPng(imgBytes);
      const dims = sigImg.scaleToFit(200, 60);
      drawRect(page, margin, y - 65, 210, 65, WHITE, GREY);
      page.drawImage(sigImg, { x: margin + 5, y: y - dims.height - 2, width: dims.width, height: dims.height });
    } catch {
      drawRect(page, margin, y - 65, 210, 65, LIGHT_GREY, GREY);
    }
    y -= 75;
  }

  // Footer
  const footerY = margin - 5;
  page.drawLine({ start: { x: margin, y: footerY + 12 }, end: { x: pageWidth - margin, y: footerY + 12 }, thickness: 0.5, color: LIGHT_GREY });
  drawText(page, `Order: ${inspection.booqable_order_id || inspection.id} | Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} | Acme Hire — AcmeCo Limited`, margin, footerY, regularFont, 7, GREY);

  // Add footer to all pages
  const pages = pdfDoc.getPages();
  for (let p = 0; p < pages.length; p++) {
    const pg = pages[p];
    pg.drawLine({ start: { x: margin, y: margin + 12 }, end: { x: pageWidth - margin, y: margin + 12 }, thickness: 0.5, color: LIGHT_GREY });
    drawText(pg, `Order: ${inspection.booqable_order_id || inspection.id} | Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} | Acme Hire — AcmeCo Limited`, margin, margin, regularFont, 7, GREY);
    drawText(pg, `Page ${p + 1} of ${pages.length}`, pageWidth - margin - 40, margin, regularFont, 7, GREY);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
