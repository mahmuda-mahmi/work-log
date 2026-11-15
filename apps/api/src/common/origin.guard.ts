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
 */
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const allowedOrigin = process.env.PUBLIC_ORIGIN?.trim();
    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    // Allow non-browser / local curl when PUBLIC_ORIGIN is not configured
    if (!allowedOrigin) {
      return true;
    }

    if (originHeader) {
      if (originHeader === allowedOrigin) return true;
      throw new ForbiddenException({
        code: 'CSRF_ORIGIN_MISMATCH',
        message: 'Request origin is not allowed',
      });
    }

    if (refererHeader) {
      try {
        const refOrigin = new URL(refererHeader).origin;
        if (refOrigin === allowedOrigin) return true;
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
