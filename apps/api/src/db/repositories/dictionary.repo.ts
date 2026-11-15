import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DictionaryCategory, DictionaryTitle } from '@cghq/contracts';
import { uuidv7 } from '../../common/uuid.js';
import {
  INSERT_CATEGORY,
  INSERT_TITLE,
  SELECT_CATEGORIES_BY_TEAM,
  SELECT_CATEGORY_BY_NAME,
  SELECT_NEXT_CATEGORY_POSITION,
  SELECT_NEXT_TITLE_POSITION,
  SELECT_TITLES_BY_TEAM,
  SELECT_TITLE_BY_NAME,
  UPDATE_CATEGORY,
  UPDATE_TITLE,
} from '../sql/dictionary.sql.js';

type Conn = Pool | PoolConnection;

type CategoryRow = RowDataPacket & {
  id: string;
  name: string;
  position: number;
  is_active: number;
};

type TitleRow = RowDataPacket & {
  id: string;
  category_id: string;
  name: string;
  position: number;
  is_active: number;
};

type NextPosRow = RowDataPacket & { next_pos: number };
type FoundRow = RowDataPacket & { id: string; name: string; is_active: number };

export async function listDictionary(conn: Conn, teamId: string): Promise<DictionaryCategory[]> {
  const [catRows] = await conn.execute<CategoryRow[]>(SELECT_CATEGORIES_BY_TEAM, [teamId]);
  const [titleRows] = await conn.execute<TitleRow[]>(SELECT_TITLES_BY_TEAM, [teamId]);

  const titlesByCat = new Map<string, DictionaryTitle[]>();
  for (const t of titleRows) {
    const list = titlesByCat.get(t.category_id) ?? [];
    list.push({
      id: t.id,
      categoryId: t.category_id,
      name: t.name,
      position: t.position,
      isActive: t.is_active === 1,
    });
    titlesByCat.set(t.category_id, list);
  }

  return catRows.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    isActive: c.is_active === 1,
    titles: titlesByCat.get(c.id) ?? [],
  }));
}

export async function findOrCreateCategoryAndTitle(
  conn: PoolConnection,
  teamId: string,
  categoryName: string,
  titleName: string,
): Promise<{ categoryId: string; titleId: string }> {
  const trimmedCat = categoryName.trim();
  const trimmedTitle = titleName.trim();

  const [existingCats] = await conn.execute<FoundRow[]>(SELECT_CATEGORY_BY_NAME, [
    teamId,
    trimmedCat,
  ]);
  let categoryId = existingCats[0]?.id;
  if (!categoryId) {
    categoryId = uuidv7();
    const [posRows] = await conn.execute<NextPosRow[]>(SELECT_NEXT_CATEGORY_POSITION, [teamId]);
    const nextPos = Number(posRows[0]?.next_pos ?? 10);
    await conn.execute(INSERT_CATEGORY, [categoryId, teamId, trimmedCat, nextPos]);
  }

  const [existingTitles] = await conn.execute<FoundRow[]>(SELECT_TITLE_BY_NAME, [
    teamId,
    categoryId,
    trimmedTitle,
  ]);
  let titleId = existingTitles[0]?.id;
  if (!titleId) {
    titleId = uuidv7();
    const [posRows] = await conn.execute<NextPosRow[]>(SELECT_NEXT_TITLE_POSITION, [
      teamId,
      categoryId,
    ]);
    const nextPos = Number(posRows[0]?.next_pos ?? 10);
    await conn.execute(INSERT_TITLE, [titleId, teamId, categoryId, trimmedTitle, nextPos]);
  }

  return { categoryId, titleId };
}

export async function updateCategory(
  conn: Conn,
  teamId: string,
  categoryId: string,
  patch: { name?: string; isActive?: boolean },
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_CATEGORY, [
    patch.name?.trim() ?? null,
    patch.isActive === undefined ? null : patch.isActive ? 1 : 0,
    categoryId,
    teamId,
  ]);
  return res.affectedRows === 1;
}

export async function updateTitle(
  conn: Conn,
  teamId: string,
  titleId: string,
  patch: { name?: string; isActive?: boolean },
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(UPDATE_TITLE, [
    patch.name?.trim() ?? null,
    patch.isActive === undefined ? null : patch.isActive ? 1 : 0,
    titleId,
    teamId,
  ]);
  return res.affectedRows === 1;
}
