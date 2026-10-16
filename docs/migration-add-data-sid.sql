-- Migration: Add data_sid column to ev_mcp_logs table
-- Project: ev-mcp
-- Date: 2026-10-15
-- 
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kqzkdpmyivtpxkfmibnd/sql/new
-- 
-- Or paste into the Supabase Dashboard SQL Editor and click Run.

ALTER TABLE ev_mcp_logs ADD COLUMN IF NOT EXISTS data_sid TEXT;