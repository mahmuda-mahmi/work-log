import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LOGO_PATH = path.resolve(__dirname, '../assets/default-logo.png');

let cachedLogo: Buffer | null = null;

/**
 * Returns the bundled default company logo (Solution Art) when a team has not uploaded a custom logo.
 */
export function getDefaultLogoBytes(): Buffer | null {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = fs.readFileSync(DEFAULT_LOGO_PATH);
    return cachedLogo;
  } catch {
    return null;
  }
}
