import type { DictionaryCategory, DictionaryTitle } from '@cghq/contracts';
import type { PoolClient } from 'pg';
import { uuidv7 } from '../../common/uuid.js';
import type { DbClient } from '../pool.js';
import {
  COUNT_CATEGORY_BY_LOWER_NAME,
  DELETE_CATEGORY,
  DELETE_TITLE,
  DELETE_TITLES_BY_CATEGORY,
  DELETE_WORK_GROUPS_BY_CATEGORY,
  DELETE_WORK_GROUPS_BY_TITLE,
  INSERT_CATEGORY,
  INSERT_TITLE,
  SELECT_CATEGORIES_BY_TEAM,
  SELECT_CATEGORY_BY_ID,
  SELECT_CATEGORY_BY_NAME,
  SELECT_NEXT_CATEGORY_POSITION,
  SELECT_NEXT_TITLE_POSITION,
  SELECT_TITLES_BY_TEAM,
  SELECT_TITLE_BY_NAME,
  UPDATE_CATEGORY,
  UPDATE_TITLE,
} from '../sql/dictionary.sql.js';

type CategoryRow = {
  id: string;
  name: string;
  position: number;
  is_active: boolean;
};

type TitleRow = {
  id: string;
  category_id: string;
  name: string;
  position: number;
  is_active: boolean;
  scope?: 'daily' | 'followup';
};

type NextPosRow = { next_pos: number };
type FoundRow = { id: string; name: string; is_active: boolean };

export async function listDictionary(conn: DbClient, teamId: string): Promise<DictionaryCategory[]> {
  const [catRes, titleRes] = await Promise.all([
    conn.query<CategoryRow>(SELECT_CATEGORIES_BY_TEAM, [teamId]),
    conn.query<TitleRow>(SELECT_TITLES_BY_TEAM, [teamId]),
  ]);

  const titlesByCat = new Map<string, DictionaryTitle[]>();
  for (const t of titleRes.rows) {
    const list = titlesByCat.get(t.category_id) ?? [];
    list.push({
      id: t.id,
      categoryId: t.category_id,
      name: t.name,
      position: t.position,
      isActive: Boolean(t.is_active),
      scope: t.scope === 'followup' ? 'followup' : 'daily',
    });
    titlesByCat.set(t.category_id, list);
  }

  return catRes.rows.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    isActive: Boolean(c.is_active),
    titles: titlesByCat.get(c.id) ?? [],
  }));
}

export async function findOrCreateCategoryAndTitle(
  conn: PoolClient,
  teamId: string,
  categoryName: string,
  titleName: string,
  scope: 'daily' | 'followup' = 'daily',
): Promise<{ categoryId: string; titleId: string }> {
  const trimmedCat = categoryName.trim();
  const trimmedTitle = titleName.trim();

  const existingCats = await conn.query<FoundRow>(SELECT_CATEGORY_BY_NAME, [teamId, trimmedCat]);
  let categoryId = existingCats.rows[0]?.id;
  if (!categoryId) {
    const newCategoryId = uuidv7();
    const posRes = await conn.query<NextPosRow>(SELECT_NEXT_CATEGORY_POSITION, [teamId]);
    const nextPos = Number(posRes.rows[0]?.next_pos ?? 10);
    const insCat = await conn.query(INSERT_CATEGORY, [newCategoryId, teamId, trimmedCat, nextPos]);
    if (insCat.rowCount && insCat.rowCount > 0) {
      categoryId = newCategoryId;
    } else {
      const retryCats = await conn.query<FoundRow>(SELECT_CATEGORY_BY_NAME, [teamId, trimmedCat]);
      categoryId = retryCats.rows[0]!.id;
    }
  }

  const existingTitles = await conn.query<FoundRow>(SELECT_TITLE_BY_NAME, [
    teamId,
    categoryId,
    trimmedTitle,
  ]);
  let titleId = existingTitles.rows[0]?.id;
  if (!titleId) {
    const newTitleId = uuidv7();
    const posRes = await conn.query<NextPosRow>(SELECT_NEXT_TITLE_POSITION, [teamId, categoryId]);
    const nextPos = Number(posRes.rows[0]?.next_pos ?? 10);
    const insTitle = await conn.query(INSERT_TITLE, [
      newTitleId,
      teamId,
      categoryId,
      trimmedTitle,
      nextPos,
      scope,
    ]);
    if (insTitle.rowCount && insTitle.rowCount > 0) {
      titleId = newTitleId;
    } else {
      const retryTitles = await conn.query<FoundRow>(SELECT_TITLE_BY_NAME, [
        teamId,
        categoryId,
        trimmedTitle,
      ]);
      titleId = retryTitles.rows[0]!.id;
    }
  }

  return { categoryId, titleId };
}

