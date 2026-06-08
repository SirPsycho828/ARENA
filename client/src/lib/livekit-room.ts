import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';

export type TrackMap = Record<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>;

let room: Room | null = null;
let onTracksChanged: ((tracks: TrackMap) => void) | null = null;
const trackMap: TrackMap = {};

function parseTrackName(name: string): { agentId: string; kind: 'video' | 'audio' } | null {
  const parts = name.split('_');
  if (parts.length < 2) return null;
  const kind = parts[parts.length - 1];
  const agentId = parts.slice(0, -1).join('_');
  if (kind !== 'video' && kind !== 'audio') return null;
  return { agentId, kind };
}

function updateTrack(track: RemoteTrack, publication: RemoteTrackPublication, subscribed: boolean) {
  const parsed = parseTrackName(publication.trackName);
  if (!parsed) {
    console.warn(`[LiveKit] Could not parse track name: "${publication.trackName}"`);
    return;
  }

  if (!trackMap[parsed.agentId]) trackMap[parsed.agentId] = {};

  if (subscribed) {
    trackMap[parsed.agentId][parsed.kind] = track.mediaStreamTrack;
  } else {
    delete trackMap[parsed.agentId][parsed.kind];
  }

  onTracksChanged?.({ ...trackMap });
}

export async function connectLiveKit(url: string, token: string, onChange: (tracks: TrackMap) => void): Promise<void> {
  // Skip reconnection if already connected with tracks — prevents
  // duplicate livekit_token events from causing disruptive cycling
  if (room?.state === 'connected' && Object.keys(trackMap).length > 0) {
    onTracksChanged = onChange;
    return;
  }
  if (room) {
    await room.disconnect();
  }

  onTracksChanged = onChange;
  room = new Room();

  room.on(RoomEvent.TrackSubscribed, (track, publication) => {
    updateTrack(track, publication, true);
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
    updateTrack(track, publication, false);
  });

  await room.connect(url, token);
}

export function disconnectLiveKit() {
  if (room) {
    room.disconnect();
    room = null;
  }
  onTracksChanged = null;
  for (const key of Object.keys(trackMap)) delete trackMap[key];
}
