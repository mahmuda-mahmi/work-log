import { BadRequestException } from '@nestjs/common';

export const MAX_LOGO_BYTES = 1_048_576; // 1 MB per NFR-14
export const MAX_LOGO_SIDE_PX = 1000;

export interface SniffedImage {
  mimeType: 'image/png' | 'image/jpeg';
  width: number | null;
  height: number | null;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Validates uploaded logo bytes by magic bytes (not client Content-Type).
 * Rejects SVG, HTML, WebP, and oversized files per NFR-14.
 */
export function sniffLogoImage(bytes: Buffer): SniffedImage {
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    throw new BadRequestException({
      code: 'INVALID_LOGO_SIZE',
      message: 'Logo must be between 1 byte and 1 MB',
    });
  }

  // Reject SVG / XML / HTML explicitly
  const headText = bytes.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  if (headText.startsWith('<svg') || headText.startsWith('<?xml') || headText.startsWith('<html')) {
    throw new BadRequestException({
      code: 'UNSUPPORTED_IMAGE_FORMAT',
      message: 'SVG is not allowed; upload a PNG or JPEG image',
    });
  }

  // PNG check + IHDR dimensions
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    const ihdr = bytes.subarray(12, 16).toString('ascii');
    if (ihdr !== 'IHDR') {
      throw new BadRequestException({
        code: 'INVALID_IMAGE',
        message: 'Corrupt PNG header',
      });
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width > MAX_LOGO_SIDE_PX || height > MAX_LOGO_SIDE_PX || width === 0 || height === 0) {
      throw new BadRequestException({
        code: 'INVALID_LOGO_DIMENSIONS',
        message: `PNG dimensions must be between 1 and ${MAX_LOGO_SIDE_PX} px`,
      });
    }
    return { mimeType: 'image/png', width, height };
  }

  // JPEG check (FF D8 FF)
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', width: null, height: null };
  }

  throw new BadRequestException({
    code: 'UNSUPPORTED_IMAGE_FORMAT',
    message: 'Only PNG and JPEG images are supported',
  });
}
