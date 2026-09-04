WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY title ORDER BY updated_at DESC) AS rn
  FROM admin_later_notes
  WHERE title = 'WAITING: confirm workout unlock + Habits tick (0.3.32 republish)'
)
DELETE FROM admin_later_notes WHERE id IN (SELECT id FROM dups WHERE rn > 1);
SELECT id, status, title FROM admin_later_notes WHERE title LIKE '%Habits tick%';
