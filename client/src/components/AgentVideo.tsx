import { useEffect, useRef, useCallback } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initedRef = useRef(false);
  const token = useArenaStore((s) => s.avatarTokens[agentId]);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const isSpeaking = currentSpeaker === agentId;
  const hasAvatar = !!token;

  // Listen for iframe messages (frame-ready, avatar-ready)
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.source !== iframeRef.current?.contentWindow) return;

    if (e.data?.type === 'frame-ready' && token && !initedRef.current) {
      initedRef.current = true;
      iframeRef.current?.contentWindow?.postMessage({
        type: 'init-avatar',
        token,
        agentId,
      }, '*');
    }

    if (e.data?.type === 'avatar-ready' && e.data.agentId === agentId) {
      console.log(`[Avatar] ${agentName} ready in viewer iframe`);
    }

    if (e.data?.type === 'avatar-error' && e.data.agentId === agentId) {
      console.error(`[Avatar] ${agentName} error:`, e.data.error);
    }
  }, [token, agentId, agentName]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Reset init flag when token changes
  useEffect(() => {
    initedRef.current = false;
  }, [token]);


  return (
    <div className={`w-full h-full relative ${isSpeaking ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
      style={isSpeaking ? { ringColor: color } : undefined}>
      {hasAvatar ? (
        <iframe
          ref={iframeRef}
          src="/avatar-host/avatar-frame.html?viewer=1"
          allow="autoplay; camera; microphone"
          className="absolute inset-0 w-full h-full border-none"
          style={{ background: 'transparent' }}
        />
      ) : (
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
