const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Formats an ISO date string (YYYY-MM-DD) using zero-padded day per PRD FR-6 / Q1:
 * Header: "05 November 2026"
 * Filename token: "05_November_2026"
 */
export function formatReportDate(isoDate: string): {
  headerDate: string;
  fileDate: string;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) {
    throw new Error(`Invalid report date "${isoDate}", expected YYYY-MM-DD`);
  }
  const year = match[1]!;
  const monthIdx = Number(match[2]!) - 1;
  const dayPadded = match[3]!;
  const monthName = ENGLISH_MONTHS[monthIdx];
  if (!monthName) {
    throw new Error(`Invalid month in report date "${isoDate}"`);
  }
  return {
    headerDate: `${dayPadded} ${monthName} ${year}`,
    fileDate: `${dayPadded}_${monthName}_${year}`,
  };
}

/**
 * Sanitizes a file prefix and builds the export filename per PRD §4.5 & EXPORT-SPEC §10.
 */
export function buildExportFileName(options: {
  filePrefix?: string;
  reportDate: string;
  format: 'docx' | 'pdf';
  revision?: number;
  isSuperseded?: boolean;
}): string {
  const rawPrefix = (options.filePrefix ?? 'CGHQ_Team_Work_Status').trim();
  const safePrefix =
    rawPrefix.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '') || 'CGHQ_Team_Work_Status';
  const { fileDate } = formatReportDate(options.reportDate);
  const revSuffix =
    options.isSuperseded && options.revision && options.revision >= 1
      ? `_rev${options.revision}`
      : '';
  return `${safePrefix}_${fileDate}${revSuffix}.${options.format}`;
}

/**
 * Checks for characters outside basic Latin / Latin-1 / common punctuation (FR-20 / Q3).
 * Returns any unsupported characters found so the UI/API can warn before export.
 */
export function findUnsupportedLatinChars(text: string): string[] {
  const unsupported = new Set<string>();
  for (const ch of text) {
    if (ch === '\n' || ch === '\r' || ch === '\t') continue;
    const cp = ch.codePointAt(0)!;
    const isSupported =
      (cp >= 0x0020 && cp <= 0x024f) || // Basic Latin + Latin-1 + Latin Extended-A/B
      (cp >= 0x2000 && cp <= 0x206f) || // General Punctuation (dashes, smart quotes, bullets)
      cp === 0x20ac; // Euro sign
    if (!isSupported) {
      unsupported.add(ch);
    }
  }
  return Array.from(unsupported);
}
