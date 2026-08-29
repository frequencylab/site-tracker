-- Site Tracker Database Schema
-- Run this in the Supabase SQL Editor to set up your tables

-- Table: sites
-- Stores all websites the user has built
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  category TEXT DEFAULT 'other',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: page_views
-- Stores individual page view events
CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  page_path TEXT DEFAULT '/',
  referrer TEXT,
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: daily_stats
-- Aggregated daily statistics (populated by a scheduled function or on-read aggregation)
CREATE TABLE IF NOT EXISTS daily_stats (
  id BIGSERIAL PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_views_site_id ON page_views(site_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views(site_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_site_date ON daily_stats(site_id, date);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);

-- Enable Row Level Security (optional, for production)
-- ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
