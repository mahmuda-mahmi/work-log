import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
} from 'docx';
import type { DocumentModel, DocumentRow } from '../model.js';
import { FONT, HEADER, PAGE, TABLE } from '../tokens.js';

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: TABLE.borderSizeEighths, color: TABLE.borderColor },
  bottom: { style: BorderStyle.SINGLE, size: TABLE.borderSizeEighths, color: TABLE.borderColor },
  left: { style: BorderStyle.SINGLE, size: TABLE.borderSizeEighths, color: TABLE.borderColor },
  right: { style: BorderStyle.SINGLE, size: TABLE.borderSizeEighths, color: TABLE.borderColor },
} as const;

const CELL_MARGINS = {
  top: 0,
  bottom: 0,
  left: TABLE.cellPadHorizontalTwips,
  right: TABLE.cellPadHorizontalTwips,
} as const;

function makeRun(text: string, options?: { bold?: boolean; underline?: boolean; size?: number }) {
  return new TextRun({
    text,
    font: FONT.docxFamily,
    size: options?.size ?? FONT.bodyHalfPt,
    bold: options?.bold ?? false,
    underline: options?.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function makeMultilineParagraphs(
  text: string,
  options?: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    indentLeftTwips?: number;
    hangingTwips?: number;
    lineSpacing?: number;
  },
): Paragraph[] {
  const lines = text.split('\n');
  return lines.map((line) => {
    return new Paragraph({
      alignment: options?.align ?? AlignmentType.LEFT,
      indent:
        options?.indentLeftTwips !== undefined
          ? { left: options.indentLeftTwips, hanging: options.hangingTwips }
          : undefined,
      spacing: {
        before: 0,
        after: 0,
        line: options?.lineSpacing ?? 240,
      },
      children: [makeRun(line, { bold: options?.bold })],
    });
  });
}

function buildHeader(model: DocumentModel): Header {
  const children: Paragraph[] = [];

  if (model.logoBytes) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: { left: -PAGE.marginsTwips.left },
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: 'png',
            data: model.logoBytes,
            transformation: {
              width: Math.round(HEADER.logoWidthPt * (96 / 72)),
              height: Math.round(HEADER.logoHeightPt * (96 / 72)),
            },
          }),
        ],
      }),
    );

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: { left: -PAGE.marginsTwips.left },
        spacing: { before: 0, after: 0 },
        children: [makeRun('', { size: HEADER.spacerFontPt * 2 })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      indent: { left: -PAGE.marginsTwips.left },
      spacing: { before: HEADER.titleBeforeTwips, after: HEADER.titleAfterTwips },
      children: [
        makeRun(model.documentTitle, {
          bold: true,
          size: FONT.titleHalfPt,
        }),
      ],
    }),
  );

  return new Header({ children });
}

function buildHeaderRow(columnWidths: readonly number[]): TableRow {
  return new TableRow({
    cantSplit: true,
    tableHeader: false,
    height: { value: TABLE.headerMinHeightTwips, rule: 'atLeast' },
    children: TABLE.headers.map((label, idx) => {
      return new TableCell({
        width: { size: columnWidths[idx]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: makeMultilineParagraphs(label, {
          align: AlignmentType.CENTER,
          bold: true,
        }),
      });
    }),
  });
}

function buildBodyRow(
  row: DocumentRow,
  columnWidths: readonly number[],
  allowVerticalMerge: boolean,
): TableRow {
  const vMerge =
    allowVerticalMerge && row.groupMerge === 'restart'
      ? VerticalMergeType.RESTART
      : allowVerticalMerge && row.groupMerge === 'continue'
        ? VerticalMergeType.CONTINUE
        : undefined;

  const statusText = row.statusPrefix ? `${row.statusPrefix} ${row.status}` : row.status;
  const statusParagraphs = makeMultilineParagraphs(statusText, {
    align: AlignmentType.LEFT,
    indentLeftTwips: row.statusPrefix ? 360 : undefined,
    hangingTwips: row.statusPrefix ? 360 : undefined,
    lineSpacing: row.statusPrefix ? 331 : 240,
  });

  return new TableRow({
    cantSplit: true,
    height: { value: TABLE.bodyMinHeightTwips, rule: 'atLeast' },
    children: [
      new TableCell({
        width: { size: columnWidths[0]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        verticalMerge: vMerge,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: makeMultilineParagraphs(row.ser, { align: AlignmentType.CENTER }),
      }),
      new TableCell({
        width: { size: columnWidths[1]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        verticalMerge: vMerge,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: makeMultilineParagraphs(row.category, { align: AlignmentType.LEFT }),
      }),
      new TableCell({
        width: { size: columnWidths[2]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        verticalMerge: vMerge,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: makeMultilineParagraphs(row.title, { align: AlignmentType.LEFT }),
      }),
      new TableCell({
        width: { size: columnWidths[3]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: statusParagraphs,
      }),
      new TableCell({
        width: { size: columnWidths[4]!, type: WidthType.DXA },
        verticalAlign: VerticalAlign.TOP,
        margins: CELL_MARGINS,
        borders: CELL_BORDERS,
        children: makeMultilineParagraphs(row.completedBy, { align: AlignmentType.CENTER }),
      }),
    ],
  });
}

function buildTable(
  rows: DocumentRow[],
  columnWidths: readonly number[],
  allowVerticalMerge: boolean,
): Table {
  return new Table({
    width: { size: TABLE.totalWidthTwips, type: WidthType.DXA },
    indent: { size: TABLE.indentTwips, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [...columnWidths],
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    },
    rows: [
      buildHeaderRow(columnWidths),
      ...rows.map((row) => buildBodyRow(row, columnWidths, allowVerticalMerge)),
    ],
  });
}

/**
 * Renders a DocumentModel into an exact-format OOXML (.docx) Buffer.
 */
export async function renderDocx(model: DocumentModel): Promise<Buffer> {
  const doc = new Document({
    title: model.documentTitle,
    subject: 'Daily Work Report',
    creator: 'CGHQ Team Work Report',
    description: `Daily report for ${model.formattedDate}`,
    numbering: {
      config: [
        {
          reference: 'status-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: PAGE.widthTwips,
              height: PAGE.heightTwips,
            },
            margin: {
              top: PAGE.marginsTwips.top,
              bottom: PAGE.marginsTwips.bottom,
              left: PAGE.marginsTwips.left,
              right: PAGE.marginsTwips.right,
              header: PAGE.marginsTwips.header,
              footer: PAGE.marginsTwips.footer,
            },
          },
        },
        headers: {
          default: buildHeader(model),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 0, after: 240 },
            children: [
              makeRun('Date: ', { bold: true }),
              makeRun(model.formattedDate),
            ],
          }),
          buildTable(model.mainRows, TABLE.mainColumnsTwips, true),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            keepNext: true,
            spacing: { before: 240, after: 120 },
            children: [
              makeRun('Follow-up Items:', { bold: true, underline: true }),
            ],
          }),
          buildTable(model.followupRows, TABLE.followupColumnsTwips, false),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 240, after: 0 },
            children: [
              makeRun('Prepared By: ', { bold: true }),
              makeRun(model.preparedBy),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
