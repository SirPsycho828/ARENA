// All-in-one WebRTC test — generates fresh token per page load
// Usage: node test/webrtc-instant-test.js
// Then open: http://localhost:5555

const http = require('http');
const API_KEY = process.env.OMNIAGENT_API_KEY || 'REDACTED_API_KEY';
const BASE = 'https://companion-api.napster.com';

let cachedAgentId = null;
let cachedCompanionId = null;

async function ensureAgent() {
  if (cachedAgentId) return cachedAgentId;

  // Get a stock companion
  console.log('Fetching stock companions...');
  const compRes = await fetch(`${BASE}/public/companions/napster-stock?pageSize=1`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  const compData = await compRes.json();
  cachedCompanionId = compData.items[0].id;
  console.log('Using companion:', cachedCompanionId, '(' + (compData.items[0].firstName || '') + ')');

  // Create a reusable agent
  console.log('Creating agent...');
  const agentRes = await fetch(`${BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId: cachedCompanionId,
      name: 'ARENA WebRTC Test',
      voiceId: 'alloy',
      providerSettings: { temperature: 0.7 },
    }),
  });
  const agent = await agentRes.json();
  cachedAgentId = agent.id;
  console.log('Agent:', cachedAgentId);
  return cachedAgentId;
}

async function createToken() {
  const agentId = await ensureAgent();
  console.log('Creating WebRTC connection...');
  const res = await fetch(`${BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'webrtc',
      externalClientId: 'arenatest' + Date.now().toString(36),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const connId = data.connection?.id || 'unknown';
  console.log('Connection:', connId, '| Token:', data.token?.length, 'chars');
  return { token: data.token, connId };
}

const HTML = (token, connId) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WebRTC Instant Test</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.css" />
  <style>
    body { font-family: system-ui; background: #111; color: #eee; padding: 20px; }
    h1 { color: #00f0ff; }
    #avatar-container { width: 480px; height: 360px; background: #1a1a2e; border: 2px solid #00f0ff; border-radius: 8px; overflow: hidden; margin: 20px 0; }
    #status { padding: 10px; background: #1a1a1a; border-radius: 4px; font-family: monospace; font-size: 13px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; color: #ccc; }
    .ok { color: #00ff88; }
    .err { color: #ff4466; }
    .evt { color: #ffdd57; }
  </style>
</head>
<body>
  <h1>WebRTC Instant Test</h1>
  <p>Connection: <code>${connId}</code> | Token embedded at page load — auto-connecting NOW.</p>
  <div id="avatar-container"></div>
  <div id="status"></div>

  <script src="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.standalone.js"></script>
  <script>
    const token = ${JSON.stringify(token)};
    const el = document.getElementById('status');
    function log(msg, cls) {
      const t = new Date().toLocaleTimeString();
      el.innerHTML += '<span class="' + (cls||'') + '">[' + t + '] ' + msg + '</span>\\n';
      el.scrollTop = el.scrollHeight;
      console.log('[' + t + ']', msg);
    }

    (async function() {
      log('Page loaded, token length: ' + token.length);
      log('Connecting IMMEDIATELY (no delay)...');
      const t0 = Date.now();

      try {
        const sdk = window.napsterCompanionApiSDK;
        if (!sdk) { log('SDK not found on window!', 'err'); return; }

        const instance = await sdk.init(token, {
          mountContainer: '#avatar-container',
          position: 'center',
          onData: (data) => {
            log('EVENT: ' + JSON.stringify(data).slice(0, 400), 'evt');
          },
        });

        const elapsed = Date.now() - t0;
        log('SDK init returned in ' + elapsed + 'ms', 'ok');
        log('Session ID: ' + (instance.sessionId || 'N/A'));

        if (instance.showAvatar) {
          instance.showAvatar();
          log('showAvatar() called', 'ok');
        }

        // Monitor for 10 seconds
        let checks = 0;
        const interval = setInterval(() => {
          checks++;
          const visible = instance.avatarIsVisible ? instance.avatarIsVisible() : 'unknown';
          const speaking = instance.isAvatarSpeaking ? instance.isAvatarSpeaking() : 'unknown';
          log('Check ' + checks + ': visible=' + visible + ', speaking=' + speaking);

          const container = document.getElementById('avatar-container');
          const video = container.querySelector('video');
          const canvas = container.querySelector('canvas');
          const iframe = container.querySelector('iframe');
          if (video) log('FOUND <video> element! src=' + (video.src || video.srcObject), 'ok');
          if (canvas) log('FOUND <canvas> element!', 'ok');
          if (iframe) log('FOUND <iframe> element!', 'ok');

          if (checks >= 5) clearInterval(interval);
        }, 2000);

      } catch (err) {
        log('INIT ERROR: ' + err.message, 'err');
        log('Stack: ' + err.stack, 'err');
        console.error(err);
      }
    })();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const { token, connId } = await createToken();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML(token, connId));
    } catch (err) {
      console.error('Token error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: ' + err.message);
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(5555, () => {
  console.log('\nWebRTC instant test: http://localhost:5555');
  console.log('Each page load = fresh token, auto-connect, zero delay.\n');
});
