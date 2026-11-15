import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentModel,
  buildExportFileName,
  renderDocx,
  renderPdf,
} from '@cghq/document';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../db/sql');

describe('Phase 4 Exports, Followups & SQL Hygiene', () => {
  it('includes followups.sql.ts and exports.sql.ts in raw SQL directory', () => {
    const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql.ts'));
    assert.ok(files.includes('followups.sql.ts'));
    assert.ok(files.includes('exports.sql.ts'));
  });

  it('renders valid DOCX and PDF buffers from finalized report model with follow-ups', async () => {
    const model = buildDocumentModel({
      reportDate: '2026-11-15',
      preparedBy: 'Alice',
      entries: [
        {
          categoryName: 'Operations',
          titleName: 'Server Deployment',
          statusText: 'Deployed Phase 4 API and verified database',
          completedBy: 'Alice',
          numberingMode: 'numbered',
        },
      ],
      followups: [
        {
          categoryName: 'Operations',
          titleName: 'Blob Backup',
          statusText: 'Verify nightly archive job',
          completedBy: 'As Previous',
        },
      ],
    });

    const docx = await renderDocx(model);
    const pdf = await renderPdf(model);

    assert.ok(docx.byteLength > 1000);
    assert.equal(docx.subarray(0, 2).toString('ascii'), 'PK'); // ZIP header
    assert.ok(pdf.byteLength > 1000);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');

    assert.equal(
      buildExportFileName({ reportDate: '2026-11-15', format: 'pdf' }),
      'CGHQ_Team_Work_Status_15_November_2026.pdf',
    );
    assert.equal(
      buildExportFileName({ reportDate: '2026-11-15', format: 'docx' }),
      'CGHQ_Team_Work_Status_15_November_2026.docx',
    );
  });
});
