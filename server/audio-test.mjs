import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import WebSocket from 'ws';
import fs from 'fs';

const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync('/tmp/audio-test.log', line);
};

fs.writeFileSync('/tmp/audio-test.log', '');

const API_KEY = process.env.OMNIAGENT_API_KEY;
log(`API_KEY: ${API_KEY?.slice(0, 12)}...`);

// Load companions
const res = await fetch('https://companion-api.napster.com/public/companions/napster-stock', {
  headers: { 'X-Api-Key': API_KEY },
});
const data = await res.json();
log(`Companions: ${data.items?.length}`);

// Create agent
const companionId = data.items[0].id;
log(`Using companion: ${companionId}`);

const agentRes = await fetch('https://companion-api.napster.com/public/agents', {
  method: 'POST',
  headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ companionId, name: 'AudioTest', voiceId: 'alloy', providerSettings: { instructions: 'You are a helpful assistant. Say hello in one sentence.' } }),
});
const agentBody = await agentRes.json();
log(`Agent response: ${JSON.stringify(agentBody).slice(0, 300)}`);
const agentId = agentBody.id || agentBody.agentId;
if (!agentId) { log('ERROR: no agent ID'); process.exit(1); }
log(`Agent ID: ${agentId}`);

// Create WS connection
const connRes = await fetch(`https://companion-api.napster.com/public/agents/${agentId}/connections`, {
  method: 'POST',
  headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ channelType: 'websocket' }),
});
const conn = await connRes.json();
const decoded = JSON.parse(Buffer.from(conn.token, 'base64').toString('utf-8'));
log(`WS URL: ${decoded.url?.slice(0, 60)}`);

// Connect
const ws = new WebSocket(decoded.url, {
  headers: { Authorization: `Bearer ${decoded.authToken}` },
});

let frames = { total: 0, binary: 0, json: 0, audioJson: 0 };

ws.on('open', () => {
  log('WS CONNECTED');

  // Prime audio channel with 100ms of silence (16-bit PCM, 16kHz, mono)
  const silence = Buffer.alloc(3200); // 1600 samples * 2 bytes
  ws.send(JSON.stringify({
    type: 'send_audio',
    data: { data: silence.toString('base64') },
  }));
  log('Sent silent audio to prime channel');

  // Wait a moment, then send text trigger
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'send_message',
      data: { role: 'user', text: 'Say hello in one sentence.', trigger_response: true }
    }));
    log('Sent trigger message');
  }, 500);
});

ws.on('message', (raw, isBinary) => {
  frames.total++;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

  if (isBinary) {
    frames.binary++;
    if (frames.binary <= 5) {
      log(`BINARY #${frames.binary}: ${buf.length} bytes, hex: ${buf.slice(0, 16).toString('hex')}`);
    }
    return;
  }

  try {
    const e = JSON.parse(buf.toString('utf-8'));
    frames.json++;
    const t = e.event || e.type;

    if (t === 'audio_received') {
      frames.audioJson++;
      // Log full structure of first 3 audio events to discover field names
      if (frames.audioJson <= 3) {
        const keys = Object.keys(e.data || {});
        log(`AUDIO_JSON #${frames.audioJson}: keys=[${keys}] full=${JSON.stringify(e.data).slice(0, 500)}`);
      } else {
        // For subsequent ones, just log size of each field
        const sizes = {};
        for (const [k, v] of Object.entries(e.data || {})) {
          sizes[k] = typeof v === 'string' ? v.length : typeof v;
        }
        log(`AUDIO_JSON #${frames.audioJson}: ${JSON.stringify(sizes)}`);
      }
    } else if (t === 'talk_state_changed') {
      log(`TALK: ${e.data?.state}`);
    } else if (t === 'message_received') {
      const m = e.data?.message || e.data;
      if (m?.role === 'assistant') {
        if (m.action === 'completed') log(`RESPONSE: ${m.content?.slice(0, 120)}`);
        else if (m.action !== 'delta') log(`MSG: ${m.action} ${m.role}`);
      } else {
        log(`MSG: ${m?.action || '?'} ${m?.role || '?'} ${m?.type || ''}`);
      }
    } else {
      log(`EVENT: ${t}`);
    }
  } catch {
    log(`NON_JSON: ${buf.length} bytes`);
  }
});

ws.on('error', (err) => log(`WS ERROR: ${err.message}`));
ws.on('close', (code) => log(`WS CLOSED: ${code}`));

setTimeout(() => {
  log(`\n=== FINAL STATS ===`);
  log(`Total frames: ${frames.total}`);
  log(`JSON frames: ${frames.json}`);
  log(`Binary frames: ${frames.binary}`);
  log(`audio_received JSON: ${frames.audioJson}`);
  ws.close();
  setTimeout(() => process.exit(0), 500);
}, 15000);
