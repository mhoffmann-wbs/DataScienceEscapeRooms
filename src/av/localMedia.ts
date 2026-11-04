import { Emitter } from '../lib/emitter';

// The local microphone and camera. Browser-only; the networking side is Media (src/net/media.ts).

/** Why A/V isn't (fully) working, worded for the player in the `av.errors.*` strings. */
export type AvError = 'denied' | 'noMic' | 'noCam' | 'busy' | 'unsupported' | 'failed';

export interface LocalState {
  status: 'off' | 'starting' | 'on';
  /** null while on: listening only, because no microphone could be used. */
  stream: MediaStream | null;
  mic: boolean;
  cam: boolean;
  error: AvError | null;
}

interface Prefs {
  /** Rejoin A/V automatically, e.g. after walking from the lobby into a room. */
  on: boolean;
  cam: boolean;
  micId?: string;
  camId?: string;
}

const PREFS_KEY = 'dser.av';

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      on: raw.on === true,
      cam: raw.cam === true,
      micId: typeof raw.micId === 'string' ? raw.micId : undefined,
      camId: typeof raw.camId === 'string' ? raw.camId : undefined,
    };
  } catch {
    return { on: false, cam: false };
  }
}

function errorOf(e: unknown): AvError {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noMic';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

export class LocalMedia {
  readonly events = new Emitter<{ state: LocalState }>();
  private state: LocalState = { status: 'off', stream: null, mic: true, cam: false, error: null };
  private prefs = loadPrefs();
  /** Bumped on every start/stop, so a slow getUserMedia can't overwrite a newer state. */
  private generation = 0;

  get(): LocalState {
    return this.state;
  }

  /** Whether the player had A/V on last time (rejoin without asking again). */
  wantsOn(): boolean {
    return this.prefs.on;
  }

  devices(): { micId?: string; camId?: string } {
    return { micId: this.prefs.micId, camId: this.prefs.camId };
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ status: 'off', error: 'unsupported' });
      return;
    }
    const gen = ++this.generation;
    this.set({ status: 'starting', error: null });
    const wantCam = this.prefs.cam;
    let stream: MediaStream | null = null;
    let error: AvError | null = null;
    try {
      stream = await this.acquire(true, wantCam);
    } catch (e) {
      error = errorOf(e);
      // A missing or blocked camera shouldn't stop voice.
      if (wantCam && error !== 'denied') {
        try {
          stream = await this.acquire(true, false);
          error = 'noCam';
        } catch (e2) {
          error = errorOf(e2);
        }
      }
    }
    if (gen !== this.generation) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!stream && error === 'denied') {
      this.set({ status: 'off', stream: null, error });
      return;
    }
    // Without a usable microphone, join listen-only.
    const cam = !!stream?.getVideoTracks().length;
    stream?.getAudioTracks().forEach((t) => (t.enabled = this.state.mic));
    this.set({ status: 'on', stream, cam, mic: stream ? this.state.mic : false, error });
    this.savePrefs({ on: true });
  }

  stop(remember = true): void {
    this.generation++;
    this.state.stream?.getTracks().forEach((t) => t.stop());
    this.set({ status: 'off', stream: null, error: null });
    if (remember) this.savePrefs({ on: false });
  }

  setMic(on: boolean): void {
    this.state.stream?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.set({ mic: on });
  }

  /** Turning the camera on or off re-acquires the stream, so the camera light really goes off. */
  async setCam(on: boolean): Promise<void> {
    this.savePrefs({ cam: on });
    if (this.state.status === 'on') await this.restart();
  }

  async setDevice(kind: 'mic' | 'cam', deviceId: string): Promise<void> {
    this.savePrefs(kind === 'mic' ? { micId: deviceId || undefined } : { camId: deviceId || undefined });
    if (this.state.status === 'on') await this.restart();
  }

  destroy(): void {
    this.stop(false);
    this.events.clear();
  }

  private async restart(): Promise<void> {
    this.state.stream?.getTracks().forEach((t) => t.stop());
    await this.start();
  }

  private acquire(audio: boolean, video: boolean): Promise<MediaStream> {
    const { micId, camId } = this.prefs;
    return navigator.mediaDevices.getUserMedia({
      audio: audio ? (micId ? { deviceId: { exact: micId } } : true) : false,
      video: video ? { width: { ideal: 320 }, height: { ideal: 240 }, ...(camId ? { deviceId: { exact: camId } } : {}) } : false,
    });
  }

  private savePrefs(change: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...change };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // preferences are a convenience
    }
  }

  private set(change: Partial<LocalState>): void {
    this.state = { ...this.state, ...change };
    this.events.emit('state', this.state);
  }
}

/** Microphones and cameras, with labels once the player has granted access. */
export async function listDevices(): Promise<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[] }> {
  const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return { mics: all.filter((d) => d.kind === 'audioinput'), cams: all.filter((d) => d.kind === 'videoinput') };
}
