import lobbyMap from '../../content/lobby/map.json';

// All playable maps by key: 'lobby' plus one per folder in content/rooms/.
// A room folder's name is its roomId; doors refer to it via `doorTo`.
const roomMaps = import.meta.glob<unknown>('../../content/rooms/*/map.json', { eager: true, import: 'default' });

export const LOBBY = 'lobby';

export const MAPS: Record<string, unknown> = {
  [LOBBY]: lobbyMap,
  ...Object.fromEntries(Object.entries(roomMaps).map(([path, map]) => [path.split('/').at(-2)!, map])),
};

export const ROOM_IDS = Object.keys(MAPS).filter((k) => k !== LOBBY);
