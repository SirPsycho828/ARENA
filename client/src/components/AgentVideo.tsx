import { useEffect, useRef, useState } from 'react';
import { useArenaStore } from '../store/arena';

// Lazy-import the SDK to avoid bundling issues
let sdkPromise: Promise<typeof import('@touchcastllc/napster-companion-api')> | null = null;
function getSDK() {
  if (!sdkPromise) {
    sdkPromise = import('@touchcastllc/napster-companion-api');
  }
  return sdkPromise;
}

// Track the single SDK instance globally (SDK is a singleton)
let activeInstance: any = null;
let activeAgentId: string | null = null;

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const token = useArenaStore((s) => s.videoTokens[agentId]);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const [avatarReady, setAvatarReady] = useState(false);
  const isSpeaker = currentSpeaker === agentId;

  useEffect(() => {
    // Only init SDK for the current speaker who has a token
    if (!isSpeaker || !token || !containerRef.current) {
      // If we WERE the active agent and lost speaker status, destroy
      if (activeAgentId === agentId && activeInstance) {
        activeInstance.destroy();
        activeInstance = null;
        activeAgentId = null;
        setAvatarReady(false);
      }
      return;
    }

    // Already initialized for this agent
    if (activeAgentId === agentId) return;

    let destroyed = false;

    const initSDK = async () => {
      try {
        // Destroy previous instance if any
        if (activeInstance) {
          activeInstance.destroy();
          activeInstance = null;
          activeAgentId = null;
        }

        const { NapsterCompanionApiSdk } = await getSDK();

        if (destroyed) return;

        const instance = await NapsterCompanionApiSdk.init(token, {
          mountContainer: containerRef.current!,
          avatarStyle: { view: 'rectangle' },
          features: {
            controls: { enabled: false },
            backgroundRemoval: { enabled: true },
            disclaimer: { enabled: false },
            showSDKLoader: { enabled: false },
            inactiveTimeout: { enabled: false },
            pictureInPicture: { enabled: false },
          },
          style: {
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: '0',
            left: '0',
          },
          onAvatarReady: () => {
            if (!destroyed) setAvatarReady(true);
          },
          onError: (err) => {
            console.warn(`[AgentVideo] SDK error for ${agentName}:`, err.message);
          },
        });

        if (destroyed) {
          instance.destroy();
          return;
        }

        activeInstance = instance;
        activeAgentId = agentId;

        // Mute SDK audio — debate audio comes from WebSocket
        instance.muteAudio();
        instance.muteMic();
        instance.showAvatar();
      } catch (err) {
        console.warn(`[AgentVideo] SDK init failed for ${agentName}:`, (err as Error).message);
      }
    };

    initSDK();

    return () => {
      destroyed = true;
      // Don't destroy here — the SDK might be reused by the next speaker's init
    };
  }, [isSpeaker, token, agentId, agentName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeAgentId === agentId && activeInstance) {
        activeInstance.destroy();
        activeInstance = null;
        activeAgentId = null;
      }
    };
  }, [agentId]);

  return (
    <div className="w-full h-full relative" ref={containerRef}>
      {/* Placeholder shown when SDK avatar isn't ready */}
      {!avatarReady && (
        <div className="w-full h-full flex items-center justify-center absolute inset-0 z-0">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
            style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
          >
            {agentName.split(' ').pop()?.[0] || agentName[0]}
          </div>
        </div>
      )}
    </div>
  );
}
