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
  const retriedRef = useRef(false);
  const token = useArenaStore((s) => s.avatarTokens[agentId]);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const isSpeaking = currentSpeaker === agentId;
  const hasAvatar = !!token && !avatarFailed;

  // Listen for iframe messages (frame-ready, avatar-ready, avatar-error)
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.source !== iframeRef.current?.contentWindow) return;

    if (e.data?.type === 'frame-ready' && token) {
      // Always respond to frame-ready — it's the reliable signal that the iframe
      // script has loaded. The 500ms timer in the token-change effect may have
      // already set initedRef but sent the message to about:blank (iframe not
      // loaded yet), so we must re-send here unconditionally.
      initedRef.current = true;
      iframeRef.current?.contentWindow?.postMessage({
        type: 'init-avatar',
        token,
        agentId,
      }, '*');
    }

    if (e.data?.type === 'avatar-ready' && e.data.agentId === agentId) {
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

  // Reset state when token changes — also re-send init-avatar since iframe won't re-fire frame-ready
  useEffect(() => {
    initedRef.current = false;
    setAvatarReady(false);
    setAvatarFailed(false);
    // If iframe is already loaded and we got a new token, send init-avatar directly
    if (token && iframeRef.current?.contentWindow) {
      const timer = setTimeout(() => {
        if (!initedRef.current && token && iframeRef.current?.contentWindow) {
          initedRef.current = true;
          iframeRef.current.contentWindow.postMessage({
            type: 'init-avatar',
            token,
            agentId,
          }, '*');
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [token, agentId]);

  // Timeout: if avatar not ready in 20s, fall back to static image
  useEffect(() => {
    if (!token || avatarReady || avatarFailed) return;
    const timer = setTimeout(() => {
      if (!avatarReady) {
        console.warn(`[Avatar] ${agentName} timed out — falling back to static image`);
        setAvatarFailed(true);
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [token, avatarReady, avatarFailed, agentName]);

  // Lip-sync: triggered when first audio chunk plays (via lipSyncSpeaker).
  // Short prompt = faster avatar API response = less lip-sync delay.
  // Avatar audio is muted — we only care about lip movement, not what it says.
  const topic = useArenaStore((s) => s.session?.topic);
  const isLipSyncing = useArenaStore((s) => s.lipSyncSpeaker === agentId);
  const wasLipSyncingRef = useRef(false);
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !avatarReady) return;

    if (isLipSyncing && !wasLipSyncingRef.current) {
      win.postMessage({
        type: 'send-message',
        agentId,
        text: `Argue about "${topic || 'this'}".`,
        role: 'user',
        triggerResponse: true,
      }, '*');
    } else if (!isLipSyncing && wasLipSyncingRef.current) {
      win.postMessage({ type: 'stop-speaking', agentId }, '*');
    }
    wasLipSyncingRef.current = isLipSyncing;
  }, [isLipSyncing, agentId, topic, avatarReady]);

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
