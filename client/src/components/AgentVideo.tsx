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
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const transcripts = useArenaStore((s) => s.transcripts);
  const [avatarReady, setAvatarReady] = useState(false);
  const tokenSentRef = useRef(false);
  const iframeReadyRef = useRef(false);
  const lastSentTextRef = useRef('');

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === 'avatar-frame-ready') {
        iframeReadyRef.current = true;
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

  // Forward debate text to the avatar for lip-sync when this agent finishes speaking
  useEffect(() => {
    if (!avatarReady || !iframeRef.current?.contentWindow) return;

    // Find the most recent transcript from this agent
    const lastFromAgent = [...transcripts].reverse().find((t) => t.agentId === agentId);
    if (!lastFromAgent || lastFromAgent.text === lastSentTextRef.current) return;

    // Only send when this agent just finished speaking (it's no longer the current speaker,
    // or a new transcript appeared)
    lastSentTextRef.current = lastFromAgent.text;
    iframeRef.current.contentWindow.postMessage(
      { type: 'speak-text', text: lastFromAgent.text },
      '*'
    );
    console.log(`[Avatar:${agentName}] Forwarding debate text for lip-sync (${lastFromAgent.text.length} chars)`);
  }, [transcripts, avatarReady, agentId]);

  const isSpeaking = currentSpeaker === agentId;

  return (
    <div className={`w-full h-full relative ${isSpeaking ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
      style={isSpeaking ? { ringColor: color } : undefined}>
      {token && (
        <iframe
          ref={iframeRef}
          src="/avatar.html"
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; camera; microphone"
          style={{ background: 'transparent', zIndex: avatarReady ? 1 : 0 }}
        />
      )}
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
