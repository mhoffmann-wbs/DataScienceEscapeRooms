import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalMedia } from './localMedia';

const track = (kind: 'audio' | 'video') => ({ kind, enabled: true, stop: vi.fn() });
const stream = (video: boolean) => {
  const audio = [track('audio')];
  const videos = video ? [track('video')] : [];
  return { getTracks: () => [...audio, ...videos], getAudioTracks: () => audio, getVideoTracks: () => videos } as unknown as MediaStream;
};
const fail = (name: string) => Promise.reject(new DOMException('nope', name));

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});
afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('LocalMedia', () => {
  it('joins with the microphone and remembers to rejoin', async () => {
    getUserMedia.mockResolvedValue(stream(false));
    const local = new LocalMedia();
    await local.start();
    expect(local.get()).toMatchObject({ status: 'on', mic: true, cam: false, error: null });
    expect(new LocalMedia().wantsOn()).toBe(true);
    local.stop();
    expect(new LocalMedia().wantsOn()).toBe(false);
  });

  it('stays off with a clear error when access is denied', async () => {
    getUserMedia.mockImplementation(() => fail('NotAllowedError'));
    const local = new LocalMedia();
    await local.start();
    expect(local.get()).toMatchObject({ status: 'off', stream: null, error: 'denied' });
  });

  it('joins listen-only when there is no microphone', async () => {
    getUserMedia.mockImplementation(() => fail('NotFoundError'));
    const local = new LocalMedia();
    await local.start();
    expect(local.get()).toMatchObject({ status: 'on', stream: null, mic: false, error: 'noMic' });
  });

  it('falls back to voice only when the camera is missing', async () => {
    getUserMedia.mockImplementation((c: MediaStreamConstraints) => (c.video ? fail('NotFoundError') : Promise.resolve(stream(false))));
    const local = new LocalMedia();
    await local.start();
    await local.setCam(true);
    expect(local.get()).toMatchObject({ status: 'on', cam: false, error: 'noCam' });
    expect(local.get().stream).not.toBeNull();
  });

  it('muting disables the audio track without renegotiating', async () => {
    const s = stream(false);
    getUserMedia.mockResolvedValue(s);
    const local = new LocalMedia();
    await local.start();
    local.setMic(false);
    expect(s.getAudioTracks()[0]!.enabled).toBe(false);
    expect(local.get().stream).toBe(s);
  });

  it('explains when the browser has no media support (e.g. not https)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const local = new LocalMedia();
    await local.start();
    expect(local.get()).toMatchObject({ status: 'off', error: 'unsupported' });
  });
});
