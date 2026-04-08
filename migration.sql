-- Add game_mode column to builtin_completions
-- Existing records default to 'code', new logic-mode records will use 'logic'

-- 1. Add column with default
ALTER TABLE builtin_completions
  ADD COLUMN game_mode text NOT NULL DEFAULT 'code';

-- 2. Drop old PK (user_id, level_index)
ALTER TABLE builtin_completions
  DROP CONSTRAINT builtin_completions_pkey;

-- 3. Create new PK including game_mode
ALTER TABLE builtin_completions
  ADD CONSTRAINT builtin_completions_pkey
  PRIMARY KEY (user_id, level_index, game_mode);
