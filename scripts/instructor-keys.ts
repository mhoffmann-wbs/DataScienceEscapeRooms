// Creates the instructor key pair and writes content/instructor.json (commit it).
// The public key lets every player verify instructor messages; the private key is stored
// encrypted with your passphrase. The file is public, so use a long passphrase.
//
//   npm run instructor-keys            asks for the passphrase
//   npm run instructor-keys -- --force replaces an existing key (old passphrase stops working)
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { createInstructorConfig } from '../src/net/instructorCrypto.ts';

const FILE = 'content/instructor.json';
const MIN_LENGTH = 12;

if (existsSync(FILE) && !process.argv.includes('--force')) {
  console.error(`${FILE} already exists. Use --force to replace it (the old passphrase will stop working).`);
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const passphrase = process.env.INSTRUCTOR_PASSPHRASE ?? (await rl.question(`Instructor passphrase (at least ${MIN_LENGTH} characters): `));
const again = process.env.INSTRUCTOR_PASSPHRASE ?? (await rl.question('Repeat it: '));
rl.close();
if (passphrase !== again) {
  console.error('The passphrases differ.');
  process.exit(1);
}
if (passphrase.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters: the encrypted key is public and can be attacked offline.`);
  process.exit(1);
}
writeFileSync(FILE, JSON.stringify(await createInstructorConfig(passphrase), null, 2) + '\n');
console.log(`wrote ${FILE}; commit it. Unlock instructor mode in the game with your passphrase.`);
