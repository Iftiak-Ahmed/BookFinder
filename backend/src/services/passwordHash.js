import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** "salt:hash", both hex — no extra dependency needed for password storage. */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;

  const [salt, hashHex] = stored.split(':');
  const hash = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, hash.length);

  return hash.length === derived.length && timingSafeEqual(hash, derived);
}
