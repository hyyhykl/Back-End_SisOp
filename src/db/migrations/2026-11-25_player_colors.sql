

BEGIN;

UPDATE users
SET avatar_color = CASE avatar_color
  WHEN 'pink' THEN 'merah'
  WHEN 'blue' THEN 'biru'
  WHEN 'orange' THEN 'kuning'
  WHEN 'yellow' THEN 'kuning'
  ELSE avatar_color
END
WHERE avatar_color IN ('pink', 'blue', 'orange', 'yellow');

UPDATE users
SET name = CASE avatar_color
  WHEN 'merah' THEN 'Merah'
  WHEN 'hijau' THEN 'Hijau'
  WHEN 'biru' THEN 'Biru'
  WHEN 'kuning' THEN 'Kuning'
  ELSE name
END
WHERE avatar_color IN ('merah', 'hijau', 'biru', 'kuning');

ALTER TABLE users ALTER COLUMN avatar_color SET DEFAULT 'merah';

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_avatar_color_check
    CHECK (avatar_color IN ('merah', 'hijau', 'biru', 'kuning'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
