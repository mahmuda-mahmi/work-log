import { BadRequestException } from '@nestjs/common';
import argon2 from 'argon2';

const COMMON_PASSWORDS = new Set([
  '123456789012',
  'password1234',
  'password12345',
  'qwertyuiop12',
  'admin1234567',
  'letmein12345',
  'welcome12345',
  'cghq12345678',
  'worklog12345',
  'iloveyou1234',
]);

export function assertPasswordPolicy(password: string): void {
  if (password.length < 8) {
    throw new BadRequestException({
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters',
    });
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new BadRequestException({
      code: 'WEAK_PASSWORD',
      message: 'Password is too common; choose a stronger password',
    });
  }
}

/**
 * Argon2id tuned for Vercel serverless memory limits (19 MiB / t=2 / p=1).
 */
export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
