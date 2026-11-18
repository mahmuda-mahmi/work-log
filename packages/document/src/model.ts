import { formatReportDate } from './date.js';
import { FONT, HEADER, PAGE, TABLE } from './tokens.js';

export type NumberingMode = 'numbered' | 'plain';
export type DocumentFontFamily = 'Times New Roman';

export interface ReportEntryInput {
  categoryName: string;
  titleName: string;
  statusText: string;
  completedBy: string;
  numberingMode?: NumberingMode;
}

export interface FollowupRowInput {
  categoryName: string;
  titleName: string;
  statusText: string;
  completedBy: string;
}

export interface ReportDocumentInput {
  documentTitle?: string;
  reportDate: string; // YYYY-MM-DD
  preparedBy: string;
  logoBytes?: Buffer | Uint8Array | null;
  fontFamily?: DocumentFontFamily;
  fontSizePt?: number;
  entries: ReportEntryInput[];
  followups: FollowupRowInput[];
}

export interface DocumentRow {
  /** Present on first row of a group; empty on continuation rows */
  ser: string;
  category: string;
  title: string;
  status: string;
  completedBy: string;
  /** Group metadata for vertical merges in DOCX and continuation handling in PDF */
  groupMerge: 'none' | 'restart' | 'continue';
  /** Numbered prefix (e.g. "1.") when mode === 'numbered' */
  statusPrefix?: string;
}

export interface DocumentModel {
  documentTitle: string;
  reportDate: string;
  formattedDate: string;
  preparedBy: string;
  logoBytes: Uint8Array | null;
  mainRows: DocumentRow[];
  followupRows: DocumentRow[];
  hasFollowups: boolean;
  fontFamily: DocumentFontFamily;
  fontSizePt: number;
  page: typeof PAGE;
  header: typeof HEADER;
  table: typeof TABLE;
}

function normalizeGroupKey(category: string, title: string): string {
  return `${category.trim().toLowerCase()}\u0000${title.trim().toLowerCase()}`;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Returns true when a Communication status explicitly states there was no communication
 * (e.g., "Officer: Nil" or "Sailor: Nil"), in which case Task Completed By stays blank.
 */
export function isNilCommunicationStatus(statusText: string): boolean {
  return /^(officer|sailor)\s*:\s*nil\.?$/i.test(statusText.trim());
}

/**
 * Ensures Communication entries always place Officer rows above Sailor rows
 * while preserving relative order within each group.
 */
export function sortCommunicationItems<T extends { statusText: string }>(items: readonly T[]): T[] {
  const rank = (statusText: string): number => {
    const trimmed = statusText.trim().toLowerCase();
    if (/^officer\s*:/.test(trimmed)) return 0;
    if (/^sailor\s*:/.test(trimmed)) return 2;
    return 1;
  };
  return [...items].sort((a, b) => rank(a.statusText) - rank(b.statusText));
}

/**
 * Builds the deterministic DocumentModel consumed by both DOCX and PDF renderers.
 * Implements PRD FR-7 (grouping & Ser), Q1 (zero-padded date), Q2 (individual Completed By),
 * and Q4 (empty follow-up "None" row).
 */
export function buildDocumentModel(input: ReportDocumentInput): DocumentModel {
  const { headerDate } = formatReportDate(input.reportDate);

  // Group entries by trimmed, case-insensitive (category, title) preserving first-appearance order
  const groups = new Map<
    string,
    {
      category: string;
      title: string;
      numberingMode: NumberingMode;
      items: ReportEntryInput[];
    }
  >();

  for (const entry of input.entries) {
    const key = normalizeGroupKey(entry.categoryName, entry.titleName);
    let group = groups.get(key);
    if (!group) {
      group = {
        category: capitalizeFirst(entry.categoryName),
        title: capitalizeFirst(entry.titleName),
        numberingMode: entry.numberingMode ?? 'numbered',
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(entry);
  }

  const mainRows: DocumentRow[] = [];
  let serCounter = 0;

  for (const group of groups.values()) {
    if (group.items.length === 0) continue;
    serCounter += 1;
    const serStr = String(serCounter);
    const orderedItems =
      group.category.trim().toLowerCase() === 'communication'
        ? sortCommunicationItems(group.items)
        : group.items;
    const isSingle = orderedItems.length === 1;

    orderedItems.forEach((item, idx) => {
      const status = item.statusText.trim();
      mainRows.push({
        ser: idx === 0 ? serStr : '',
        category: idx === 0 ? group.category : '',
        title: idx === 0 ? group.title : '',
        status,
        completedBy: isNilCommunicationStatus(status) ? '' : item.completedBy.trim(),
        groupMerge: isSingle ? 'none' : idx === 0 ? 'restart' : 'continue',
        statusPrefix: group.numberingMode === 'numbered' ? `${idx + 1}.` : undefined,
      });
    });
  }

  const followupRows: DocumentRow[] = input.followups.map((item, idx) => ({
    ser: String(idx + 1),
    category: capitalizeFirst(item.categoryName),
    title: capitalizeFirst(item.titleName),
    status: item.statusText.trim(),
    completedBy: item.completedBy.trim(),
    groupMerge: 'none',
  }));

  return {
    documentTitle: (input.documentTitle ?? 'Work Log Daily Report').trim(),
    reportDate: input.reportDate,
    formattedDate: headerDate,
    preparedBy: input.preparedBy.trim(),
    logoBytes: input.logoBytes ? Uint8Array.from(input.logoBytes) : null,
    mainRows,
    followupRows,
    hasFollowups: input.followups.length > 0,
    fontFamily: 'Times New Roman',
    fontSizePt: FONT.bodyPt,
    page: PAGE,
    header: HEADER,
    table: TABLE,
  };
}
