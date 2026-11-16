import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import {
  buildDocumentModel,
  buildExportFileName,
  findUnsupportedLatinChars,
  formatReportDate,
  renderDocx,
  renderPdf,
} from './index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../assets/default-logo.png');

describe('@cghq/document Phase 1 Format Proof', () => {
  it('formats zero-padded dates and export filenames per Q1 & PRD §4.5', () => {
    const { headerDate, fileDate } = formatReportDate('2026-11-05');
    assert.equal(headerDate, '05 November 2026');
    assert.equal(fileDate, '05_November_2026');

    assert.equal(
      buildExportFileName({ reportDate: '2026-11-05', format: 'pdf' }),
      'CGHQ_Team_Work_Status_05_November_2026.pdf',
    );
    assert.equal(
      buildExportFileName({
        reportDate: '2026-11-05',
        format: 'docx',
        revision: 2,
        isSuperseded: true,
      }),
      'CGHQ_Team_Work_Status_05_November_2026_rev2.docx',
    );
  });

  it('detects non-Latin characters per FR-20 / Q3', () => {
    assert.deepEqual(findUnsupportedLatinChars('Completed API setup — v1.0'), []);
    assert.deepEqual(findUnsupportedLatinChars('কাজ শেষ'), ['ক', 'া', 'জ', ' ', 'শ', 'ে', 'ষ'].filter((c) => c !== ' '));
  });

  it('renders empty follow-up table with "None" row (Q4) and individual Completed By cells (Q2)', async () => {
    const logoBytes = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
    const model = buildDocumentModel({
      reportDate: '2026-11-05',
      preparedBy: 'Alex Rahman',
      logoBytes,
      entries: [
        {
          categoryName: 'Software Development',
          titleName: 'CGHQ Work Log',
          statusText: 'Initialized MySQL schema',
          completedBy: 'Alice',
        },
        {
          categoryName: 'software development ',
          titleName: 'cghq work log',
          statusText: 'Built PDF renderer',
          completedBy: 'Alex',
        },
      ],
      followups: [],
    });

    assert.equal(model.mainRows.length, 2);
    assert.equal(model.mainRows[0]!.ser, '1');
    assert.equal(model.mainRows[0]!.groupMerge, 'restart');
    assert.equal(model.mainRows[0]!.completedBy, 'Alice');
    assert.equal(model.mainRows[1]!.ser, '');
    assert.equal(model.mainRows[1]!.groupMerge, 'continue');
    assert.equal(model.mainRows[1]!.completedBy, 'Alex');

    assert.equal(model.followupRows.length, 1);
    assert.equal(model.followupRows[0]!.status, 'None');

    const docxBuf = await renderDocx(model);
    const pdfBuf = await renderPdf(model);

    // Structural DOCX checks
    const zip = new AdmZip(docxBuf);
    const docXml = zip.readAsText('word/document.xml');
    const hdrXml = zip.readAsText('word/header1.xml');

    assert.ok(docXml.includes('w:w="16838"'), 'DOCX page width should be 16838 twips (A4 Landscape)');
    assert.ok(docXml.includes('w:h="11906"'), 'DOCX page height should be 11906 twips (A4 Landscape)');
    assert.ok(docXml.includes('05 November 2026'), 'Zero-padded date missing in DOCX');
    assert.ok(docXml.includes('Times New Roman'), 'Times New Roman font missing in DOCX');
    assert.ok(docXml.includes('w:vMerge'), 'Vertical merge missing in DOCX');
    assert.equal((docXml.match(/<w:tbl>/g) ?? []).length, 2, 'DOCX must have exactly 2 tables');
    assert.ok(hdrXml.includes('CGHQ Daily Report'), 'Repeating header title missing');

    // Structural PDF checks
    const pdf = await PDFDocument.load(pdfBuf);
    assert.equal(pdf.getPageCount(), 1);
    const size = pdf.getPage(0).getSize();
    assert.ok(Math.abs(size.width - 841.89) < 0.1, 'PDF width should be 841.89pt (A4 Landscape)');
    assert.ok(Math.abs(size.height - 595.28) < 0.1, 'PDF height should be 595.28pt (A4 Landscape)');
  });

  it('renders a multi-page report with long merged group spanning page breaks (Q5)', async () => {
    const logoBytes = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;
    const entries = Array.from({ length: 22 }, (_, i) => ({
      categoryName: 'Hospital Management System',
      titleName: 'Module Integration & Testing',
      statusText: `Completed integration test case #${i + 1} for patient intake, lab routing, and billing reconciliation across wards.`,
      completedBy: i % 2 === 0 ? 'Alice' : 'Alex',
    }));

    const model = buildDocumentModel({
      reportDate: '2026-11-12',
      preparedBy: 'Alex Rahman',
      logoBytes,
      entries,
      followups: [
        {
          categoryName: 'Deployment',
          titleName: 'Aiven MySQL',
          statusText: 'Verify SSL connection and backup schedule.',
          completedBy: 'As Previous',
        },
      ],
    });

    const [docxBuf, pdfBuf] = await Promise.all([renderDocx(model), renderPdf(model)]);
    assert.ok(docxBuf.length > 5000);

    const pdf = await PDFDocument.load(pdfBuf);
    assert.ok(pdf.getPageCount() >= 2, `Expected >= 2 pages, got ${pdf.getPageCount()}`);
  });
});
