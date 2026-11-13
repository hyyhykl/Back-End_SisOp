-- ================================================
-- KERNEL CLASH ARCADE - DATABASE SCHEMA (PostgreSQL / Supabase)
-- ================================================

-- Enable UUID extension (Supabase sudah default aktif, tapi aman ditambah)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- 1. USERS (Pemain / Tamu / Guest)
-- ================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(20) DEFAULT 'pink', -- 'pink', 'blue', 'orange', 'yellow'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 2. ROOMS (Lobi Permainan)
-- ================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,             -- Kode undangan (misal: "X7K9P")
  name VARCHAR(50) NOT NULL,                   -- Nama room
  is_private BOOLEAN DEFAULT FALSE,            -- Public / Private
  max_players INT DEFAULT 4,                   -- Maksimal 4 player
  status VARCHAR(20) DEFAULT 'waiting',        -- 'waiting', 'starting', 'playing', 'finished'
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  current_minigame INT DEFAULT 0,              -- 0 = Lobi, 1, 2, 3
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- 3. ROOM_PLAYERS (Anggota Player di dalam Room)
-- ================================================
CREATE TABLE room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_host BOOLEAN DEFAULT FALSE,
  is_ready BOOLEAN DEFAULT FALSE,              -- Status 'SIAP' / 'MENUNGGU'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id)                     -- Mencegah player duplikat di room yang sama
);

-- ================================================
-- 4. MINIGAME_SCORES (Skor per Minigame)
-- ================================================
CREATE TABLE minigame_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  minigame_number INT NOT NULL,                -- 1, 2, atau 3
  score INT DEFAULT 0,                         -- Skor yang didapat
  metrics JSONB DEFAULT '{}',                  -- Metrik OS spesifik (Deadlock, Race Condition, Page Faults, dll)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id, minigame_number)    -- 1 skor per user per minigame per room
);

-- ================================================
-- 5. GAME_HISTORY (Riwayat Turnamen Selesai)
-- ================================================
CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  total_players INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- INDEXES (Performa Query WebSocket & API)
-- ================================================
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_user ON room_players(user_id);
CREATE INDEX idx_minigame_scores_lookup ON minigame_scores(room_id, minigame_number);