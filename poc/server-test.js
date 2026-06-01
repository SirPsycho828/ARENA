/**
 * ARENA PoC - Server-Side API Tests
 *
 * Tests the critical unknowns:
 * 1. Can we create a companion + agent via REST API?
 * 2. Can we create MULTIPLE agents simultaneously?
 * 3. Can we open WebSocket connections to agents from the server?
 * 4. Can we send messages and receive transcripts via WebSocket?
 * 5. Can we create multiple concurrent WebSocket connections?
 *
 * Run: node server-test.js
 */

import 'dotenv/config';
import WebSocket from 'ws';

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.NAPSTER_API_KEY;

if (!API_KEY) {
  console.error('ERROR: NAPSTER_API_KEY not set in .env');
  process.exit(1);
}

const headers = {
  'X-Api-Key': API_KEY,
  'Content-Type': 'application/json',
};

// Track created resources for cleanup
const createdAgents = [];
const createdCompanions = [];
const openConnections = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

async function apiCall(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  console.log(`  → ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    console.error(`  ✗ ${res.status} ${res.statusText}`);
    console.error(`    ${text.substring(0, 300)}`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function decodeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    // Token may contain URL and auth info separated by delimiter
    console.log(`  Token decoded (first 200 chars): ${decoded.substring(0, 200)}`);
    return decoded;
  } catch (e) {
    console.log(`  Token (raw, first 100 chars): ${token.substring(0, 100)}`);
    return token;
  }
}

// ─── Test 1: List existing agents ───────────────────────────────────────────

async function test1_listAgents() {
  console.log('\n═══ TEST 1: List Existing Agents ═══');
  const result = await apiCall('GET', '/public/agents');
  if (result) {
    const agents = Array.isArray(result) ? result : result.agents || result.data || [];
    console.log(`  ✓ Found ${agents.length} existing agent(s)`);
    if (agents.length > 0) {
      agents.slice(0, 3).forEach(a => {
        console.log(`    - ${a.id || a._id}: ${a.name || 'unnamed'}`);
      });
    }
    return agents;
  }
  return [];
}

// ─── Test 2: List stock companions ──────────────────────────────────────────

async function test2_listCompanions() {
  console.log('\n═══ TEST 2: Browse Stock Companions ═══');
  const result = await apiCall('GET', '/public/companions/napster-stock');
  if (result) {
    const companions = Array.isArray(result) ? result : result.companions || result.data || [];
    console.log(`  ✓ Found ${companions.length} stock companion(s)`);
    if (companions.length > 0) {
      companions.slice(0, 5).forEach(c => {
        console.log(`    - ${c.id || c._id}: ${c.firstName || ''} ${c.lastName || ''}`);
      });
      return companions[0]; // Return first for use in agent creation
    }
  }
  return null;
}

// ──�� Test 3: Create an Agent ────────────────────────────────────────────────

async function test3_createAgent(companionId, name) {
  console.log(`\n���══ TEST 3: Create Agent "${name}" ═══`);
  const result = await apiCall('POST', '/public/agents', {
    companionId,
    name,
    voiceId: 'alloy',
    providerSettings: {
      temperature: 0.8,
    },
  });
  if (result) {
    const agentId = result.id || result._id || result.agentId;
    console.log(`  ✓ Agent created: ${agentId}`);
    createdAgents.push(agentId);
    return agentId;
  }
  return null;
}

// ─── Test 4: Create WebRTC Connection ───────────────────────────────────────

async function test4_createWebRTCConnection(agentId, clientId) {
  console.log(`\n═���═ TEST 4: Create WebRTC Connection (agent: ${agentId}) ═══`);
  const body = { channelType: 'webrtc' };
  if (clientId) body.externalClientId = clientId;

  const result = await apiCall('POST', `/public/agents/${agentId}/connections`, body);
  if (result) {
    const token = result.token;
    const connectionId = result.connection?.id || result.connectionId || result.id;
    console.log(`  ✓ Connection created: ${connectionId}`);
    console.log(`  ✓ Token received (length: ${token?.length || 0})`);
    if (token) decodeToken(token);
    return { token, connectionId };
  }
  return null;
}

// ─── Test 5: Create WebSocket Connection ────────────────────────────────────

async function test5_createWSConnection(agentId, clientId) {
  console.log(`\n═══ TEST 5: Create WebSocket Connection (agent: ${agentId}) ═══`);
  const body = { channelType: 'websocket' };
  if (clientId) body.externalClientId = clientId;

  const result = await apiCall('POST', `/public/agents/${agentId}/connections`, body);
  if (result) {
    const token = result.token;
    const connectionId = result.connection?.id || result.connectionId || result.id;
    console.log(`  ✓ WS Connection created: ${connectionId}`);
    console.log(`  ✓ Token received (length: ${token?.length || 0})`);

    // Decode token to get WebSocket URL
    const decoded = decodeToken(token);
    return { token, connectionId, decoded };
  }
  return null;
}

// ─── Test 6: Open WebSocket + Send Message ──────────────────────────────────

async function test6_openWSAndChat(token) {
  console.log('\n═══ TEST 6: Open WebSocket + Send Message ═══');

  return new Promise((resolve) => {
    let wsUrl;
    let authToken;

    // Try to parse the token to get WS URL
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      // The token might be JSON with url and token fields
      try {
        const parsed = JSON.parse(decoded);
        wsUrl = parsed.url || parsed.wsUrl || parsed.endpoint;
        authToken = parsed.token || parsed.authToken || parsed.auth;
      } catch {
        // Maybe it's a URL directly or URL|token format
        if (decoded.includes('|')) {
          [wsUrl, authToken] = decoded.split('|');
        } else if (decoded.startsWith('ws')) {
          wsUrl = decoded;
        }
      }
    } catch {
      console.log('  Could not decode token as base64');
    }

    if (!wsUrl) {
      console.log('  ⚠ Could not extract WebSocket URL from token');
      console.log('  Token format needs investigation - printing raw:');
      console.log(`  ${token.substring(0, 200)}`);
      resolve(false);
      return;
    }

    console.log(`  Connecting to: ${wsUrl.substring(0, 80)}...`);

    const finalUrl = authToken ? `${wsUrl}?token=${authToken}` : wsUrl;
    const ws = new WebSocket(finalUrl);
    openConnections.push(ws);

    const timeout = setTimeout(() => {
      console.log('  ⚠ WebSocket connection timed out (10s)');
      ws.close();
      resolve(false);
    }, 10000);

    ws.on('open', () => {
      console.log('  ✓ WebSocket connected!');

      // Send a text message
      const msg = {
        type: 'send_message',
        data: {
          role: 'user',
          text: 'Hello! Say just one short sentence back to me.',
          trigger_response: true,
        },
      };
      console.log('  → Sending message...');
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log(`  ← Event: ${event.type || event.event || 'unknown'}`);

        // Log transcript-related events
        if (event.type === 'message_received' || event.event === 'message_received') {
          console.log(`  ✓ TRANSCRIPT: "${(event.data?.text || '').substring(0, 100)}"`);
        }
        if (event.type === 'audio_received' || event.event === 'audio_received') {
          console.log(`  ✓ Audio chunk received (${(event.data?.data || '').length} chars base64)`);
        }
        if (event.type === 'speech_started' || event.event === 'speech_started') {
          console.log('  ✓ Speech started event detected');
        }
        if (event.type === 'transcript' || event.event === 'transcript') {
          console.log(`  ✓ Transcript event: "${(event.data?.text || event.text || '').substring(0, 100)}"`);
        }

        // Log ALL unique event types for discovery
        console.log(`    Full event keys: ${Object.keys(event).join(', ')}`);
        if (event.data) console.log(`    Data keys: ${Object.keys(event.data).join(', ')}`);
      } catch {
        // Binary data (audio)
        console.log(`  ← Binary data (${data.length} bytes)`);
      }
    });

    ws.on('error', (err) => {
      console.error(`  ✗ WebSocket error: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      console.log(`  WebSocket closed: ${code} ${reason}`);
      clearTimeout(timeout);
      resolve(true);
    });

    // Close after 20 seconds of listening
    setTimeout(() => {
      console.log('\n  → Closing WebSocket after 20s observation window');
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    }, 20000);
  });
}

