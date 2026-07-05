-- PomoFlow Supabase tablosu
-- Supabase SQL Editor'da çalıştır:

CREATE TABLE IF NOT EXISTS pomoflow_data (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  client_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pomoflow_data
  ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE TABLE IF NOT EXISTS pomoflow_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'PomoFlow kullanıcısı',
  role TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '🍅',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pomoflow_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE pomoflow_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON pomoflow_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data"
  ON pomoflow_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data"
  ON pomoflow_data FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own profile"
  ON pomoflow_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON pomoflow_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON pomoflow_profiles FOR UPDATE
  USING (auth.uid() = user_id);
