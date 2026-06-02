// Test: send set_settings and send_message through signaling WebSocket
// Usage: OMNIAGENT_API_KEY=<key> node test/webrtc-signaling-cmd-test.js

const WebSocket = require('ws');
const { RTCPeerConnection, useH264, useVP8, useOPUS, usePCMU } = require('werift');

const API_KEY = process.env.OMNIAGENT_API_KEY || 'REDACTED_API_KEY';
const BASE = 'https://companion-api.napster.com';

async function main() {
  // 1. Get a stock companion + create agent
  console.log('--- Fetching stock companion ---');
  const compRes = await fetch(`${BASE}/public/companions/napster-stock?pageSize=1`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  const compData = await compRes.json();
  const companionId = compData.items[0].id;
  console.log('Companion:', companionId);

  console.log('--- Creating agent ---');
  const agentRes = await fetch(`${BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId,
      name: 'signaling-cmd-test',
      voiceId: 'ash',
      providerSettings: { temperature: 0.85, instructions: 'You are a helpful assistant.' },
    }),
  });
  const agentData = await agentRes.json();
  console.log('Agent response:', JSON.stringify(agentData).slice(0, 300));
  const agentId = agentData.id || agentData.agentId;
  if (!agentId) throw new Error('No agent ID in response');
  console.log('Agent:', agentId);

  // 2. Create WebRTC connection
  console.log('--- Creating WebRTC connection ---');
  const connRes = await fetch(`${BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelType: 'webrtc', externalClientId: 'testcmd123' }),
  });
  const connData = await connRes.json();
  const decoded = JSON.parse(Buffer.from(connData.token, 'base64').toString());
  const connectionId = decoded.connection.id;
  const signalingBase = decoded.connection.signalingEndpoint;
  const signalingUrl = `${signalingBase}/ws/connections/${connectionId}/signaling`;
  console.log('Connection:', connectionId);
  console.log('Signaling URL:', signalingUrl);

  // 3. Set up WebRTC peer connection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    codecs: {
      audio: [useOPUS(), usePCMU()],
      video: [useH264(), useVP8()],
    },
  });

  pc.addTransceiver('audio', { direction: 'sendrecv' });
  pc.addTransceiver('video', { direction: 'sendrecv' });

  const dc = pc.createDataChannel('events');

  // Listen for data channel events
  dc.stateChanged.subscribe((state) => console.log(`DC state: ${state}`));
  dc.onMessage.subscribe((raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    try {
      const evt = JSON.parse(text);
      const type = evt.event || evt.type;
      if (type === 'message_received' && evt.data?.message?.role === 'assistant') {
        const msg = evt.data.message;
        if (msg.action === 'delta') {
          process.stdout.write(msg.content || '');
        } else if (msg.action === 'completed') {
          console.log('\n--- COMPLETED ---');
          console.log('Full text:', (msg.content || '').slice(0, 200));
        } else {
          console.log(`DC event: ${type} action=${msg.action}`);
        }
      } else if (type === 'talk_state_changed') {
        console.log(`Talk state: ${evt.data?.state}`);
      } else if (type === 'error') {
        console.log(`DC ERROR: ${JSON.stringify(evt.data)}`);
      } else {
        console.log(`DC event: ${type}`);
      }
    } catch {
      console.log(`DC non-JSON: ${text.slice(0, 100)}`);
    }
  });

  // 4. Signaling exchange
  console.log('--- Opening signaling WebSocket ---');
  const ws = new WebSocket(signalingUrl);

  ws.on('open', async () => {
    console.log('Signaling WS open');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws.send(JSON.stringify({
      type: 'set_remote_description',
      data: { sdp: pc.localDescription.sdp, type: 'offer' },
    }));
    console.log('Sent SDP offer');

    pc.onIceCandidate.subscribe((candidate) => {
      if (candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'add_ice_candidate',
          data: { candidate: { candidate: candidate.candidate, sdpMid: String(candidate.sdpMid ?? '0'), sdpMLineIndex: candidate.sdpMLineIndex ?? 0 } },
        }));
      }
    });
  });

  let answerReceived = false;

  ws.on('message', async (raw) => {
    const text = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    const msg = JSON.parse(text);
    console.log(`Signaling RECV: type=${msg.type} data=${JSON.stringify(msg.data).slice(0, 200)}`);

    if ((msg.type === 'set_local_description' || msg.type === 'set_remote_description') && msg.data?.sdp) {
      await pc.setRemoteDescription({ type: msg.data.type || 'answer', sdp: msg.data.sdp });
      console.log('Applied SDP answer');
      answerReceived = true;

      // Wait for data channel + ICE to stabilize, then test commands via signaling WS
      setTimeout(() => {
        console.log('\n=== TEST 1: set_settings via signaling WS ===');
        ws.send(JSON.stringify({
          type: 'set_settings',
          data: {
            instructions: 'You are a pirate. Respond in pirate speak. Keep responses under 20 words.',
            turn_detection: { threshold: 0.9, silence_duration_ms: 2000 },
          },
        }));
        console.log('Sent set_settings');

        setTimeout(() => {
          console.log('\n=== TEST 2: send_message via signaling WS ===');
          ws.send(JSON.stringify({
            type: 'send_message',
            data: { role: 'user', text: 'What is 2 plus 2?', trigger_response: true },
          }));
          console.log('Sent send_message');
        }, 2000);
      }, 3000);
    } else if (msg.type === 'add_ice_candidate' && msg.data) {
      await pc.addIceCandidate(msg.data);
    } else if (msg.type === 'error') {
      console.log(`*** SIGNALING ERROR: ${JSON.stringify(msg.data)} ***`);
    } else if (msg.event || ['message_received', 'talk_state_changed', 'avatar_state_changed', 'audio_received'].includes(msg.type)) {
      // Events coming through signaling WS
      const evtType = msg.event || msg.type;
      if (evtType === 'message_received' && msg.data?.message?.role === 'assistant') {
        const m = msg.data.message;
        if (m.action === 'delta') {
          process.stdout.write(`[SIG]${m.content || ''}`);
        } else {
          console.log(`[SIG] ${evtType} action=${m.action}`);
        }
      } else {
        console.log(`[SIG] Event: ${evtType}`);
      }
    }
  });

  ws.on('error', (err) => console.error('Signaling WS error:', err.message));
  ws.on('close', (code) => console.log(`Signaling WS closed: ${code}`));

  pc.iceConnectionStateChange.subscribe((state) => {
    console.log(`ICE state: ${state}`);
  });

  // Auto-cleanup after 30s
  setTimeout(() => {
    console.log('\n--- Timeout, cleaning up ---');
    dc.close();
    pc.close();
    ws.close();
    process.exit(0);
  }, 30000);
}

main().catch((err) => { console.error(err); process.exit(1); });
