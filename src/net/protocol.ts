import { z } from 'zod';
import { AVATAR_COUNT, DIRECTIONS } from '../game/avatars';

// Wire formats. Everything received from peers is parsed with these schemas first.

export const CHANNELS = { hello: 'hello', pos: 'pos', chat: 'chat' } as const;

const coord = z.number().finite();
const direction = z.enum(DIRECTIONS);

export const posSchema = z.object({ x: coord, y: coord, dir: direction, moving: z.boolean() });
export type Pos = z.infer<typeof posSchema>;

/** Sent to each new peer (and to everyone once we know our position): who we are and where. */
export const helloSchema = posSchema.extend({
  nickname: z.string().trim().min(1).max(20),
  avatar: z.number().int().min(0).max(AVATAR_COUNT - 1),
});
export type Hello = z.infer<typeof helloSchema>;

export const CHAT_MAX_LENGTH = 500;
export const chatScope = z.enum(['all', 'nearby']);
export type ChatScope = z.infer<typeof chatScope>;
export const chatSchema = z.object({ text: z.string().trim().min(1).max(CHAT_MAX_LENGTH), scope: chatScope });
export type ChatPayload = z.infer<typeof chatSchema>;
