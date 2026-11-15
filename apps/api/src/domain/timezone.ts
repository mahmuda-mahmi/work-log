import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { MemberRole } from '@cghq/contracts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Computes YYYY-MM-DD for "now" in the team's IANA timezone (FR-5).
 */
export function getTeamTodayDate(timezone: string, now = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  }
}

export function assertValidIsoDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: 'Date must be formatted as YYYY-MM-DD',
    });
  }
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m! - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: 'Calendar date does not exist',
    });
  }
  return trimmed;
}

export function diffDaysIso(laterIso: string, earlierIso: string): number {
  const a = Date.parse(`${laterIso}T00:00:00Z`);
  const b = Date.parse(`${earlierIso}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

/**
 * Enforces FR-5: no future-dated reports; members can backfill up to 7 days,
 * Team Leads have unlimited backfill.
 */
export function assertDateAllowedForCreate(
  reportDate: string,
  todayDate: string,
  role: MemberRole,
): void {
  const daysBack = diffDaysIso(todayDate, reportDate);
  if (daysBack < 0) {
    throw new BadRequestException({
      code: 'FUTURE_DATE_FORBIDDEN',
      message: 'Future-dated reports cannot be created',
    });
  }
  if (role !== 'lead' && daysBack > 7) {
    throw new ForbiddenException({
      code: 'BACKFILL_LIMIT_EXCEEDED',
      message: 'Members can only backfill reports up to 7 days; ask a Team Lead for older dates',
    });
  }
}
