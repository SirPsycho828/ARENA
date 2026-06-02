// ─── Debug Relay ──────────────────────────────────────────────────────────────
// Relay console messages to parent so we can debug iframe issues
function relayToParent(level: string, ...args: any[]) {
  try {
    window.parent.postMessage({
      type: 'avatar-debug',
      level,
      message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '),
    }, '*');
  } catch { /* ignore */ }
}

// ─── Signaling Proxy ──────────────────────────────────────────────────────────
// The Napster signaling server rejects browser WebSocket connections (400).
// Intercept the SDK's WebSocket creation and route through our server proxy.
const OriginalWebSocket = window.WebSocket;
(window as any).WebSocket = class ProxiedWebSocket extends OriginalWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const urlStr = url.toString();
    if (urlStr.includes('avatar-signaling.touchcastmaas.com')) {
      // Rewrite: wss://avatar-signaling.touchcastmaas.com/ws/connections/{id}/signaling
      //       → ws(s)://{our-host}/signaling-proxy/ws/connections/{id}/signaling
      const signalingPath = new URL(urlStr).pathname;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const proxyUrl = `${wsProto}//${window.location.host}/signaling-proxy${signalingPath}`;
      relayToParent('info', '[Avatar] Proxying signaling:', proxyUrl);
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

  relayToParent('info', '[Avatar] Received token, initializing SDK...');

  try {
    const { NapsterCompanionApiSdk } = await import('@touchcastllc/napster-companion-api');
    relayToParent('info', '[Avatar] SDK module loaded, calling init...');

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
        relayToParent('info', '[Avatar] Avatar READY');
        window.parent.postMessage({ type: 'avatar-ready' }, '*');
      },
      onError: (err: any) => {
        relayToParent('error', '[Avatar] SDK error:', err?.message || err);
        window.parent.postMessage({ type: 'avatar-error', error: err?.message || String(err) }, '*');
      },
    });

    relayToParent('info', '[Avatar] SDK init returned, calling muteAudio/muteMic/showAvatar');
    instance.muteAudio();
    instance.muteMic();
    instance.showAvatar();
  } catch (err) {
    relayToParent('error', '[Avatar] SDK init FAILED:', (err as Error).message);
    window.parent.postMessage({ type: 'avatar-error', error: (err as Error).message }, '*');
  }
});

// Signal parent that iframe is ready to receive token
window.parent.postMessage({ type: 'avatar-frame-ready' }, '*');
relayToParent('info', '[Avatar] Iframe script loaded, sent frame-ready');
