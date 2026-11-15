export const SELECT_DB_PING = `
  SELECT 1 AS ok
`;

export const SELECT_LATEST_MIGRATION = `
  SELECT version
  FROM schema_migrations
  ORDER BY version DESC
  LIMIT 1
`;
