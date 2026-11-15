import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { TeamLeadGuard, TeamScopeGuard, type AuthenticatedRequest } from './auth.guard.js';
import { sniffLogoImage } from './image-sniff.js';
import { hashPassword, verifyPassword } from './password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../db/sql');

function mockContext(req: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

describe('Phase 2 Auth, Security & Permission Matrix', () => {
  it('hashes and verifies passwords with Argon2id and enforces 12+ char policy', async () => {
    await assert.rejects(() => hashPassword('short123'), /at least 12 characters/);
    await assert.rejects(() => hashPassword('password1234'), /too common/);

    const hash = await hashPassword('CorrectHorseBattery99!');
    assert.ok(hash.startsWith('$argon2id$'));
    assert.equal(await verifyPassword(hash, 'CorrectHorseBattery99!'), true);
    assert.equal(await verifyPassword(hash, 'WrongPassword99!'), false);
  });

  it('rejects SVG and accepts valid PNG magic bytes for logos (NFR-14)', () => {
    assert.throws(
      () => sniffLogoImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
      /SVG is not allowed/,
    );

    // Minimal valid PNG header with IHDR 100x50
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(100, 16);
    png.writeUInt32BE(50, 20);

    const res = sniffLogoImage(png);
    assert.equal(res.mimeType, 'image/png');
    assert.equal(res.width, 100);
    assert.equal(res.height, 50);
  });

  it('enforces cross-team isolation (TeamScopeGuard) and role matrix (TeamLeadGuard)', () => {
    const scopeGuard = new TeamScopeGuard();
    const leadGuard = new TeamLeadGuard();

    assert.throws(
      () =>
        scopeGuard.canActivate(
          mockContext({
            params: { teamId: 'team-b' },
            auth: { teamId: 'team-a', role: 'lead' } as AuthenticatedRequest['auth'],
          }),
        ),
      ForbiddenException,
    );

    assert.equal(
      scopeGuard.canActivate(
        mockContext({
          params: { teamId: 'team-a' },
          auth: { teamId: 'team-a', role: 'member' } as AuthenticatedRequest['auth'],
        }),
      ),
      true,
    );

    assert.throws(
      () =>
        leadGuard.canActivate(
          mockContext({
            auth: { teamId: 'team-a', role: 'member' } as AuthenticatedRequest['auth'],
          }),
        ),
      ForbiddenException,
    );

    assert.equal(
      leadGuard.canActivate(
        mockContext({
          auth: { teamId: 'team-a', role: 'lead' } as AuthenticatedRequest['auth'],
        }),
      ),
      true,
    );
  });

  it('keeps all raw SQL files free of SELECT * and string interpolation', () => {
    const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql.ts'));
    assert.ok(files.length >= 4);
    for (const file of files) {
      const content = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
      assert.equal(/SELECT\s+\*/i.test(content), false, `${file} contains SELECT *`);
      assert.equal(content.includes('${'), false, `${file} contains template interpolation`);
    }
  });
});
