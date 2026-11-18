-- 0003_title_scope_pg.sql
-- Adds scope ('daily' | 'followup') to titles so teams explicitly choose which items live in
-- the fixed Daily Work Table vs the Follow-up Items Table.

ALTER TABLE titles
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'daily';

UPDATE titles t
SET scope = 'followup'
FROM categories c
WHERE t.category_id = c.id
  AND LOWER(TRIM(c.name)) IN ('mobile apps', 'bill');

DELETE FROM work_groups wg
USING titles t
WHERE wg.title_id = t.id
  AND t.scope = 'followup';
