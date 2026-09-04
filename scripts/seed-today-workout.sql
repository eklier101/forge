-- Seed today's completed gym session for Ethan (Body Solid levels + EZ bar lb)
INSERT INTO sync_entities (id, user_id, entity_type, payload, updated_at, deleted)
VALUES (
  'session-2026-08-03-seed-body-solid',
  'c1e57045-7c13-47fd-a534-ad0979318ed6',
  'workout_session',
  '{
    "sessionId": "session-2026-08-03-seed-body-solid",
    "date": "2026-08-03",
    "kind": "gym",
    "focus": "upper",
    "startedAt": "2026-08-03T18:00:00.000Z",
    "completedAt": "2026-08-03T19:15:00.000Z",
    "status": "completed",
    "circuitMode": false,
    "exercises": [
      {
        "exerciseId": "lat_pulldown",
        "name": "Lat Pulldown",
        "targetSets": 3,
        "targetReps": 12,
        "restSeconds": 90,
        "started": true,
        "loadUnit": "level",
        "difficulty": "normal",
        "sets": [
          {"setIndex": 1, "reps": 12, "weight": 10, "done": true, "completedAt": "2026-08-03T18:10:00.000Z"},
          {"setIndex": 2, "reps": 12, "weight": 9, "done": true, "completedAt": "2026-08-03T18:13:00.000Z"},
          {"setIndex": 3, "reps": 12, "weight": 7, "done": true, "completedAt": "2026-08-03T18:16:00.000Z"}
        ]
      },
      {
        "exerciseId": "machine_shoulder_press",
        "name": "Machine Shoulder Press",
        "targetSets": 3,
        "targetReps": 15,
        "restSeconds": 90,
        "started": true,
        "loadUnit": "level",
        "difficulty": "normal",
        "sets": [
          {"setIndex": 1, "reps": 15, "weight": 2, "done": true, "completedAt": "2026-08-03T18:20:00.000Z"},
          {"setIndex": 2, "reps": 15, "weight": 2, "done": true, "completedAt": "2026-08-03T18:23:00.000Z"},
          {"setIndex": 3, "reps": 15, "weight": 2, "done": true, "completedAt": "2026-08-03T18:26:00.000Z"}
        ]
      },
      {
        "exerciseId": "chest_press_machine",
        "name": "Chest Press Machine",
        "targetSets": 3,
        "targetReps": 20,
        "restSeconds": 90,
        "started": true,
        "loadUnit": "level",
        "difficulty": "normal",
        "sets": [
          {"setIndex": 1, "reps": 20, "weight": 2, "done": true, "completedAt": "2026-08-03T18:30:00.000Z"},
          {"setIndex": 2, "reps": 20, "weight": 2, "done": true, "completedAt": "2026-08-03T18:33:00.000Z"},
          {"setIndex": 3, "reps": 20, "weight": 2, "done": true, "completedAt": "2026-08-03T18:36:00.000Z"}
        ]
      },
      {
        "exerciseId": "ez_bar_curl",
        "name": "EZ-Bar Curl",
        "targetSets": 3,
        "targetReps": 12,
        "restSeconds": 90,
        "started": true,
        "loadUnit": "weight",
        "difficulty": "normal",
        "sets": [
          {"setIndex": 1, "reps": 12, "weight": 30, "done": true, "completedAt": "2026-08-03T18:40:00.000Z"},
          {"setIndex": 2, "reps": 15, "weight": 30, "done": true, "completedAt": "2026-08-03T18:43:00.000Z"},
          {"setIndex": 3, "reps": 15, "weight": 30, "done": true, "completedAt": "2026-08-03T18:46:00.000Z"}
        ]
      },
      {
        "exerciseId": "midrow",
        "name": "Midrow",
        "targetSets": 3,
        "targetReps": 20,
        "restSeconds": 90,
        "started": true,
        "loadUnit": "level",
        "difficulty": "normal",
        "sets": [
          {"setIndex": 1, "reps": 20, "weight": 3, "done": true, "completedAt": "2026-08-03T18:50:00.000Z"},
          {"setIndex": 2, "reps": 20, "weight": 4, "done": true, "completedAt": "2026-08-03T18:53:00.000Z"},
          {"setIndex": 3, "reps": 20, "weight": 4, "done": true, "completedAt": "2026-08-03T18:56:00.000Z"}
        ]
      }
    ]
  }'::jsonb,
  NOW(),
  false
)
ON CONFLICT (id) DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at,
  deleted = false;
