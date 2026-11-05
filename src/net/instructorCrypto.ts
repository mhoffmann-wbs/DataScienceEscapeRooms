import { z } from 'zod';

// Node-safe part of instructor mode (also used by scripts/instructor-keys.ts): message and
// config formats, key creation, unlocking and signing primitives. Only zod imports here.

export const instructorConfigSchema = z.object({
  version: z.literal(1),
  publicKey: z.record(z.string(), z.unknown()),
  encryptedKey: z.object({ salt: z.string(), iv: z.string(), data: z.string(), iterations: z.number().int().min(100_000) }),
});
export type InstructorConfig = z.infer<typeof instructorConfigSchema>;

const base = { at: z.number().finite(), nonce: z.string().min(8).max(64) };
export const instructorMessageSchema = z.discriminatedUnion('type', [
  // `teamId` set: only that team gets it; otherwise everyone, or one group.
  z.object({ type: z.literal('announce'), text: z.string().trim().min(1).max(500), group: z.string().max(24).nullable(), teamId: z.string().min(1).max(64).nullable().default(null), ...base }),
  z.object({ type: z.literal('reset'), teamId: z.string().min(1).max(64), epoch: z.number().finite(), ...base }),
  // The instructor (lobby peer `peerId`) wants to visit a team's room; a member invites that peer.
  z.object({ type: z.literal('visit'), teamId: z.string().min(1).max(64), peerId: z.string().min(1).max(64), ...base }),
  // Peer `peerId` is an instructor: everyone labels its avatar.
  z.object({ type: z.literal('present'), peerId: z.string().min(1).max(64), ...base }),
  // Remove result `id` (`<teamId>@<epoch>`) from the scoreboard, for good: relayed to newcomers.
  z.object({ type: z.literal('removeScore'), id: z.string().min(1).max(140), ...base }),
]);
export type InstructorMessage = z.infer<typeof instructorMessageSchema>;
/** What the instructor composes; time and nonce are added when signing. */
type MessageInput = z.input<typeof instructorMessageSchema>;
export type InstructorDraft = MessageInput extends infer M ? (M extends MessageInput ? Omit<M, 'at' | 'nonce'> : never) : never;

export const signedSchema = z.object({ payload: z.string().max(4000), signature: z.string().max(200) });
export type Signed = z.infer<typeof signedSchema>;

export const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
export const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Creates a key pair and the config to commit (used by scripts/instructor-keys.mjs and tests). */
export async function createInstructorConfig(passphrase: string, iterations = 600_000): Promise<InstructorConfig> {
  // Typed by shape: this module also compiles for Node scripts, where the DOM's key types don't exist.
  const pair = (await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify'])) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passphraseKey(passphrase, salt, iterations), pkcs8);
  return {
    version: 1,
    publicKey: (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<string, unknown>,
    encryptedKey: { salt: toB64(salt), iv: toB64(iv), data: toB64(data), iterations },
  };
}

/** The signing key, or null if the passphrase is wrong. */
export async function unlockInstructor(config: InstructorConfig, passphrase: string): Promise<CryptoKey | null> {
  const { salt, iv, data, iterations } = config.encryptedKey;
  try {
    const key = await passphraseKey(passphrase, fromB64(salt), iterations);
    const pkcs8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data));
    return await crypto.subtle.importKey('pkcs8', pkcs8, ECDSA, false, ['sign']);
  } catch {
    return null;
  }
}
