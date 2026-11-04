import { Emitter } from '../lib/emitter';
import { ECDSA, fromB64, instructorMessageSchema, SIGN, signedSchema, toB64, type InstructorConfig, type InstructorDraft, type InstructorMessage, type Signed } from './instructorCrypto';
import type { NetRoom } from './transport';

// Instructor messages (announcements, run resets), signed with the instructor's private key.
// Every client verifies them with the public key from content/instructor.json, so students
// can't forge them. The private key is stored there too, encrypted with the instructor's
// passphrase (scripts/instructor-keys.ts). A weak passphrase can be brute-forced offline,
// since the encrypted key is public.

export { createInstructorConfig, instructorConfigSchema, unlockInstructor } from './instructorCrypto';
export type { InstructorConfig, InstructorDraft, InstructorMessage } from './instructorCrypto';

/** Accepted clock difference between instructor and player, and how long a nonce is remembered. */
const MAX_SKEW_MS = 10 * 60_000;

/**
 * The lobby's instructor channel: verifies incoming messages (signature, freshness, no replays)
 * and emits them. Without a config (no instructor set up) it ignores everything.
 */
export class InstructorChannel {
  readonly events = new Emitter<{ announce: Extract<InstructorMessage, { type: 'announce' }>; reset: Extract<InstructorMessage, { type: 'reset' }> }>();
  private readonly channel;
  private readonly off: () => void;
  private readonly seen = new Map<string, number>();
  private verifyKey: Promise<CryptoKey> | null;

  constructor(
    room: NetRoom,
    config: InstructorConfig | null,
    private readonly now: () => number = Date.now,
  ) {
    // `as never`: the JWK type is named differently in the DOM and Node typings; the schema checked its shape.
    this.verifyKey = config ? crypto.subtle.importKey('jwk', config.publicKey as never, ECDSA, false, ['verify']) : null;
    this.verifyKey?.catch(() => (this.verifyKey = null));
    this.channel = room.channel<Signed>('instructor');
    this.off = this.channel.subscribe((data) => void this.receive(data));
  }

  /** Signs and broadcasts a message; it is also delivered locally. */
  async send(signingKey: CryptoKey, message: InstructorDraft): Promise<void> {
    const full = { ...message, at: this.now(), nonce: toB64(crypto.getRandomValues(new Uint8Array(12))) };
    const payload = JSON.stringify(full);
    const signature = toB64(await crypto.subtle.sign(SIGN, signingKey, new TextEncoder().encode(payload)));
    const signed = { payload, signature };
    this.channel.send(signed);
    await this.receive(signed);
  }

  destroy(): void {
    this.off();
    this.events.clear();
  }

  private async receive(data: unknown): Promise<void> {
    const signed = signedSchema.safeParse(data);
    const key = this.verifyKey && (await this.verifyKey.catch(() => null));
    if (!signed.success || !key) return;
    let signature: Uint8Array<ArrayBuffer>;
    try {
      signature = fromB64(signed.data.signature);
    } catch {
      return; // not base64
    }
    const valid = await crypto.subtle.verify(SIGN, key, signature, new TextEncoder().encode(signed.data.payload)).catch(() => false);
    if (!valid) return;
    let parsed;
    try {
      parsed = instructorMessageSchema.safeParse(JSON.parse(signed.data.payload));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;
    const now = this.now();
    if (Math.abs(now - msg.at) > MAX_SKEW_MS || this.seen.has(msg.nonce)) return;
    for (const [nonce, at] of this.seen) if (now - at > MAX_SKEW_MS) this.seen.delete(nonce);
    this.seen.set(msg.nonce, msg.at);
    if (msg.type === 'announce') this.events.emit('announce', msg);
    else this.events.emit('reset', msg);
  }
}
