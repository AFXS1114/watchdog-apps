-- ============================================================================
-- Watchdog Supabase Database Schema
-- Run this script in your Supabase SQL Editor to set up all tables and security rules.
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Profiles Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 2. Devices Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  pairing_code TEXT,
  paired_at TIMESTAMPTZ,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  push_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_child ON public.devices(child_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_parent ON public.devices(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_pairing ON public.devices(pairing_code) WHERE pairing_code IS NOT NULL;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Child can create device record
CREATE POLICY "Child can create device"
  ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = child_user_id);

-- Child can view own device record
CREATE POLICY "Child can view own device"
  ON public.devices FOR SELECT
  USING (auth.uid() = child_user_id);

-- Parent can search by pairing code or view claimed devices
CREATE POLICY "Parent can view assigned or pending devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = parent_user_id OR pairing_code IS NOT NULL);

-- Parent can claim device via pairing_code update
CREATE POLICY "Parent can update device for pairing"
  ON public.devices FOR UPDATE
  USING (auth.uid() = parent_user_id OR pairing_code IS NOT NULL);

-- Child can update last_seen
CREATE POLICY "Child can update device status"
  ON public.devices FOR UPDATE
  USING (auth.uid() = child_user_id);

-- ----------------------------------------------------------------------------
-- 3. App Usage Events Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  app_label TEXT,
  app_icon_url TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_ms BIGINT GENERATED ALWAYS AS (
    CASE 
      WHEN ended_at IS NOT NULL THEN CAST(ROUND(EXTRACT(EPOCH FROM (ended_at AT TIME ZONE 'UTC' - started_at AT TIME ZONE 'UTC')) * 1000) AS BIGINT)
      ELSE NULL
    END
  ) STORED,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_usage_device_started ON public.app_usage_events(device_id, started_at DESC);

ALTER TABLE public.app_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child device can insert usage events"
  ON public.app_usage_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND child_user_id = auth.uid()
    )
  );

CREATE POLICY "Parent can view child app usage events"
  ON public.app_usage_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND parent_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Link Events Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.link_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_title TEXT,
  source TEXT CHECK (source IN ('accessibility', 'custom_browser', 'vpn')),
  context_app TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_events_device_captured ON public.link_events(device_id, captured_at DESC);

ALTER TABLE public.link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child device can insert link events"
  ON public.link_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND child_user_id = auth.uid()
    )
  );

CREATE POLICY "Parent can view child link events"
  ON public.link_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND parent_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Screenshots Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.screenshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'screenshots',
  width_px INTEGER,
  height_px INTEGER,
  file_size_bytes BIGINT,
  context_app TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screenshots_device_captured ON public.screenshots(device_id, captured_at DESC);

ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child device can insert screenshot metadata"
  ON public.screenshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND child_user_id = auth.uid()
    )
  );

CREATE POLICY "Parent can view child screenshot metadata"
  ON public.screenshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE id = device_id AND parent_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Storage Bucket for Screenshots
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('screenshots', 'screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage upload policy for authenticated child users
CREATE POLICY "Child device can upload screenshot image files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'screenshots');

-- Storage select policy for authenticated parent users
CREATE POLICY "Parent can view screenshot image files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'screenshots');
