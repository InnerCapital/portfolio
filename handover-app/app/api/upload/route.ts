import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createFolder, uploadFile, makeFilePublic } from '@/lib/googleDrive';
import { jobInspectionId } from '@/lib/jobLink';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { inspectionId, photoId, label, dataUrl } = body;

  if (!inspectionId || !photoId || !dataUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // A job-link user can only upload to their own, not-yet-submitted inspection.
  const jobId = jobInspectionId(req);
  if (jobId) {
    if (jobId !== inspectionId) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    const { data: job } = await supabase
      .from('inspections')
      .select('job_link_used_at')
      .eq('id', inspectionId)
      .single();
    if (job?.job_link_used_at) {
      return NextResponse.json({ error: 'This check has already been submitted' }, { status: 410 });
    }
  }

  // Get inspection to find/create drive folder
  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', inspectionId)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });

  let folderId = inspection.drive_folder_id;

  if (!folderId) {
    const folderName = [
      inspection.booqable_order_id || inspectionId.substring(0, 8),
      inspection.customer_name || 'Unknown',
      inspection.delivery_date || new Date().toISOString().split('T')[0],
    ].join(' - ');

    try {
      folderId = await createFolder(folderName, process.env.GOOGLE_DRIVE_FOLDER_ID!);
      await supabase
        .from('inspections')
        .update({ drive_folder_id: folderId })
        .eq('id', inspectionId);
    } catch {
      // Drive upload failed — store as data URL only
      return NextResponse.json({ url: dataUrl, driveFileId: null });
    }
  }

  try {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const mimeType = dataUrl.split(';')[0].split(':')[1];
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const filename = `${photoId}_${label.replace(/\s+/g, '_')}.${ext}`;

    const { fileId, webViewLink } = await uploadFile(buffer, filename, mimeType, folderId);
    await makeFilePublic(fileId);

    return NextResponse.json({ url: webViewLink, driveFileId: fileId });
  } catch {
    return NextResponse.json({ url: dataUrl, driveFileId: null });
  }
}
