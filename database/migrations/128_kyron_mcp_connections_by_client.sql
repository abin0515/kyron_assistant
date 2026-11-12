ALTER TABLE kyron_mcp_connections
  DROP CONSTRAINT IF EXISTS kyron_mcp_connections_id_check,
  ALTER COLUMN id DROP DEFAULT;
