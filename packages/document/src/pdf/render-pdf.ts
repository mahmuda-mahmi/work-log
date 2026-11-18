import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import type { DocumentModel, DocumentRow } from '../model.js';
import { FONT, HEADER, PAGE, TABLE, TWIPS_PER_PT } from '../tokens.js';

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const result: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (para.length === 0) {
      result.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          result.push(currentLine);
        }
        // Hard-break a single token that is wider than maxWidth
        if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) result.push(chunk);
              chunk = ch;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result.length > 0 ? result : [''];
}

interface LayoutRow {
  cells: Array<{
    lines: string[];
    prefix?: string;
    align: 'left' | 'center';
    bold: boolean;
    indentPt: number;
    lineHeightPt: number;
    drawTopBorder: boolean;
    drawBottomBorder: boolean;
  }>;
  heightPt: number;
  mergedHeightPt: number;
  groupMerge: 'none' | 'restart' | 'continue';
}

function measureRow(
  row: DocumentRow,
  colWidthsPt: number[],
  regularFont: PDFFont,
  boldFont: PDFFont,
  options: {
    isHeader?: boolean;
    isLastRowInGroup?: boolean;
    isFirstRowOnPage?: boolean;
    isLastRowOnPage?: boolean;
    allowVerticalMerge: boolean;
    bodyFontPt?: number;
  },
): LayoutRow {
  const padX = TABLE.cellPadHorizontalPt;
  const padY = TABLE.cellPadVerticalPt;
  const fontSize = options.bodyFontPt ?? FONT.bodyPt;
  const minHeight = options.isHeader ? TABLE.headerMinHeightPt : TABLE.bodyMinHeightPt;

  // On continuation pages, Q5 requires leaving Ser/Category/Title blank.
  const suppressMergedText =
    !options.isHeader &&
    options.allowVerticalMerge &&
    row.groupMerge === 'continue' &&
    options.isFirstRowOnPage;

  const rawValues = options.isHeader
    ? TABLE.headers
    : [
        suppressMergedText ? '' : row.ser,
        suppressMergedText ? '' : row.category,
        suppressMergedText ? '' : row.title,
        row.status,
        row.completedBy,
      ];

  const cells = rawValues.map((val, idx) => {
    const bold = Boolean(options.isHeader);
    const font = bold ? boldFont : regularFont;
    const isNumberedStatus = !options.isHeader && idx === 3 && Boolean(row.statusPrefix);
    const indentPt = isNumberedStatus ? 18 : 0; // 360 twips = 18 pt
    const lineHeightPt = isNumberedStatus ? fontSize * 1.38 : fontSize * 1.2;
    const availableWidth = Math.max(10, colWidthsPt[idx]! - padX * 2 - indentPt);
    const lines = wrapText(val, font, fontSize, availableWidth);
    const align: 'left' | 'center' = options.isHeader
      ? 'center'
      : idx === 0 || idx === 4
        ? 'center'
        : 'left';

    const isMergedCol = options.allowVerticalMerge && idx < 3 && !options.isHeader;
    const drawTopBorder =
      !isMergedCol ||
      row.groupMerge === 'none' ||
      row.groupMerge === 'restart' ||
      Boolean(options.isFirstRowOnPage);
    const drawBottomBorder =
      !isMergedCol ||
      row.groupMerge === 'none' ||
      Boolean(options.isLastRowInGroup) ||
      Boolean(options.isLastRowOnPage);

    return {
      lines,
      prefix: isNumberedStatus ? row.statusPrefix : undefined,
      align,
      bold,
      indentPt,
      lineHeightPt,
      drawTopBorder,
      drawBottomBorder,
    };
  });

  const mergedHeightPt = Math.max(
    ...cells.slice(0, 3).map((c) => c.lines.length * c.lineHeightPt + padY * 2),
  );
  const bodyContentHeight = Math.max(
    ...cells.slice(3).map((c) => c.lines.length * c.lineHeightPt + padY * 2),
  );
  const useDeferredMergedHeight =
    !options.isHeader && options.allowVerticalMerge && row.groupMerge === 'restart';
  const maxContentHeight = useDeferredMergedHeight
    ? bodyContentHeight
    : Math.max(mergedHeightPt, bodyContentHeight);

  return {
    cells,
    heightPt: Math.max(minHeight, maxContentHeight),
    mergedHeightPt,
    groupMerge: row.groupMerge,
  };
}

/**
 * Renders a DocumentModel into a deterministic PDF Buffer using Times New Roman (Base14 Times-Roman).
 */
