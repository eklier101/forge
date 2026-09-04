DELETE FROM admin_later_notes WHERE title LIKE '%Instagram lock%';
INSERT INTO admin_later_notes (title, body, sort_order, status, done, kind) VALUES
('WAITING: confirm Instagram lock on S24 (0.3.25)',
 'Grace minutes were letting Instagram through after Arm lock now — Simulate skipped that check, which is why only Simulate worked. Arm now ignores grace. Account -> App lock -> Lock health has a "Why didn''t it block?" log. Arm, open Instagram, read the log, then delete this note.',
 3, 'waiting', false, 'note');
SELECT id, status, title FROM admin_later_notes WHERE title LIKE '%Instagram lock%';
