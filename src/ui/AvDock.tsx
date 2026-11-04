import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listDevices, LocalMedia } from '../av/localMedia';
import type { Media, RemoteMedia } from '../net/media';
import type { Presence } from '../net/presence';
import { useEmitterValue } from './useStore';

interface Props {
  media: Media;
  presence: Presence;
  /** 'proximity' in the lobby (people near you), 'team' in a room. */
  scope: 'proximity' | 'team';
}

/** Voice/video controls and tiles, bottom right. Owns the local microphone and camera for one place. */
export function AvDock({ media, presence, scope }: Props) {
  const [local, setLocal] = useState<LocalMedia | null>(null);

  useEffect(() => {
    const l = new LocalMedia();
    // The local devices only exist while this place is shown.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(l);
    // Players who had A/V on keep it on when walking between the lobby and a room.
    if (l.wantsOn()) void l.start();
    return () => l.destroy();
  }, []);

  if (!local) return null;
  return <AvDockInner local={local} media={media} presence={presence} scope={scope} />;
}

function AvDockInner({ local, media, presence, scope }: Props & { local: LocalMedia }) {
  const { t } = useTranslation();
  const state = useEmitterValue(local.events, 'state', () => local.get());
  const remotes = useEmitterValue(media.events, 'remotes', () => media.list());
  const [showDevices, setShowDevices] = useState(false);

  useEffect(() => {
    media.setLocal(state.status === 'on' ? { stream: state.stream, mic: state.mic, cam: state.cam } : null);
  }, [media, state]);
  useEffect(() => () => media.setLocal(null), [media]);

  const nameOf = (r: RemoteMedia) => presence.get(r.peerId)?.nickname ?? '?';

  return (
    <section className="av-dock" aria-label={t('av.title')}>
      {state.status === 'on' && (
        <div className="av-tiles">
          {state.cam && state.stream && <Tile stream={state.stream} video name={t('av.you')} micOff={!state.mic} />}
          {remotes.map((r) => (
            <Tile key={r.peerId} stream={r.stream} video={r.cam} name={nameOf(r)} micOff={!r.mic} failed={r.failed} />
          ))}
        </div>
      )}
      {remotes
        .filter((r) => r.failed)
        .map((r) => (
          <p key={r.peerId} className="overlay av-note" role="status">
            {t('av.failed', { name: nameOf(r) })}
          </p>
        ))}
      {state.error && (
        <p className="overlay av-note" role="alert">
          {t(`av.errors.${state.error}`)}
        </p>
      )}

      <div className="overlay av-controls">
        {state.status === 'off' && (
          <>
            <button type="button" className="primary" onClick={() => void local.start()}>
              {t('av.join')}
            </button>
            <small className="muted">{t(scope === 'team' ? 'av.joinHintRoom' : 'av.joinHintLobby')}</small>
          </>
        )}
        {state.status === 'starting' && <span className="muted">{t('av.starting')}</span>}
        {state.status === 'on' && (
          <>
            <button type="button" aria-pressed={!state.mic} disabled={!state.stream} onClick={() => local.setMic(!state.mic)}>
              {state.mic ? `🎙 ${t('av.mute')}` : `🔇 ${t('av.unmute')}`}
            </button>
            <button type="button" aria-pressed={state.cam} onClick={() => void local.setCam(!state.cam)}>
              {state.cam ? `📷 ${t('av.camOff')}` : `📷 ${t('av.camOn')}`}
            </button>
            <button type="button" aria-expanded={showDevices} onClick={() => setShowDevices(!showDevices)}>
              ⚙ <span className="sr-only">{t('av.devices')}</span>
            </button>
            <button type="button" onClick={() => local.stop()}>
              {t('av.leave')}
            </button>
            {state.status === 'on' && remotes.length === 0 && <small className="muted">{t(scope === 'team' ? 'av.aloneRoom' : 'av.aloneLobby')}</small>}
          </>
        )}
        {showDevices && state.status === 'on' && <DevicePicker local={local} />}
      </div>

      {/* Sound plays through hidden audio elements, also when a video tile shows the same stream muted. */}
      {state.status === 'on' && remotes.map((r) => r.stream && <AudioOut key={r.peerId} stream={r.stream} />)}
    </section>
  );
}

/** One person's picture (or initial). Always muted: sound comes from AudioOut. */
function Tile({ stream, video, name, micOff, failed = false }: { stream: MediaStream | null; video: boolean; name: string; micOff: boolean; failed?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className={failed ? 'av-tile failed' : 'av-tile'}>
      {video && stream ? <video ref={ref} autoPlay playsInline muted /> : <span className="av-initial" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
      <figcaption>
        {micOff && <span aria-label={t('av.muted')}>🔇 </span>}
        {name}
      </figcaption>
    </figure>
  );
}

function AudioOut({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function DevicePicker({ local }: { local: LocalMedia }) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[] } | null>(null);
  const chosen = local.devices();
  useEffect(() => {
    let cancelled = false;
    void listDevices().then((d) => !cancelled && setDevices(d));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!devices) return null;
  const select = (kind: 'mic' | 'cam', list: MediaDeviceInfo[], value: string | undefined, label: string) => (
    <label className="av-device">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => void local.setDevice(kind, e.target.value)}>
        <option value="">{t('av.defaultDevice')}</option>
        {list.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="av-devices">
      {select('mic', devices.mics, chosen.micId, t('av.microphone'))}
      {select('cam', devices.cams, chosen.camId, t('av.camera'))}
    </div>
  );
}