export async function renderPdf(model: DocumentModel): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(model.documentTitle);
  pdfDoc.setSubject('Daily Work Report');
  pdfDoc.setCreator('CGHQ Team Work Report');

  const bodyFontPt = FONT.bodyPt;
  const regularFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  let embeddedLogo: PDFImage | null = null;
  if (model.logoBytes) {
    try {
      embeddedLogo = await pdfDoc.embedPng(model.logoBytes);
    } catch {
      embeddedLogo = await pdfDoc.embedJpg(model.logoBytes);
    }
  }

  const pageWidth = PAGE.widthPt;
  const pageHeight = PAGE.heightPt;
  const leftMargin = PAGE.marginsPt.left;
  const bottomMargin = PAGE.marginsPt.bottom;
  const tableLeftX = leftMargin + TABLE.indentPt;

  let page!: PDFPage;
  let cursorY = 0;

  function startNewPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - PAGE.marginsPt.header;

    if (embeddedLogo) {
      y -= HEADER.logoHeightPt;
      page.drawImage(embeddedLogo, {
        x: (pageWidth - HEADER.logoWidthPt) / 2,
        y,
        width: HEADER.logoWidthPt,
        height: HEADER.logoHeightPt,
      });
      y -= 16;
    }

    const titleWidth = boldFont.widthOfTextAtSize(model.documentTitle, HEADER.titleFontPt);
    y -= HEADER.titleFontPt;
    page.drawText(model.documentTitle, {
      x: (pageWidth - titleWidth) / 2,
      y,
      size: HEADER.titleFontPt,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    cursorY = Math.min(y - 16, pageHeight - PAGE.marginsPt.top);
  }

  function drawRow(layout: LayoutRow, colWidthsPt: number[]) {
    const rowTopY = cursorY;
    const rowBottomY = rowTopY - layout.heightPt;
    let x = tableLeftX;

    for (let i = 0; i < colWidthsPt.length; i++) {
      const colW = colWidthsPt[i]!;
      const cell = layout.cells[i]!;
      const font = cell.bold ? boldFont : regularFont;
      const fontSize = bodyFontPt;

      // Borders
      if (cell.drawTopBorder) {
        page.drawLine({
          start: { x, y: rowTopY },
          end: { x: x + colW, y: rowTopY },
          thickness: TABLE.borderPt,
          color: rgb(0, 0, 0),
        });
      }
      if (cell.drawBottomBorder) {
        page.drawLine({
          start: { x, y: rowBottomY },
          end: { x: x + colW, y: rowBottomY },
          thickness: TABLE.borderPt,
          color: rgb(0, 0, 0),
        });
      }
      page.drawLine({
        start: { x, y: rowTopY },
        end: { x, y: rowBottomY },
        thickness: TABLE.borderPt,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: x + colW, y: rowTopY },
        end: { x: x + colW, y: rowBottomY },
        thickness: TABLE.borderPt,
        color: rgb(0, 0, 0),
      });

      // Text lines (top-aligned)
      let textY = rowTopY - TABLE.cellPadVerticalPt - fontSize + 2;
      for (let lineIdx = 0; lineIdx < cell.lines.length; lineIdx++) {
        const line = cell.lines[lineIdx]!;
        if (lineIdx === 0 && cell.prefix) {
          page.drawText(cell.prefix, {
            x: x + TABLE.cellPadHorizontalPt,
            y: textY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
        if (line.length > 0) {
          const lineWidth = font.widthOfTextAtSize(line, fontSize);
          const textX =
            cell.align === 'center'
              ? x + (colW - lineWidth) / 2
              : x + TABLE.cellPadHorizontalPt + cell.indentPt;
          page.drawText(line, {
            x: textX,
            y: textY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
        textY -= cell.lineHeightPt;
      }

      x += colW;
    }

    cursorY = rowBottomY;
  }

  function renderTable(
    rows: DocumentRow[],
    colWidthsTwips: readonly number[],
    allowVerticalMerge: boolean,
    heading?: string,
  ) {
    const colWidthsPt = colWidthsTwips.map((w) => w / TWIPS_PER_PT);
    const headerLayout = measureRow(
      { ser: '', category: '', title: '', status: '', completedBy: '', groupMerge: 'none' },
      colWidthsPt,
      regularFont,
      boldFont,
      { isHeader: true, allowVerticalMerge: false, bodyFontPt },
    );

    if (heading) {
      const neededForHeadingAndHeader = 28 + headerLayout.heightPt;
      if (cursorY - neededForHeadingAndHeader < bottomMargin) {
        startNewPage();
      }
      cursorY -= 16;
      page.drawText(heading, {
        x: leftMargin,
        y: cursorY,
        size: bodyFontPt,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      const headingWidth = boldFont.widthOfTextAtSize(heading, bodyFontPt);
      page.drawLine({
        start: { x: leftMargin, y: cursorY - 2 },
        end: { x: leftMargin + headingWidth, y: cursorY - 2 },
        thickness: 0.8,
        color: rgb(0, 0, 0),
      });
      cursorY -= 12;
    } else if (cursorY - headerLayout.heightPt < bottomMargin) {
      startNewPage();
    }

    drawRow(headerLayout, colWidthsPt);

    let remainingMergedHeightPt = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const nextRow = rows[i + 1];
      const isLastRowInGroup = !nextRow || nextRow.groupMerge !== 'continue';

      let layout = measureRow(row, colWidthsPt, regularFont, boldFont, {
        isLastRowInGroup,
        isFirstRowOnPage: false,
        isLastRowOnPage: false,
        allowVerticalMerge,
        bodyFontPt,
      });

      if (cursorY - layout.heightPt < bottomMargin) {
        startNewPage();
        remainingMergedHeightPt = 0;
        layout = measureRow(row, colWidthsPt, regularFont, boldFont, {
          isLastRowInGroup,
          isFirstRowOnPage: true,
          isLastRowOnPage: false,
          allowVerticalMerge,
          bodyFontPt,
        });
      }

      let isLastOnPage = false;
      // Check if next row will push to a new page so we close the bottom border cleanly
      if (nextRow) {
        const nextLayout = measureRow(nextRow, colWidthsPt, regularFont, boldFont, {
          isLastRowInGroup: true,
          allowVerticalMerge,
          bodyFontPt,
        });
        if (cursorY - layout.heightPt - nextLayout.heightPt < bottomMargin) {
          isLastOnPage = true;
          layout = measureRow(row, colWidthsPt, regularFont, boldFont, {
            isLastRowInGroup,
            isFirstRowOnPage: layout.cells[0]?.drawTopBorder && row.groupMerge === 'continue',
            isLastRowOnPage: true,
            allowVerticalMerge,
            bodyFontPt,
          });
        }
      }

      if (allowVerticalMerge) {
        if (row.groupMerge === 'restart') {
          remainingMergedHeightPt = Math.max(0, layout.mergedHeightPt - layout.heightPt);
        } else if (row.groupMerge === 'continue') {
          remainingMergedHeightPt = Math.max(0, remainingMergedHeightPt - layout.heightPt);
        } else {
          remainingMergedHeightPt = 0;
        }

        if ((isLastRowInGroup || isLastOnPage) && remainingMergedHeightPt > 0) {
          layout.heightPt += remainingMergedHeightPt;
          remainingMergedHeightPt = 0;
        }
      }

      drawRow(layout, colWidthsPt);
    }
  }

  startNewPage();

  // Date line
  const dateLabel = 'Date: ';
  const dateLabelWidth = boldFont.widthOfTextAtSize(dateLabel, bodyFontPt);
  page.drawText(dateLabel, {
    x: leftMargin,
    y: cursorY,
    size: bodyFontPt,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(model.formattedDate, {
    x: leftMargin + dateLabelWidth,
    y: cursorY,
    size: bodyFontPt,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  cursorY -= Math.round(bodyFontPt * 1.25);

  // Table 1: Daily Work Status
  renderTable(model.mainRows, TABLE.mainColumnsTwips, true);

  if (model.hasFollowups) {
    // Add breathing room between Daily Work table and Follow-up Items
    cursorY -= 14;

    // Table 2: Follow-up Items
    renderTable(model.followupRows, TABLE.followupColumnsTwips, false, 'Follow-up Items:');
  }

  // Prepared By
  if (cursorY - 32 < bottomMargin) {
    startNewPage();
  }
  cursorY -= 20;
  const prepLabel = 'Prepared By: ';
  const prepLabelWidth = boldFont.widthOfTextAtSize(prepLabel, bodyFontPt);
  page.drawText(prepLabel, {
    x: leftMargin,
    y: cursorY,
    size: bodyFontPt,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText(model.preparedBy, {
    x: leftMargin + prepLabelWidth,
    y: cursorY,
    size: bodyFontPt,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
