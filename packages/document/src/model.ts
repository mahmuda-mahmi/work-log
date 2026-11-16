import { formatReportDate } from './date.js';
import { HEADER, PAGE, TABLE } from './tokens.js';

export type NumberingMode = 'numbered' | 'plain';

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
  page: typeof PAGE;
  header: typeof HEADER;
  table: typeof TABLE;
}

function normalizeGroupKey(category: string, title: string): string {
  return `${category.trim().toLowerCase()}\u0000${title.trim().toLowerCase()}`;
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
        category: entry.categoryName.trim(),
        title: entry.titleName.trim(),
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
    const isSingle = group.items.length === 1;

    group.items.forEach((item, idx) => {
      mainRows.push({
        ser: idx === 0 ? serStr : '',
        category: idx === 0 ? group.category : '',
        title: idx === 0 ? group.title : '',
        status: item.statusText.trim(),
        completedBy: item.completedBy.trim(),
        groupMerge: isSingle ? 'none' : idx === 0 ? 'restart' : 'continue',
        statusPrefix: undefined,
      });
    });
  }

  const followupRows: DocumentRow[] =
    input.followups.length === 0
      ? [
          {
            ser: '',
            category: '',
            title: '',
            status: 'None',
            completedBy: '',
            groupMerge: 'none',
          },
        ]
      : input.followups.map((item, idx) => ({
          ser: String(idx + 1),
          category: item.categoryName.trim(),
          title: item.titleName.trim(),
          status: item.statusText.trim(),
          completedBy: item.completedBy.trim(),
          groupMerge: 'none',
        }));

  return {
    documentTitle: (input.documentTitle ?? 'CGHQ Daily Report').trim(),
    reportDate: input.reportDate,
    formattedDate: headerDate,
    preparedBy: input.preparedBy.trim(),
    logoBytes: input.logoBytes ? Uint8Array.from(input.logoBytes) : null,
    mainRows,
    followupRows,
    hasFollowups: input.followups.length > 0,
    page: PAGE,
    header: HEADER,
    table: TABLE,
  };
}
