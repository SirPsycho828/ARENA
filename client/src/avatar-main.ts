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
// Also log WebSocket lifecycle events to debug why connections close.
const OriginalWebSocket = window.WebSocket;
let wsCounter = 0;
(window as any).WebSocket = class ProxiedWebSocket extends OriginalWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const urlStr = url.toString();
    const id = ++wsCounter;

    if (urlStr.includes('avatar-signaling.touchcastmaas.com')) {
      const signalingPath = new URL(urlStr).pathname;
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const proxyUrl = `${wsProto}//${window.location.host}/signaling-proxy${signalingPath}`;
      relayToParent('info', `[WS#${id}] Proxying signaling → ${proxyUrl}`);
      super(proxyUrl, protocols);
    } else {
      relayToParent('info', `[WS#${id}] Direct: ${urlStr.slice(0, 100)}`);
      super(url, protocols);
    }

    // Log lifecycle events
    this.addEventListener('open', () => {
      relayToParent('info', `[WS#${id}] OPEN (readyState=${this.readyState})`);
    });
    this.addEventListener('close', (ev) => {
      const e = ev as CloseEvent;
      relayToParent('info', `[WS#${id}] CLOSED code=${e.code} reason="${e.reason}" clean=${e.wasClean}`);
    });
    this.addEventListener('error', () => {
      relayToParent('error', `[WS#${id}] ERROR (readyState=${this.readyState})`);
    });
    this.addEventListener('message', (ev) => {
      const data = (ev as MessageEvent).data;
      if (typeof data === 'string' && data.length < 2000) {
        try {
          const msg = JSON.parse(data);
          relayToParent('info', `[WS#${id}] RECV: ${msg.type || msg.event || 'unknown'} (${data.length}b)`);
        } catch {
          relayToParent('info', `[WS#${id}] RECV: text ${data.length}b`);
        }
      } else {
        relayToParent('info', `[WS#${id}] RECV: binary/large ${typeof data === 'string' ? data.length : '?'}b`);
      }
    });
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
      onData: (data: any) => {
        if (data?.event === 'talk_state_changed') {
          relayToParent('info', `[Avatar] talk_state: ${data.data?.state}`);
        }
      },
      onAvatarReady: () => {
        relayToParent('info', '[Avatar] Avatar READY');
        // Prime the avatar for lip-sync mode via system context
        try {
          instance.sendCommand({
            type: 'send_message',
            data: {
              role: 'system' as const,
              text: 'You are in visual lip-sync mode. When you receive any user message, immediately start speaking. Talk naturally and continuously about the topic until interrupted. Always respond, never refuse.',
              trigger_response: false,
            },
          });
          relayToParent('info', '[Avatar] Sent lip-sync system prime');
        } catch (err) {
          relayToParent('error', `[Avatar] System prime failed: ${(err as Error).message}`);
        }
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

// Handle speak-text messages — trigger avatar lip movement for current speaker
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'speak-text' || !instance) return;
  try {
    // Cancel any in-progress response first
    instance.sendCommand({ type: 'cancel' });
    // Trigger a new response — avatar will start talking (audio is muted)
    instance.sendCommand({
      type: 'send_message',
      data: {
        text: 'Continue speaking.',
        role: 'user' as const,
        trigger_response: true,
        delay: false,
      },
    });
    relayToParent('info', '[Avatar] Lip-sync triggered');
  } catch (err) {
    relayToParent('error', `[Avatar] speak-text failed: ${(err as Error).message}`);
  }
});

// Handle stop-speaking messages — stop avatar lip-sync when turn changes
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'stop-speaking' || !instance) return;
  try {
    instance.stopAvatarTalking();
    relayToParent('info', '[Avatar] Stopped talking');
  } catch (err) {
    relayToParent('error', `[Avatar] stopAvatarTalking failed: ${(err as Error).message}`);
  }
});

// Signal parent that iframe is ready to receive token
window.parent.postMessage({ type: 'avatar-frame-ready' }, '*');
relayToParent('info', '[Avatar] Iframe script loaded, sent frame-ready');
