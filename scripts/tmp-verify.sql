SELECT id, name FROM exercises WHERE id IN ('midrow', 'incline_chest_press_machine');
SELECT id, entity_type, payload->>'date' AS date, payload->>'status' AS status
FROM sync_entities WHERE id = 'session-2026-08-03-seed-body-solid';
