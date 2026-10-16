import { randomBytes } from 'node:crypto';

export const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
} as const;
export type MediaContentType = keyof typeof EXT_BY_TYPE;

// u/<userId>/<24 hex>.<ext>. The strict shape is what makes keys safe to join onto a directory.
const KEY_RE = /^u\/[\w-]{1,64}\/[a-f0-9]{24}\.(png|jpg|webp|mp4)$/;

export const isValidKey = (key: string): boolean => KEY_RE.test(key);

export function newKey(userId: string, contentType: MediaContentType): string {
  return `u/${userId}/${randomBytes(12).toString('hex')}.${EXT_BY_TYPE[contentType]}`;
}

export const keyOwnerId = (key: string): string | null => (isValidKey(key) ? key.split('/')[1]! : null);
