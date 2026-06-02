import { useEffect, useRef, useState } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const token = useArenaStore((s) => s.videoTokens[agentId]);
  const [avatarReady, setAvatarReady] = useState(false);
  const tokenSentRef = useRef(false);
  const iframeReadyRef = useRef(false);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Only handle messages from our iframe
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === 'avatar-frame-ready') {
        iframeReadyRef.current = true;
        // Send token if we already have it
        if (token && !tokenSentRef.current) {
          tokenSentRef.current = true;
          iframeRef.current?.contentWindow?.postMessage(
            { type: 'init-avatar', token },
            '*'
          );
        }
      }

      if (e.data?.type === 'avatar-ready') {
        setAvatarReady(true);
      }

      if (e.data?.type === 'avatar-debug') {
        const prefix = `[Avatar:${agentName}]`;
        if (e.data.level === 'error') {
          console.error(prefix, e.data.message);
        } else {
          console.log(prefix, e.data.message);
        }
      }

      if (e.data?.type === 'avatar-error') {
        console.error(`[Avatar:${agentName}] Error:`, e.data.error);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [token]);

  // Send token when it arrives (if iframe is already ready)
  useEffect(() => {
    if (token && iframeReadyRef.current && !tokenSentRef.current) {
      tokenSentRef.current = true;
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'init-avatar', token },
        '*'
      );
    }
  }, [token]);

  return (
    <div className="w-full h-full relative">
      {token && (
        <iframe
          ref={iframeRef}
          src="/avatar.html"
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; camera; microphone"
          style={{ background: 'transparent', zIndex: avatarReady ? 1 : 0 }}
        />
      )}
      {/* Placeholder shown until SDK avatar loads */}
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
