-- Add product tour tracking columns to profiles table
-- Run this in your Supabase SQL editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tour_version integer DEFAULT NULL;
