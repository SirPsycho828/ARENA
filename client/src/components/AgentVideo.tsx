import { useEffect, useRef, useCallback, useState } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initedRef = useRef(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const token = useArenaStore((s) => s.avatarTokens[agentId]);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const isSpeaking = currentSpeaker === agentId;
  const hasAvatar = !!token && !avatarFailed;

  // Listen for iframe messages (frame-ready, avatar-ready, avatar-error)
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
      console.log(`[Avatar] ${agentName} ready`);
      setAvatarReady(true);
    }

    if (e.data?.type === 'avatar-error' && e.data.agentId === agentId) {
      console.error(`[Avatar] ${agentName} error:`, e.data.error);
      setAvatarFailed(true);
    }
  }, [token, agentId, agentName]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Reset state when token changes
  useEffect(() => {
    initedRef.current = false;
    setAvatarReady(false);
    setAvatarFailed(false);
  }, [token]);

  // Timeout: if avatar not ready in 15s, fall back to static image
  useEffect(() => {
    if (!token || avatarReady || avatarFailed) return;
    const timer = setTimeout(() => {
      if (!avatarReady) {
        console.warn(`[Avatar] ${agentName} timed out — falling back to static image`);
        setAvatarFailed(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [token, avatarReady, avatarFailed, agentName]);

  // Lip-sync: when this agent becomes the speaker, trigger avatar talking
  const topic = useArenaStore((s) => s.topic);
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !avatarReady) return;

    if (isSpeaking && !wasSpeakingRef.current) {
      win.postMessage({
        type: 'send-message',
        agentId,
        text: `React passionately to the debate topic: "${topic || 'the current discussion'}". Keep your response to about 20 seconds.`,
        role: 'user',
        triggerResponse: true,
      }, '*');
    } else if (!isSpeaking && wasSpeakingRef.current) {
      win.postMessage({ type: 'stop-speaking', agentId }, '*');
    }
    wasSpeakingRef.current = isSpeaking;
  }, [isSpeaking, agentId, topic, avatarReady]);

  // Static image fallback component
  const staticFallback = (
    <div className="w-full h-full absolute inset-0 z-0 overflow-hidden">
      <img
        src={`/static/avatars/${agentName.replace(/[^a-zA-Z]/g, '')}.png`}
        alt={agentName}
        className="w-full h-full object-cover object-top"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
      <div className="hidden w-full h-full flex items-center justify-center absolute inset-0">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
        >
          {agentName.split(' ').pop()?.[0] || agentName[0]}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`w-full h-full relative ${isSpeaking ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
      style={isSpeaking ? { ringColor: color } : undefined}>
      {hasAvatar ? (
        <>
          <iframe
            ref={iframeRef}
            src="/avatar-host/avatar-frame.html?viewer=1"
            allow="autoplay; camera; microphone"
            className="absolute inset-0 w-full h-full border-none"
            style={{ background: 'transparent', zIndex: avatarReady ? 1 : 0 }}
          />
          {/* Show static image behind iframe until avatar is ready */}
          {!avatarReady && staticFallback}
        </>
      ) : (
        staticFallback
      )}
    </div>
  );
}
