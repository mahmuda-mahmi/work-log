import type { FrequentStatusDto } from '@cghq/contracts';
import type { DbClient } from '../pool.js';
import {
  DELETE_FREQUENT_STATUS,
  INSERT_FREQUENT_STATUS,
  SELECT_FREQUENT_STATUSES_BY_TEAM,
  SELECT_NEXT_FREQUENT_STATUS_POS,
  UPDATE_FREQUENT_STATUS,
} from '../sql/frequent-statuses.sql.js';

type FrequentStatusRow = {
  id: string;
  status_text: string;
  position: number;
};

export async function listFrequentStatuses(
  conn: DbClient,
  teamId: string,
): Promise<FrequentStatusDto[]> {
  const res = await conn.query<FrequentStatusRow>(SELECT_FREQUENT_STATUSES_BY_TEAM, [teamId]);
  return res.rows.map((r) => ({
    id: r.id,
    statusText: r.status_text,
    position: r.position,
  }));
}

export async function getNextFrequentStatusPosition(
  conn: DbClient,
  teamId: string,
): Promise<number> {
  const res = await conn.query<{ next_pos: number }>(SELECT_NEXT_FREQUENT_STATUS_POS, [teamId]);
  return res.rows[0]?.next_pos ?? 1000;
}

export async function insertFrequentStatus(
  conn: DbClient,
  input: {
    id: string;
    teamId: string;
    statusText: string;
    position: number;
    createdBy: string;
  },
): Promise<FrequentStatusDto> {
  await conn.query(INSERT_FREQUENT_STATUS, [
    input.id,
    input.teamId,
    input.statusText,
    input.position,
    input.createdBy,
  ]);
  return {
    id: input.id,
    statusText: input.statusText,
    position: input.position,
  };
}

export async function updateFrequentStatus(
  conn: DbClient,
  teamId: string,
  id: string,
  statusText: string,
): Promise<FrequentStatusDto | null> {
  const res = await conn.query<FrequentStatusRow>(UPDATE_FREQUENT_STATUS, [statusText, id, teamId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    statusText: r.status_text,
    position: r.position,
  };
}

export async function deleteFrequentStatus(
  conn: DbClient,
  teamId: string,
  id: string,
): Promise<boolean> {
  const res = await conn.query(DELETE_FREQUENT_STATUS, [id, teamId]);
  return (res.rowCount ?? 0) > 0;
}
