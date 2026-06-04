import { AccessToken } from 'livekit-server-sdk';

const API_KEY = () => process.env.LIVEKIT_API_KEY || '';
const API_SECRET = () => process.env.LIVEKIT_API_SECRET || '';

export function getLiveKitUrl(): string {
  return process.env.LIVEKIT_URL || '';
}

export function isLiveKitConfigured(): boolean {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export async function createPublisherToken(roomName: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: 'arena-host',
    ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: false });
  return await at.toJwt();
}

export async function createViewerToken(roomName: string, viewerId: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: `viewer-${viewerId}`,
    ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: false, canSubscribe: true });
  return await at.toJwt();
}
