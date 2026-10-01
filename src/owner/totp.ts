import { createHmac, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value: string) {
  let bits = '';
  for (const character of value.replace(/=+$/g, '').replace(/\s/g, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function codeAt(secret: string, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, submittedCode: string, now = Date.now()) {
  return matchTotpCounter(secret, submittedCode, now) !== null;
}

export function matchTotpCounter(secret: string, submittedCode: string, now = Date.now()) {
  if (!/^\d{6}$/.test(submittedCode)) return null;
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(codeAt(secret, counter + drift));
    const submitted = Buffer.from(submittedCode);
    if (expected.length === submitted.length && timingSafeEqual(expected, submitted)) return counter + drift;
  }
  return null;
}

