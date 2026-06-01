import { useEffect, useRef } from 'react';

interface AgentVideoProps {
  token: string | null;
  agentName: string;
  color: string;
}

export function AgentVideo({ token, agentName, color }: AgentVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!token || !containerRef.current) return;

    let mounted = true;

    const initSDK = async () => {
      try {
        const { NapsterCompanionApiSdk } = await import(
          '@touchcastllc/napster-companion-api'
        );
        if (!mounted || !containerRef.current) return;
        instanceRef.current = await NapsterCompanionApiSdk.init(token, {
          mountContainer: containerRef.current,
        });
      } catch (err) {
        console.warn(`Video init failed for ${agentName}:`, err);
      }
    };

    initSDK();

    return () => {
      mounted = false;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [token, agentName]);

  // No token (mock mode) — show avatar placeholder
  if (!token) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold"
          style={{ backgroundColor: color + '20', color, border: `2px solid ${color}40` }}
        >
          {agentName.split(' ').pop()?.[0] || agentName[0]}
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