export async function hasCategoryByLowerName(
  conn: DbClient,
  teamId: string,
  name: string,
): Promise<boolean> {
  const res = await conn.query<{ cnt: number }>(COUNT_CATEGORY_BY_LOWER_NAME, [teamId, name.trim()]);
  return Number(res.rows[0]?.cnt ?? 0) > 0;
}

export async function createCategoryOnly(
  conn: DbClient,
  teamId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  const existing = await conn.query<FoundRow>(SELECT_CATEGORY_BY_NAME, [teamId, trimmed]);
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, name: trimmed };
  }
  const id = uuidv7();
  const posRes = await conn.query<NextPosRow>(SELECT_NEXT_CATEGORY_POSITION, [teamId]);
  const nextPos = Number(posRes.rows[0]?.next_pos ?? 10);
  await conn.query(INSERT_CATEGORY, [id, teamId, trimmed, nextPos]);
  return { id, name: trimmed };
}

export async function createTitleUnderCategory(
  conn: DbClient,
  teamId: string,
  categoryId: string,
  name: string,
  scope: 'daily' | 'followup' = 'daily',
): Promise<{ id: string; name: string } | null> {
  const cats = await conn.query<FoundRow>(SELECT_CATEGORY_BY_ID, [categoryId, teamId]);
  if (!cats.rows[0]) return null;
  const trimmed = name.trim();
  const existing = await conn.query<FoundRow>(SELECT_TITLE_BY_NAME, [teamId, categoryId, trimmed]);
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, name: trimmed };
  }
  const id = uuidv7();
  const posRes = await conn.query<NextPosRow>(SELECT_NEXT_TITLE_POSITION, [teamId, categoryId]);
  const nextPos = Number(posRes.rows[0]?.next_pos ?? 10);
  await conn.query(INSERT_TITLE, [id, teamId, categoryId, trimmed, nextPos, scope]);
  return { id, name: trimmed };
}

export async function updateCategory(
  conn: DbClient,
  teamId: string,
  categoryId: string,
  patch: { name?: string; isActive?: boolean },
): Promise<boolean> {
  const res = await conn.query(UPDATE_CATEGORY, [
    patch.name?.trim() ?? null,
    patch.isActive ?? null,
    categoryId,
    teamId,
  ]);
  return (res.rowCount ?? 0) === 1;
}

export async function updateTitle(
  conn: DbClient,
  teamId: string,
  titleId: string,
  patch: { name?: string; isActive?: boolean; scope?: 'daily' | 'followup' },
): Promise<boolean> {
  const res = await conn.query(UPDATE_TITLE, [
    patch.name?.trim() ?? null,
    patch.isActive ?? null,
    patch.scope ?? null,
    titleId,
    teamId,
  ]);
  return (res.rowCount ?? 0) === 1;
}

export async function deleteCategoryIfUnused(
  conn: DbClient,
  teamId: string,
  categoryId: string,
): Promise<'deleted' | 'in_use' | 'not_found'> {
  await conn.query(DELETE_WORK_GROUPS_BY_CATEGORY, [teamId, categoryId]);
  await conn.query(DELETE_TITLES_BY_CATEGORY, [teamId, categoryId]);
  const delRes = await conn.query(DELETE_CATEGORY, [categoryId, teamId]);
  return (delRes.rowCount ?? 0) > 0 ? 'deleted' : 'not_found';
}

export async function deleteTitleIfUnused(
  conn: DbClient,
  teamId: string,
  titleId: string,
): Promise<'deleted' | 'in_use' | 'not_found'> {
  await conn.query(DELETE_WORK_GROUPS_BY_TITLE, [teamId, titleId]);
  const delRes = await conn.query(DELETE_TITLE, [titleId, teamId]);
  return (delRes.rowCount ?? 0) > 0 ? 'deleted' : 'not_found';
}
