import { useEffect, useRef } from 'react';
import { useArenaStore } from '../store/arena';

interface AgentVideoProps {
  agentId: string;
  agentName: string;
  color: string;
}

export function AgentVideo({ agentId, agentName, color }: AgentVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = useArenaStore((s) => s.livekitTracks[agentId]?.video);
  const audioTrack = useArenaStore((s) => s.livekitTracks[agentId]?.audio);
  const currentSpeaker = useArenaStore((s) => s.currentSpeaker);
  const soundMuted = useArenaStore((s) => s.soundMuted);
  const isSpeaking = currentSpeaker === agentId;
  const hasVideo = !!videoTrack;

  // Attach video track
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    el.srcObject = new MediaStream([videoTrack]);
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [videoTrack]);

  // Attach audio track (only for current speaker)
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioTrack) return;
    el.srcObject = new MediaStream([audioTrack]);
    el.muted = !isSpeaking || soundMuted;
    if (isSpeaking && !soundMuted) {
      el.play().catch(() => {});
    }
    return () => { el.srcObject = null; };
  }, [audioTrack, isSpeaking, soundMuted]);

  return (
    <div className={`w-full h-full relative ${isSpeaking ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
      style={isSpeaking ? { ringColor: color } : undefined}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: hasVideo ? 'block' : 'none' }}
      />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && (
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
