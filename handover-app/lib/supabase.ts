import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      _client = createClient(
        process.env.SUPABASE_URL || 'http://localhost:54321',
        process.env.SUPABASE_SERVICE_KEY || 'placeholder'
      );
    }
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type InspectionStatus = 'draft' | 'awaiting_signature' | 'signed' | 'complete';
export type InspectionType = 'checkout' | 'checkin';
export type InspectionLocation = 'depot' | 'site';

export interface Photo {
  id: string;
  label: string;
  url: string;
  driveFileId?: string;
  timestamp: string;
  lat?: number;
  lng?: number;
}

export interface Unit {
  id: string;
  serial_id: string;
  unit_type: string;
  photos: Photo[];
  ai_photo_checks?: Record<string, unknown>[];
}

export interface ChecklistItem {
  status: 'pass' | 'issue' | null;
  notes?: string;
}

export type AssetStatus = 'pass' | 'fail' | 'service_due' | 'pending_reinspection';

export interface Asset {
  asset_id: string;
  category?: string;
  manufacturer_serial?: string;
  build_date?: string;
  depot_location?: string;
  booqable_stock_item_id?: string;
  booqable_status?: string;
  booqable_synced_at?: string;
  status: AssetStatus;
  created_at?: string;
  updated_at?: string;
}

export interface AssetEvent {
  id: string;
  asset_id: string;
  source: 'inspection' | 'maintenance';
  inspection_id?: string;
  defect_id?: string;
  occurred_at: string;
  summary: string;
  resulting_status?: AssetStatus;
  created_at?: string;
}

export type DefectStatus = 'open' | 'pending_reinspection' | 'resolved';
export type CalloutStatus = 'open' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface AssetDefect {
  id: string;
  asset_id: string;
  source_inspection_id?: string;
  source_checklist_item_id?: string;
  description: string;
  status: DefectStatus;
  callout_status?: CalloutStatus;
  scheduled_date?: string;
  contractor?: string;
  completion_date?: string;
  cost?: number;
  schedule_l_advisory?: boolean;
  schedule_l_notes?: string;
  schedule_l_cleared_at?: string;
  reinspection_verified_at?: string;
  reinspection_inspection_id?: string;
  zapier_row_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Inspection {
  id: string;
  booqable_order_id?: string;
  type: InspectionType;
  location: InspectionLocation;
  status: InspectionStatus;
  customer_name?: string;
  company_name?: string;
  customer_email?: string;
  site_address?: string;
  rental_start?: string;
  rental_end?: string;
  delivery_date?: string;
  delivery_time?: string;
  power_connected?: boolean;
  power_notes?: string;
  general_notes?: string;
  checklist: Record<string, ChecklistItem>;
  units: Unit[];
  customer_sign_token?: string;
  signer_name?: string;
  signer_position?: string;
  signature_image_url?: string;
  signed_at?: string;
  pdf_url?: string;
  drive_folder_id?: string;
  booqable_note_id?: string;
  link_sent_at?: string;
  ai_photo_checks?: Record<string, unknown>[];
  ai_comparisons?: Record<string, unknown>[];
  ai_overrides?: Record<string, unknown>[];
  dispute_summary?: string;
  created_at?: string;
  updated_at?: string;
}
