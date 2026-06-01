import 'dotenv/config';
import WebSocket from 'ws';

const API = 'https://companion-api.napster.com';
const KEY = process.env.NAPSTER_API_KEY;
const headers = { 'X-Api-Key': KEY, 'Content-Type': 'application/json' };
const createdAgents = [];

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (res.status === 204) return {};
  const text = await res.text();
  if (!res.ok) {
    console.log(`  ERROR ${res.status}: ${text.substring(0, 200)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('\n=== ARENA PoC - Full Test Suite ===\n');

  // TEST 1: Create 2 agents
  console.log('--- TEST 1: Create 2 Agents ---');
  const stockRes = await api('GET', '/public/companions/napster-stock');
  const companions = stockRes?.items || [];
  console.log(`  Companions available: ${companions.length}`);

  if (companions.length < 2) {
    console.log('  ERROR: Need at least 2 companions. Aborting.');
    return;
  }

  const agent1 = await api('POST', '/public/agents', {
    companionId: companions[0].id,
    name: 'ARENA Comedian',
    voiceId: 'alloy',
    providerSettings: { temperature: 0.9 },
  });
  if (agent1) {
    createdAgents.push(agent1.id);
    console.log(`  Agent 1 created: ${agent1.id} (${agent1.name})`);
  }

  const agent2 = await api('POST', '/public/agents', {
    companionId: companions[1].id,
    name: 'ARENA Professor',
    voiceId: 'alloy',
    providerSettings: { temperature: 0.7 },
  });
  if (agent2) {
    createdAgents.push(agent2.id);
    console.log(`  Agent 2 created: ${agent2.id} (${agent2.name})`);
  }

  if (!agent1 || !agent2) {
    console.log('  FAILED to create agents. Cleaning up.');
    await cleanup();
    return;
  }

  // TEST 2: WebRTC connections
  console.log('\n--- TEST 2: WebRTC Connections ---');
  const rtc1 = await api('POST', `/public/agents/${agent1.id}/connections`, {
    channelType: 'webrtc',
    externalClientId: 'arena_rtc1',
  });
  if (rtc1) console.log(`  WebRTC 1: token=${rtc1.token?.length} chars, conn=${rtc1.connection?.id}`);

  const rtc2 = await api('POST', `/public/agents/${agent2.id}/connections`, {
    channelType: 'webrtc',
    externalClientId: 'arena_rtc2',
  });
  if (rtc2) console.log(`  WebRTC 2: token=${rtc2.token?.length} chars, conn=${rtc2.connection?.id}`);
  console.log(`  RESULT: ${rtc1 && rtc2 ? 'PASS - Both WebRTC connections created' : 'FAIL'}`);

  // TEST 3: WebSocket connections
  console.log('\n--- TEST 3: WebSocket Connections ---');
  const ws1 = await api('POST', `/public/agents/${agent1.id}/connections`, {
    channelType: 'websocket',
    externalClientId: 'arena_ws1',
  });
  if (ws1) console.log(`  WS 1: token=${ws1.token?.length} chars`);

  const ws2 = await api('POST', `/public/agents/${agent2.id}/connections`, {
    channelType: 'websocket',
    externalClientId: 'arena_ws2',
  });
  if (ws2) console.log(`  WS 2: token=${ws2.token?.length} chars`);
  console.log(`  RESULT: ${ws1 && ws2 ? 'PASS - Both WS connections created' : 'FAIL'}`);

  // TEST 4: Decode token + open WebSocket + send message
  console.log('\n--- TEST 4: Open WebSocket + Send Message ---');
  if (ws1?.token) {
    let decoded;
    try {
      decoded = Buffer.from(ws1.token, 'base64').toString('utf-8');
      console.log(`  Token decoded (first 300): ${decoded.substring(0, 300)}`);
    } catch (e) {
      decoded = ws1.token;
      console.log(`  Token not base64. Raw (first 200): ${decoded.substring(0, 200)}`);
    }

    let wsUrl, authToken;
    try {
      const parsed = JSON.parse(decoded);
      console.log(`  Parsed token keys: ${Object.keys(parsed).join(', ')}`);
      wsUrl = parsed.url || parsed.wsUrl || parsed.endpoint || parsed.uri;
      authToken = parsed.token || parsed.authToken || parsed.auth || parsed.key;
      if (wsUrl) console.log(`  WS URL: ${wsUrl.substring(0, 120)}`);
      if (authToken) console.log(`  Auth: ${authToken.substring(0, 60)}...`);
    } catch {
      if (decoded.startsWith('ws')) {
        wsUrl = decoded;
      } else {
        const match = decoded.match(/(wss?:\/\/[^\s"]+)/);
        if (match) wsUrl = match[1];
      }
      console.log(`  Extracted URL: ${wsUrl?.substring(0, 120) || 'NONE'}`);
    }

    if (wsUrl) {
      const finalUrl = authToken
        ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(authToken)}`
        : wsUrl;

      console.log(`  Connecting...`);
      await new Promise((resolve) => {
        const socket = new WebSocket(finalUrl);
        let eventCount = 0;
        const eventTypes = new Set();

        const timer = setTimeout(() => {
          console.log(`\n  Closing after 15s. Total events: ${eventCount}`);
          console.log(`  Event types seen: ${[...eventTypes].join(', ') || 'none'}`);
          socket.close();
          resolve();
        }, 15000);

        socket.on('open', () => {
          console.log('  CONNECTED!');
          const msg = {
            type: 'send_message',
            data: {
              role: 'user',
              text: 'Hello! Say one short sentence back to me.',
              trigger_response: true,
            },
          };
          socket.send(JSON.stringify(msg));
          console.log('  -> Sent: send_message (user)');
        });

        socket.on('message', (raw) => {
          eventCount++;
          try {
            const msg = JSON.parse(raw.toString());
            const type = msg.type || msg.event || 'unknown';
            eventTypes.add(type);
            if (eventCount <= 25) {
              const dataStr = JSON.stringify(msg.data || msg).substring(0, 200);
              console.log(`  <- [${type}] ${dataStr}`);
            } else if (eventCount === 26) {
              console.log('  ... (suppressing further events, still counting)');
            }
          } catch {
            if (eventCount <= 5) {
              console.log(`  <- Binary: ${raw.length} bytes`);
            }
          }
        });

        socket.on('error', (err) => {
          console.log(`  WS ERROR: ${err.message}`);
          clearTimeout(timer);
          resolve();
        });

        socket.on('close', (code, reason) => {
          console.log(`  WS CLOSED: code=${code} reason=${reason || 'none'}`);
          clearTimeout(timer);
          resolve();
        });
      });
    } else {
      console.log('  FAILED: Could not extract WebSocket URL from token');
    }
  }

  // TEST 5: Multiple simultaneous connections
  console.log('\n--- TEST 5: 3+ Simultaneous Connections ---');
  const multi = await Promise.all([
    api('POST', `/public/agents/${agent1.id}/connections`, { channelType: 'websocket', externalClientId: 'arena_m1' }),
    api('POST', `/public/agents/${agent2.id}/connections`, { channelType: 'websocket', externalClientId: 'arena_m2' }),
    api('POST', `/public/agents/${agent1.id}/connections`, { channelType: 'webrtc', externalClientId: 'arena_m3' }),
  ]);
  const okCount = multi.filter(Boolean).length;
  console.log(`  Result: ${okCount}/3 connections created simultaneously`);
  console.log(`  RESULT: ${okCount === 3 ? 'PASS' : 'PARTIAL (' + okCount + '/3)'}`);

  // TEST 6: Sessions API
  console.log('\n--- TEST 6: Sessions API ---');
  const sessions = await api('GET', '/public/sessions');
  if (sessions) {
    const items = sessions.items || sessions.sessions || [];
    console.log(`  Sessions found: ${items.length}`);
    if (items.length > 0) {
      const s = items[0];
      console.log(`  Latest: id=${s.id}, status=${s.status}, closeReason=${s.closeReason}`);
    }
  }

  // SUMMARY
  console.log('\n============================');
  console.log('       FINAL RESULTS');
  console.log('============================');
  console.log(`  Create agents:        ${agent1 && agent2 ? 'PASS' : 'FAIL'}`);
  console.log(`  WebRTC connections:   ${rtc1 && rtc2 ? 'PASS' : 'FAIL'}`);
  console.log(`  WebSocket connections: ${ws1 && ws2 ? 'PASS' : 'FAIL'}`);
  console.log(`  Concurrent (3):       ${okCount === 3 ? 'PASS' : okCount + '/3'}`);
  console.log('============================\n');

  await cleanup();
}

async function cleanup() {
  console.log('--- CLEANUP ---');
  for (const id of createdAgents) {
    await api('DELETE', `/public/agents/${id}`);
    console.log(`  Deleted: ${id}`);
  }
}

main().catch(e => { console.error('FATAL:', e); cleanup(); });
