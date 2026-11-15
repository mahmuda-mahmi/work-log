import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Verifies Origin / Referer on state-changing requests (NFR-8).
 * Accepts configured PUBLIC_ORIGIN (comma-separated) or exact same-origin host.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const allowedOrigins = new Set(
      (process.env.PUBLIC_ORIGIN ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = typeof forwardedHost === 'string' ? forwardedHost : req.headers.host;
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]!.trim() : 'https';
    if (hostHeader) {
      allowedOrigins.add(`${proto}://${hostHeader}`);
      allowedOrigins.add(`https://${hostHeader}`);
    }

    if (allowedOrigins.size === 0) {
      return true;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    if (originHeader) {
      if (allowedOrigins.has(originHeader)) return true;
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_MISMATCH',
        message: 'Request origin is not allowed',
      });
    }

    if (refererHeader) {
      try {
        const refOrigin = new URL(refererHeader).origin;
        if (allowedOrigins.has(refOrigin)) return true;
      } catch {
        // fall through
      }
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_MISMATCH',
        message: 'Request referer is not allowed',
      });
    }

    throw new ForbiddenException({
      code: 'CSRF_ORIGIN_MISSING',
      message: 'Origin header is required for mutating requests',
    });
  }
}
