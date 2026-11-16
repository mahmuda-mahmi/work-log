/**
 * Layout & typography tokens derived from docs/EXPORT-SPEC.md.
 * 1 pt = 20 twips. 1 in = 1440 twips = 72 pt = 914400 EMU.
 */
export const RENDERER_VERSION = '1.0.0';

export const TWIPS_PER_PT = 20;
export const EMU_PER_IN = 914400;

export const PAGE = {
  widthTwips: 16838, // 297mm (A4 Landscape)
  heightTwips: 11906, // 210mm
  widthPt: 841.89,
  heightPt: 595.28,
  marginsTwips: {
    top: 1440,
    bottom: 1440,
    left: 1440,
    right: 0,
    header: 720,
    footer: 720,
  },
  marginsPt: {
    top: 72,
    bottom: 72,
    left: 72,
    right: 0,
    header: 36,
    footer: 36,
  },
} as const;

export const HEADER = {
  logoWidthEmu: 1216033, // 1.330 in
  logoHeightEmu: 679226, // 0.743 in
  logoWidthPt: (1216033 / EMU_PER_IN) * 72,
  logoHeightPt: (679226 / EMU_PER_IN) * 72,
  titleFontPt: 15,
  titleBeforeTwips: 240,
  titleAfterTwips: 120,
  spacerFontPt: 3,
} as const;

export const FONT = {
  docxFamily: 'Times New Roman',
  bodyPt: 14,
  bodyHalfPt: 28,
  titleHalfPt: 30,
} as const;

export const TABLE = {
  totalWidthTwips: 14445,
  totalWidthPt: 14445 / TWIPS_PER_PT,
  indentTwips: -780,
  indentPt: -780 / TWIPS_PER_PT,
  borderSizeEighths: 7, // 0.875 pt
  borderPt: 0.875,
  borderColor: '000000',
  cellPadHorizontalTwips: 100,
  cellPadHorizontalPt: 100 / TWIPS_PER_PT,
  cellPadVerticalPt: 4,
  headerMinHeightTwips: 914,
  headerMinHeightPt: 914 / TWIPS_PER_PT,
  bodyMinHeightTwips: 435,
  bodyMinHeightPt: 435 / TWIPS_PER_PT,
  mainColumnsTwips: [675, 2295, 2040, 7455, 1980] as const,
  followupColumnsTwips: [675, 2295, 2025, 7410, 2040] as const,
  headers: ['Ser', 'Report Category', 'Title', 'Status', 'Task\nCompleted By'] as const,
} as const;
