// The only networking API the rest of the app sees. Adapters: trystero (P2P) and
// memory (tests, solo mode). A self-hosted server adapter can be added later.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Channel<T extends Json> {
  /** Sends to all peers, or only to `to`. An empty `to` sends nothing. */
  send(data: T, to?: readonly string[]): void;
  /**
   * Incoming data is `unknown`: peers are untrusted, so validate before use.
   * Messages that arrive before the first subscriber are delivered to it.
   */
  subscribe(handler: (data: unknown, from: string) => void): () => void;
}

export interface NetRoom {
  readonly selfId: string;
  channel<T extends Json>(name: string): Channel<T>;
  peers(): string[];
  /** Also called immediately for every peer already connected, so late subscribers miss nobody. */
  onPeerJoin(handler: (peerId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string) => void): () => void;
  /** Starts sending a local audio/video stream to these peers. */
  sendStream(stream: MediaStream, to: readonly string[]): void;
  /** Stops sending it to these peers. Receivers are not told; they decide what to play themselves. */
  stopStream(stream: MediaStream, to: readonly string[]): void;
  /** A peer started sending us a stream (a new one replaces its previous one). */
  onPeerStream(handler: (stream: MediaStream, peerId: string) => void): () => void;
  leave(): void;
}

export interface Transport {
  /** Joins a scope such as `lobby` or `room:<roomId>:<teamId>` within this transport's class code. */
  join(scope: string): NetRoom;
}
