import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Buffer) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
}

const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
if (!email) throw new Error('OWNER_EMAIL is required.');
const issuer = process.env.OWNER_TOTP_ISSUER?.trim() || 'Nex4LMS';
const secret = encodeBase32(randomBytes(20));
const label = encodeURIComponent(`${issuer}:${email}`);
const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

process.stdout.write(`OWNER_TOTP_SECRET=${secret}\n`);
process.stdout.write(`${uri}\n`);
