// ─── Signaling Proxy ──────────────────────────────────────────────────────────
// The Napster signaling server rejects browser WebSocket connections (400).
// Intercept the SDK's WebSocket creation and route through our server proxy.
const OriginalWebSocket = window.WebSocket;
(window as any).WebSocket = class ProxiedWebSocket extends OriginalWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const urlStr = url.toString();
    if (urlStr.includes('avatar-signaling.touchcastmaas.com')) {
      // Rewrite: wss://avatar-signaling.touchcastmaas.com/ws/connections/{id}/signaling
      //       → wss://{our-host}/signaling-proxy/ws/connections/{id}/signaling
      const signalingPath = new URL(urlStr).pathname;
      const proxyUrl = `wss://${window.location.host}/signaling-proxy${signalingPath}`;
      console.log('[Avatar] Proxying signaling:', proxyUrl);
      super(proxyUrl, protocols);
    } else {
      super(url, protocols);
    }
  }
};

// ─── SDK Initialization ──────────────────────────────────────────────────────
import '@touchcastllc/napster-companion-api/styles';

let instance: any = null;

window.addEventListener('message', async (e) => {
  if (e.data?.type !== 'init-avatar' || !e.data.token) return;
  if (instance) return;

  try {
    const { NapsterCompanionApiSdk } = await import('@touchcastllc/napster-companion-api');

    instance = await NapsterCompanionApiSdk.init(e.data.token, {
      mountContainer: document.getElementById('container')!,
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
        window.parent.postMessage({ type: 'avatar-ready' }, '*');
      },
      onError: (err: any) => {
        console.warn('[Avatar iframe] SDK error:', err.message);
      },
    });

    instance.muteAudio();
    instance.muteMic();
    instance.showAvatar();
  } catch (err) {
    console.warn('[Avatar iframe] SDK init failed:', (err as Error).message);
  }
});

// Signal parent that iframe is ready to receive token
window.parent.postMessage({ type: 'avatar-frame-ready' }, '*');
