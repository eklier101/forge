SELECT username, device_label, app_version, created_at, jsonb_array_length(entries) AS lines
FROM debug_log_uploads ORDER BY created_at DESC LIMIT 5;
