




CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(20) DEFAULT 'merah' CHECK (avatar_color IN ('merah', 'hijau', 'biru', 'kuning')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);




CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,             
  name VARCHAR(50) NOT NULL,                   
  is_private BOOLEAN DEFAULT FALSE,            
  max_players INT DEFAULT 4,                   
  status VARCHAR(20) DEFAULT 'waiting',        
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  current_minigame INT DEFAULT 0,              
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);




CREATE TABLE room_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_host BOOLEAN DEFAULT FALSE,
  is_ready BOOLEAN DEFAULT FALSE,              
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id)                     
);




CREATE TABLE minigame_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  minigame_number INT NOT NULL,                
  score INT DEFAULT 0,                         
  metrics JSONB DEFAULT '{}',                  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id, minigame_number)    
);




CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  total_players INT DEFAULT 0,
  duration_seconds INT DEFAULT 0,
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);




CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_user ON room_players(user_id);
CREATE INDEX idx_minigame_scores_lookup ON minigame_scores(room_id, minigame_number);