// ─── Test 7: Multiple Concurrent Connections ────────────────────────────────

async function test7_concurrentConnections(agentIds) {
  console.log('\n══�� TEST 7: Multiple Concurrent Connections ═══');
  console.log(`  Attempting ${agentIds.length} simultaneous WebSocket connections...`);

  const results = await Promise.all(
    agentIds.map((id, i) => test5_createWSConnection(id, `arena_test_${i}`))
  );

  const successes = results.filter(Boolean);
  console.log(`\n  Result: ${successes.length}/${agentIds.length} connections created successfully`);

  if (successes.length === agentIds.length) {
    console.log('  ✓ ALL concurrent connections succeeded!');
  } else if (successes.length > 0) {
    console.log(`  ⚠ Only ${successes.length} connections worked (API may have limits)`);
  } else {
    console.log('  ✗ No connections succeeded');
  }

  return successes;
}

// ─── Test 8: send_message on existing connection (via REST) ─────────────────

async function test8_sendMessageViaAPI(agentId) {
  console.log(`\n═══ TEST 8: Check for REST message endpoint ═══`);
  // Some APIs allow sending messages via REST to active sessions
  // Let's check if this endpoint exists
  const result = await apiCall('GET', `/public/sessions`);
  if (result) {
    const sessions = Array.isArray(result) ? result : result.sessions || result.data || [];
    console.log(`  ✓ Sessions endpoint works. Found ${sessions.length} session(s)`);
    if (sessions.length > 0) {
      console.log(`    Latest: ${sessions[0].id || sessions[0]._id} - status: ${sessions[0].status || 'unknown'}`);
    }
  }
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n═══ CLEANUP ═══');

  for (const ws of openConnections) {
    try { ws.close(); } catch {}
  }

  for (const agentId of createdAgents) {
    console.log(`  Deleting agent: ${agentId}`);
    await apiCall('DELETE', `/public/agents/${agentId}`);
  }

  for (const compId of createdCompanions) {
    console.log(`  Deleting companion: ${compId}`);
    await apiCall('DELETE', `/public/companions/${compId}`);
  }

  console.log('  ✓ Cleanup complete');
}

