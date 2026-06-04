import { AccessToken } from 'livekit-server-sdk';

const API_KEY = () => process.env.LIVEKIT_API_KEY || '';
const API_SECRET = () => process.env.LIVEKIT_API_SECRET || '';

export function getLiveKitUrl(): string {
  return process.env.LIVEKIT_URL || '';
}

export function isLiveKitConfigured(): boolean {
  return !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
}

export function logLiveKitStatus(): void {
  const key = !!process.env.LIVEKIT_API_KEY;
  const secret = !!process.env.LIVEKIT_API_SECRET;
  const url = !!process.env.LIVEKIT_URL;
  if (key && secret && url) {
    console.log(`  LiveKit: configured (${process.env.LIVEKIT_URL})`);
  } else {
    const missing = [
      !key && 'LIVEKIT_API_KEY',
      !secret && 'LIVEKIT_API_SECRET',
      !url && 'LIVEKIT_URL',
    ].filter(Boolean);
    console.error(`  LiveKit: NOT configured — missing: ${missing.join(', ')}`);
  }
}

export async function createPublisherToken(roomName: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: 'arena-host',
    ttl: '2h',
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: false });
  return await at.toJwt();
}

/** Per-agent publisher token — each agent is a separate LiveKit participant. */
export async function createAgentPublisherToken(roomName: string, agentId: string): Promise<string> {
  const at = new AccessToken(API_KEY(), API_SECRET(), {
    identity: `host-${agentId}`,
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
