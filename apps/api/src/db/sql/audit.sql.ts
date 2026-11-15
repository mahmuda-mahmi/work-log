export const INSERT_AUDIT_EVENT = `
  INSERT INTO audit_events (team_id, actor_user_id, action, entity_type, entity_id, request_id, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;
