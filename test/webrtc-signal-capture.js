// Captures the WebRTC signaling protocol by intercepting WebSocket messages
// Usage: node test/webrtc-signal-capture.js
// Then open: http://localhost:5556

const http = require('http');
const fs = require('fs');
const API_KEY = process.env.OMNIAGENT_API_KEY || 'REDACTED_API_KEY';
const BASE = 'https://companion-api.napster.com';

let cachedAgentId = null;

async function ensureAgent() {
  if (cachedAgentId) return cachedAgentId;
  const compRes = await fetch(`${BASE}/public/companions/napster-stock?pageSize=1`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  const compData = await compRes.json();
  const companionId = compData.items[0].id;
  console.log('Companion:', companionId);

  const agentRes = await fetch(`${BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId,
      name: 'Signal Capture Test',
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
  const res = await fetch(`${BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelType: 'webrtc', externalClientId: 'sigcap' + Date.now().toString(36) }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  console.log('Connection:', data.connection?.id);
  return { token: data.token, connId: data.connection?.id };
}

// Endpoint to receive captured signaling data from the browser
let capturedMessages = [];

const HTML = (token, connId) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Signal Capture</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.css" />
<style>
  body { font-family: monospace; background: #111; color: #eee; padding: 20px; font-size: 12px; }
  h1 { color: #00f0ff; font-family: system-ui; }
  #avatar-container { width: 320px; height: 240px; background: #1a1a2e; border: 2px solid #333; border-radius: 8px; overflow: hidden; margin: 10px 0; }
  #log { background: #0a0a0a; padding: 10px; border-radius: 4px; max-height: 600px; overflow-y: auto; white-space: pre-wrap; }
  .send { color: #ff6b6b; }
  .recv { color: #51cf66; }
  .info { color: #ffdd57; }
  .sdp { color: #74c0fc; }
</style>
</head><body>
<h1>WebRTC Signaling Protocol Capture</h1>
<p>Connection: ${connId}</p>
<div id="avatar-container"></div>
<div id="log"></div>

<script>
// Monkey-patch WebSocket to intercept ALL messages
const OrigWS = window.WebSocket;
const captured = [];

window.WebSocket = function(url, protocols) {
  const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
  const wsUrl = url;

  log('WS OPEN: ' + url, 'info');

  // Intercept sends
  const origSend = ws.send.bind(ws);
  ws.send = function(data) {
    const entry = { dir: 'SEND', url: wsUrl, time: Date.now(), data: null };
    if (typeof data === 'string') {
      entry.data = data;
      try {
        const parsed = JSON.parse(data);
        log('WS SEND: ' + formatMsg(parsed), 'send');
      } catch {
        log('WS SEND (raw): ' + data.slice(0, 500), 'send');
      }
    } else if (data instanceof ArrayBuffer || data instanceof Blob) {
      entry.data = '[binary ' + (data.byteLength || data.size) + ' bytes]';
      log('WS SEND: [binary ' + (data.byteLength || data.size) + ' bytes]', 'send');
    }
    captured.push(entry);
    sendToServer(entry);
    return origSend(data);
  };

  // Intercept receives
  ws.addEventListener('message', function(event) {
    const entry = { dir: 'RECV', url: wsUrl, time: Date.now(), data: null };
    if (typeof event.data === 'string') {
      entry.data = event.data;
      try {
        const parsed = JSON.parse(event.data);
        log('WS RECV: ' + formatMsg(parsed), 'recv');
      } catch {
        log('WS RECV (raw): ' + event.data.slice(0, 500), 'recv');
      }
    } else {
      entry.data = '[binary]';
      log('WS RECV: [binary data]', 'recv');
    }
    captured.push(entry);
    sendToServer(entry);
  });

  ws.addEventListener('close', (e) => log('WS CLOSE: code=' + e.code + ' reason=' + e.reason, 'info'));
  ws.addEventListener('error', (e) => log('WS ERROR: ' + e.type, 'info'));

  return ws;
};
// Copy static properties
Object.keys(OrigWS).forEach(k => { window.WebSocket[k] = OrigWS[k]; });
window.WebSocket.prototype = OrigWS.prototype;

function formatMsg(obj) {
  // Highlight SDP content
  if (obj.sdp || obj.type === 'offer' || obj.type === 'answer') {
    const sdpPreview = (obj.sdp || '').slice(0, 200).replace(/\\r\\n/g, ' | ');
    return '<span class="sdp">[SDP ' + (obj.type || 'unknown') + '] ' + sdpPreview + '...</span>';
  }
  if (obj.candidate) {
    return '[ICE] ' + JSON.stringify(obj.candidate).slice(0, 150);
  }
  // Truncate large objects
  const s = JSON.stringify(obj);
  return s.length > 400 ? s.slice(0, 400) + '...' : s;
}

function log(msg, cls) {
  const el = document.getElementById('log');
  const t = new Date().toLocaleTimeString() + '.' + String(Date.now() % 1000).padStart(3, '0');
  el.innerHTML += '<span class="' + (cls||'') + '">[' + t + '] ' + msg + '</span>\\n';
  el.scrollTop = el.scrollHeight;
}

function sendToServer(entry) {
  // Send captured data back to our server for logging
  fetch('/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
</script>

<script src="https://cdn.jsdelivr.net/npm/@touchcastllc/napster-companion-api@latest/lib/index.standalone.js"></script>
<script>
  // Now init the SDK — our WebSocket patch will capture everything
  const token = ${JSON.stringify(token)};

  (async function() {
    log('Initializing SDK...', 'info');
    try {
      const instance = await window.napsterCompanionApiSDK.init(token, {
        mountContainer: '#avatar-container',
        position: 'center',
        onData: (data) => {
          log('SDK EVENT: ' + JSON.stringify(data).slice(0, 300), 'info');
        },
      });
      log('SDK initialized!', 'info');
      if (instance.showAvatar) instance.showAvatar();

      // After 15 seconds, send a message to test the protocol
      setTimeout(() => {
        log('Sending test message via sendCommand...', 'info');
        if (instance.sendCommand) {
          instance.sendCommand({ type: 'send_message', data: { role: 'user', text: 'Say hello briefly.', trigger_response: true } });
        }
      }, 15000);
    } catch (err) {
      log('SDK ERROR: ' + err.message, 'info');
    }
  })();
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const { token, connId } = await createToken();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML(token, connId));
    } catch (err) {
      console.error('Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: ' + err.message);
    }
  } else if (req.url === '/capture' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const entry = JSON.parse(body);
        capturedMessages.push(entry);

        // Log to console with color
        const dir = entry.dir === 'SEND' ? '\x1b[31mSEND\x1b[0m' : '\x1b[32mRECV\x1b[0m';
        let preview = entry.data;
        if (typeof preview === 'string' && preview.length > 300) {
          try {
            const parsed = JSON.parse(preview);
            if (parsed.sdp) preview = `[SDP ${parsed.type}] ${parsed.sdp.slice(0, 100)}...`;
            else preview = JSON.stringify(parsed).slice(0, 300);
          } catch { preview = preview.slice(0, 300); }
        }
        console.log(`[${dir}] ${preview}`);
      } catch {}
      res.writeHead(200);
      res.end('ok');
    });
  } else if (req.url === '/dump') {
    // Save all captured messages to file
    const path = 'test/signaling-capture.json';
    fs.writeFileSync(path, JSON.stringify(capturedMessages, null, 2));
    console.log(`\nDumped ${capturedMessages.length} messages to ${path}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saved: capturedMessages.length, path }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(5556, () => {
  console.log('\nSignaling capture server: http://localhost:5556');
  console.log('Open the URL, let the avatar connect, watch the protocol here.');
  console.log('After capture, visit http://localhost:5556/dump to save.\n');
});
