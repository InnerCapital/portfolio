// netlify/functions/lib/generateDeclarationPdf.js
//
// Generates the signed-declaration PDF (checklist state, timestamp, signature)
// for the Job Folder. Structure follows the pattern already proven in the
// sibling app (handover-app/lib/generatePdf.ts) — same library,
// same header-bar layout — adapted to this app's data shape and brand.
//
// IMPORTANT: pdf-lib's default WinAnsi encoding cannot render ✓/⚠/✕ glyphs —
// confirmed by direct testing in the sibling app. Use plain ASCII (YES/NO)
// instead, not checkmark characters, or PDF generation will throw.
//
// The 12 checklist item labels below must stay in the same order as the
// `.ci` elements on #page-10 in index.html — the submitted `checklist` array
// is booleans only (no labels, to avoid changing the payload shape Code.gs
// also reads), so this is a positional match, not a keyed one. If the
// checklist items in index.html ever change, update this list too.
const CHECKLIST_LABELS = [
  "All equipment queries sent to the electrician Gas Services (0161 637 8470) and resolved",
  "Power compatibility independently verified against unit specs",
  "Equipment delivery, installation and collection confirmed with supplier",
  "Files named correctly: [TradingName]_[Screen]_[ContentType] - min 1920x1080px",
  "Screen layout chosen (A mirror / B split) and any timing notes added",
  "Screen artwork uploaded at least 7 days before delivery",
  "EHO registration and food safety documentation in order - originals to site",
  "Staff briefed on unit layout, power limits and screen startup procedure",
  "Escalation contacts saved - Acme Hire rep / the electrician Gas Services / hello@acmehire.example",
  "Confirmed with Acme Hire rep whether my unit has its own Starlink",
  "Walk unit on arrival - verify fit-out, screens and content before trading",
  "Bar units: beer lines and dispense equipment cleaned and flushed before collection",
];

async function generateDeclarationPdf(data) {
  const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

  const BLACK = rgb(0.04, 0.04, 0.04);
  const GREY = rgb(0.4, 0.4, 0.4);
  const LIGHT_GREY = rgb(0.93, 0.93, 0.93);
  const YELLOW = rgb(0.976, 0.659, 0);
  const WHITE = rgb(1, 1, 1);

  const pdfDoc = await PDFDocument.create();
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 595, pageHeight = 842, margin = 40;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => { page = pdfDoc.addPage([pageWidth, pageHeight]); y = pageHeight - margin; };
  const ensureSpace = (needed) => { if (y - needed < margin) newPage(); };
  const text = (t, x, yy, font, size, color) => page.drawText(String(t || ""), { x, y: yy, font, size, color: color || BLACK });
  const rect = (x, yy, w, h, color) => page.drawRectangle({ x, y: yy, width: w, height: h, color });

  // Header bar
  rect(0, pageHeight - 60, pageWidth, 60, BLACK);
  text("ACME HIRE", margin, pageHeight - 38, bold, 20, WHITE);
  text("Declaration Confirmed  ·  AH-TBP-2026", pageWidth - margin - 220, pageHeight - 38, regular, 10, WHITE);
  y = pageHeight - 80;

  // Form details
  const rows = [
    ["Customer", data.company],
    ["Trading Brand", data.brand],
    ["Unit Type(s)", data.unitTypes],
    ["Number of Units", data.unitCount],
    ["Event & Venue", data.event],
    ["Hire Dates", data.dates],
    ["Primary Contact", data.contactName],
    ["Contact Phone", data.contactPhone],
    ["Contact Email", data.email],
    ["Date Signed", data.signedDate],
    ["Trading Partner", data.tradingPartnerName || "None"],
  ].filter((r) => r[1]);

  const rowH = 16;
  ensureSpace(rows.length * rowH + 20);
  text("FORM DETAILS", margin, y, bold, 9, GREY);
  y -= 14;
  rows.forEach(([label, value]) => {
    text(label, margin, y, regular, 9, GREY);
    text(String(value), margin + 160, y, bold, 10, BLACK);
    y -= rowH;
  });

  // Checklist
  y -= 10;
  ensureSpace(30);
  text("PRE-EVENT CHECKLIST", margin, y, bold, 9, GREY);
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  const checkedCount = checklist.filter(Boolean).length;
  text(`${checkedCount} / ${CHECKLIST_LABELS.length} COMPLETE`, pageWidth - margin - 110, y, bold, 9, GREY);
  y -= 16;

  CHECKLIST_LABELS.forEach((label, i) => {
    ensureSpace(20);
    const checked = checklist[i] === true;
    rect(margin, y - 10, 12, 12, checked ? YELLOW : LIGHT_GREY);
    text(checked ? "Y" : "-", margin + 3.5, y - 8, bold, 8, checked ? BLACK : GREY);
    text(label, margin + 20, y - 8, regular, 9, BLACK);
    y -= 18;
  });

  // Confirmation statement — brief, not the full legal text (that's the
  // trader's own declaration page / the Hire Agreement itself).
  y -= 10;
  ensureSpace(40);
  text("The undersigned, on behalf of the Customer, confirms they have read and agree to the", margin, y, regular, 9, GREY);
  y -= 12;
  text("Acme Hire Hire Agreement and have reviewed the Trader Briefing Pack (AH-TBP-2026) in full.", margin, y, regular, 9, GREY);
  y -= 22;

  // Signature
  ensureSpace(110);
  text("SIGNATURE", margin, y, bold, 9, GREY);
  y -= 8;
  if (data.signature && data.signature.startsWith("data:image/")) {
    try {
      // new Uint8Array(buffer) copies by value into a fresh, zero-offset
      // ArrayBuffer — pdf-lib's embedder reads imageData.buffer from byte 0
      // directly, and Node Buffers under ~4KB are pool-backed with a nonzero
      // byteOffset, so passing the Buffer straight through intermittently
      // reads garbage ("SOI not found in JPEG") depending on allocation.
      // Confirmed by direct testing — do not pass a raw Buffer here.
      const sigBytes = new Uint8Array(Buffer.from(data.signature.split(",")[1], "base64"));
      const sigImage = data.signature.startsWith("data:image/png")
        ? await pdfDoc.embedPng(sigBytes)
        : await pdfDoc.embedJpg(sigBytes);
      const sigW = 200, sigH = (sigImage.height / sigImage.width) * sigW;
      rect(margin, y - sigH - 8, sigW + 16, sigH + 16, LIGHT_GREY);
      page.drawImage(sigImage, { x: margin + 8, y: y - sigH, width: sigW, height: sigH });
      y -= sigH + 20;
    } catch (e) {
      text("(signature image could not be embedded)", margin, y - 10, regular, 9, GREY);
      y -= 24;
    }
  }
  text(`Signed by: ${data.contactName || data.company || "-"}  ·  ${data.signedDate || "-"}`, margin, y, regular, 9, GREY);

  // Footer
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`ACME HIRE | HELLO@acmehire.example`, { x: margin, y: 24, font: regular, size: 7, color: GREY });
    p.drawText(`PAGE ${i + 1} OF ${pages.length}`, { x: pageWidth - margin - 60, y: 24, font: regular, size: 7, color: GREY });
  });

  return Buffer.from(await pdfDoc.save());
}

module.exports = { generateDeclarationPdf };
