export interface Lead {
  id: number
  search_query: string
  city: string
  country: string
  name: string
  category: string
  rating: number | null
  num_reviews: number | null
  phone: string | null
  website_raw: string | null
  website_detected: number
  link_googlemaps: string | null
  instagram: string | null
  followers: number | null
  scraped_at: string
  converted: number
}

export interface Client {
  id: number
  name: string
  phone: string | null
  category: string | null
  city: string | null
  country: string | null
  rating: number | null
  link_googlemaps: string | null
  website: string | null
  instagram: string | null
  landing_url: string | null
  status: ClientStatus
  notes: string | null
  assigned_to: string | null
  source: string | null
  email: string | null
  lead_id: number | null
  created_at: string
  updated_at: string
  checklist_total: number
  checklist_done: number
}

export type ClientStatus = 'prospect' | 'contacted' | 'proposal' | 'negotiating' | 'closed' | 'lost'

export interface ChecklistItem {
  id: number
  client_id: number
  step: string
  completed: number
  completed_by: string | null
  updated_at: string
}

export interface DailyPlanEntry {
  id: number
  client_id: number
  date: string
  completed: number
  name: string
  phone: string | null
  category: string | null
  city: string | null
  status: ClientStatus
  instagram: string | null
}

export interface Goals {
  date: string
  prospects: number
  contacted: number
  proposals: number
  closures: number
}

export interface Stats {
  total_leads: number
  new_leads_today: number
  total_clients: number
  closed: number
  contacted: number
  plan_today: number
  plan_done: number
  status_breakdown: { status: string; cnt: number }[]
}

export interface ScraperSettings {
  website_filter: 'no_website' | 'has_website' | 'instagram_only' | 'any'
  min_reviews: number
  max_reviews: number
  min_rating: number
  max_results: number
  active_categories: string[]
  updated_at?: string
}

export type Page =
  | 'dashboard'
  | 'scraper'
  | 'leads'
  | 'clients'
  | 'daily-plan'
  | 'checklists'
  | 'goals'
  | 'ai-messages'
  | 'templates'
  | 'leads-detector'
