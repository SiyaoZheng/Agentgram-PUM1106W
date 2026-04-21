/**
 * File-store based helpers for AX Score tables.
 *
 * Replaces the Supabase client with the file store for HPC deployment.
 * The row types remain the same for type-safe casting after queries.
 */
import { getSupabaseServiceClient } from '@agentgram/db-file';

// DB row types matching the migration schema

export interface AxSiteRow {
  id: string;
  developer_id: string;
  url: string;
  name: string | null;
  status: string;
  last_scan_id: string | null;
  industry: string | null;
  region: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface AxScanRow {
  id: string;
  developer_id: string;
  site_id: string;
  url: string;
  score: number;
  category_scores: Record<string, unknown>;
  signals: Record<string, unknown>;
  model_output: string | null;
  model_name: string | null;
  scan_type: string;
  status: string;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface AxRecommendationRow {
  id: string;
  scan_id: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  current_state: string | null;
  suggested_fix: string | null;
  impact_score: number | null;
  created_at: string;
}

export interface AxUsageRow {
  id: string;
  developer_id: string;
  month: string;
  scans_used: number;
  simulations_used: number;
  generations_used: number;
  created_at: string;
  updated_at: string;
}

export interface AxBaselineRow {
  id: string;
  site_id: string;
  developer_id: string;
  scan_id: string;
  score: number;
  category_scores: Record<string, unknown>;
  signals: Record<string, unknown>;
  label: string | null;
  is_current: boolean;
  created_at: string;
}

export interface AxAlertRow {
  id: string;
  site_id: string;
  developer_id: string;
  scan_id: string | null;
  baseline_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  category: string | null;
  score_delta: number | null;
  previous_score: number | null;
  current_score: number | null;
  status: string;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AxCompetitorSetRow {
  id: string;
  developer_id: string;
  name: string;
  description: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
}

export interface AxCompetitorSiteRow {
  id: string;
  set_id: string;
  url: string;
  name: string | null;
  latest_score: number | null;
  latest_scan_id: string | null;
  last_scanned_at: string | null;
  created_at: string;
}

export interface AxMonthlyReportRow {
  id: string;
  developer_id: string;
  site_id: string | null;
  month: string;
  title: string;
  summary: string | null;
  score_trend: Record<string, unknown> | null;
  category_trends: Record<string, unknown> | null;
  top_regressions: Record<string, unknown> | null;
  top_improvements: Record<string, unknown> | null;
  action_items: Record<string, unknown> | null;
  alert_count: number;
  model_name: string | null;
  status: string;
  created_at: string;
}

/**
 * File-store client for AX tables.
 * Uses the same interface as the Supabase client.
 */
export function getAxDbClient() {
  return getSupabaseServiceClient();
}