// ─── Main ───────���───────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   A.R.E.N.A. - API Proof of Concept Tests   ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  API Key: ${API_KEY.substring(0, 15)}...${API_KEY.slice(-5)}  ║`);
  console.log('╚══════════════════════════════════════════════╝');

  try {
    // Test 1: List existing agents
    const existingAgents = await test1_listAgents();

    // Test 2: Browse stock companions
    const stockCompanion = await test2_listCompanions();

    if (!stockCompanion) {
      console.error('\n✗ Cannot proceed without a companion. Exiting.');
      return;
    }

    const companionId = stockCompanion.id || stockCompanion._id;
    console.log(`\n  Using companion: ${companionId} (${stockCompanion.firstName})`);

    // Test 3: Create agents (need at least 2 to test concurrency)
    const agent1 = await test3_createAgent(companionId, 'ARENA PoC Agent 1');
    const agent2 = await test3_createAgent(companionId, 'ARENA PoC Agent 2');

    if (!agent1) {
      console.error('\n✗ Could not create agent. Check API key and permissions.');
      return;
    }

    // Test 4: WebRTC connection (get token for browser test)
    const webrtcConn = await test4_createWebRTCConnection(agent1, 'arena_poc_test');

    // Test 5: WebSocket connection
    const wsConn = await test5_createWSConnection(agent1, 'arena_poc_ws');

    // Test 6: Open WebSocket and send a message
    if (wsConn?.token) {
      await test6_openWSAndChat(wsConn.token);
    }

    // Test 7: Multiple concurrent connections
    const agentIds = [agent1, agent2].filter(Boolean);
    if (agentIds.length >= 2) {
      await test7_concurrentConnections(agentIds);
    }

    // Test 8: Sessions API
    await test8_sendMessageViaAPI(agent1);

    // ─── Summary ──────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║             TEST SUMMARY                     ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Agents created:       ${createdAgents.length}                    ║`);
    console.log(`║  WebRTC token:         ${webrtcConn ? '✓' : '✗'}                    ║`);
    console.log(`║  WebSocket token:      ${wsConn ? '✓' : '✗'}                    ║`);
    console.log(`║  Concurrent conns:     ${agentIds.length} attempted           ║`);
    console.log('╚══════════════════════════════════════════════╝');

    console.log('\n─── NEXT STEPS ───');
    console.log('1. If WebSocket connection worked: Server-side orchestration is viable');
    console.log('2. If multiple connections worked: Multi-agent is possible');
    console.log('3. Run the browser test (npm run dev → open localhost:3000)');
    console.log('   to test SDK widget + MediaStream access');

  } finally {
    await cleanup();
  }
}

main().catch(console.error);
