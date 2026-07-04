-- PomoFlow Supabase tablosu
-- Supabase SQL Editor'da çalıştır:

CREATE TABLE IF NOT EXISTS pomoflow_data (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pomoflow_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON pomoflow_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data"
  ON pomoflow_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data"
  ON pomoflow_data FOR UPDATE
  USING (auth.uid() = user_id);
