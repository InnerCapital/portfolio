import { supabase } from '@/lib/supabase';
import type { Inspection } from '@/lib/supabase';
import { uploadFile, makeFilePublic, createFolder, getDirectDownloadLink } from '@/lib/googleDrive';
import { generatePdf } from '@/lib/generatePdf';
import { syncAssetsForInspection } from '@/lib/assetRegister';

const FILENAME_PREFIX = {
  site: { checkout: 'HandoverCertificate', checkin: 'CollectionCertificate' },
  depot: { checkout: 'PreDispatchDepotCheck', checkin: 'PostReturnDepotCheck' },
} as const;

interface FinalizeParams {
  signerName: string;
  signerPosition?: string;
  signatureDataUrl?: string;
  status: 'signed' | 'complete';
}

// Shared by the customer-sign path (app/api/sign/route.ts) and the depot self-close
// path (app/api/inspections/[id]/complete-depot/route.ts): generate the PDF, upload
// it to Drive, persist the signer/status fields, and sync the persistent Asset
// Register. Booqable notes and customer emails are the caller's own responsibility —
// depot checks skip both since there's no customer in the loop.
export async function finalizeInspection(
  inspection: Inspection,
  params: FinalizeParams
): Promise<{ pdfUrl: string | null; signedAt: string }> {
  const signedAt = new Date().toISOString();

  const updatedInspection: Inspection = {
    ...inspection,
    signer_name: params.signerName,
    signer_position: params.signerPosition,
    signature_image_url: params.signatureDataUrl,
    signed_at: signedAt,
    status: params.status,
  };

  let pdfUrl: string | null = null;
  try {
    const pdfBuffer = await generatePdf(updatedInspection);

    let folderId = inspection.drive_folder_id;
    if (!folderId) {
      const folderName = [
        inspection.booqable_order_id || inspection.id.substring(0, 8),
        inspection.customer_name || 'Unknown',
        inspection.delivery_date || new Date().toISOString().split('T')[0],
      ].join(' - ');
      folderId = await createFolder(folderName, process.env.GOOGLE_DRIVE_FOLDER_ID!);
    }

    const prefix = FILENAME_PREFIX[inspection.location ?? 'site'][inspection.type];
    const filename = `${prefix}_${inspection.booqable_order_id || inspection.id}.pdf`;
    const { fileId } = await uploadFile(pdfBuffer, filename, 'application/pdf', folderId);
    await makeFilePublic(fileId);
    pdfUrl = await getDirectDownloadLink(fileId);
  } catch (e) {
    console.error('PDF generation/upload failed:', e);
  }

  const { error: updateErr } = await supabase
    .from('inspections')
    .update({
      signer_name: params.signerName,
      signer_position: params.signerPosition,
      signature_image_url: params.signatureDataUrl,
      signed_at: signedAt,
      status: params.status,
      pdf_url: pdfUrl,
      updated_at: signedAt,
    })
    .eq('id', inspection.id);

  if (updateErr) throw new Error(updateErr.message);

  try {
    await syncAssetsForInspection({ ...updatedInspection, pdf_url: pdfUrl || undefined });
  } catch (e) {
    console.error('Asset Register sync failed:', e);
  }

  return { pdfUrl, signedAt };
}
