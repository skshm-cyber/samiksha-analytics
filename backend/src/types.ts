export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CORS_ORIGINS: string;
}

export interface TrackPayload {
  visitor_id: string;
  session_id: string;
  timestamp: string;
  timezone?: string;
  language?: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  device_type?: string;
  screen_width?: number;
  screen_height?: number;
  page_url: string;
  referrer?: string;
  page_title?: string;
  is_first_visit?: number;
  scroll_percentage?: number;
  time_on_page?: number;
}

export interface EventPayload {
  visitor_id: string;
  session_id: string;
  timestamp: string;
  event_type: string;
  event_target?: string;
  page_url?: string;
  time_on_page?: number;
  scroll_percentage?: number;
}
