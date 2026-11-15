import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    const schema = this.schema ?? (metadata.metatype as unknown as { schema?: ZodSchema } | undefined)?.schema;
    if (!schema || typeof schema.safeParse !== 'function') {
      return value;
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        issues: parsed.error.issues,
      });
    }
    return parsed.data;
  }
}
