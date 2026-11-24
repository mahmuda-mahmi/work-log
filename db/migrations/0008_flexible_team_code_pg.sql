-- Allow custom team codes (uppercase, lowercase, numbers, punctuation; disallow slashes and control chars)
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_slug_format;

ALTER TABLE teams
  ADD CONSTRAINT teams_slug_format
  CHECK (char_length(slug) BETWEEN 2 AND 80 AND slug !~ '[/\\\r\n\t]');
