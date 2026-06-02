// Test: send commands immediately after DC opens, try both channels
// Usage: OMNIAGENT_API_KEY=<key> node test/webrtc-cmd-timing-test.js

const WebSocket = require('ws');
const { RTCPeerConnection, useH264, useVP8, useOPUS, usePCMU } = require('werift');

const API_KEY = process.env.OMNIAGENT_API_KEY || 'REDACTED_API_KEY';
const BASE = 'https://companion-api.napster.com';

async function main() {
  const compRes = await fetch(`${BASE}/public/companions/napster-stock?pageSize=1`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  const compData = await compRes.json();
  const companionId = compData.items[0].id;

  const agentRes = await fetch(`${BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId,
      name: 'cmd-test-2',
      voiceId: 'ash',
      providerSettings: { temperature: 0.85, instructions: 'You are a helpful assistant.' },
    }),
  });
  const agentData = await agentRes.json();
  const agentId = agentData.id;
  console.log('Agent:', agentId);

  const connRes = await fetch(`${BASE}/public/agents/${agentId}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelType: 'webrtc', externalClientId: 'testcmd789' }),
  });
  const connData = await connRes.json();
  const decoded = JSON.parse(Buffer.from(connData.token, 'base64').toString());
  const connectionId = decoded.connection.id;
  const signalingBase = decoded.connection.signalingEndpoint;
  const signalingUrl = `${signalingBase}/ws/connections/${connectionId}/signaling`;
  console.log('Connection:', connectionId);

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    codecs: { audio: [useOPUS(), usePCMU()], video: [useH264(), useVP8()] },
  });
  pc.addTransceiver('audio', { direction: 'sendrecv' });
  pc.addTransceiver('video', { direction: 'sendrecv' });
  const dc = pc.createDataChannel('events');

  let ws;
  let responseCount = 0;

  // Data channel events
  dc.stateChanged.subscribe((state) => {
    console.log(`DC: ${state}`);
    if (state === 'open') {
      // Send commands immediately after DC opens
      setTimeout(() => {
        // First: silence prime to wake up audio
        console.log('\n=== Sending silence prime via DC ===');
        const silence = Buffer.alloc(3200);
        dc.send(JSON.stringify({
          type: 'send_audio',
          data: { data: silence.toString('base64') },
        }));

        // Then: send_message via DC after 1s
        setTimeout(() => {
          console.log('\n=== TEST A: send_message via DC ===');
          dc.send(JSON.stringify({
            type: 'send_message',
            data: { role: 'user', text: 'Say exactly the words: DATA CHANNEL SUCCESS', trigger_response: true },
          }));
          console.log('Sent send_message via DC');
        }, 1000);

        // Then: send_message via signaling WS after 10s
        setTimeout(() => {
          console.log('\n=== TEST B: send_message via signaling WS ===');
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'send_message',
              data: { role: 'user', text: 'Say exactly the words: SIGNALING WS SUCCESS', trigger_response: true },
            }));
            console.log('Sent send_message via signaling WS');
          } else {
            console.log('Signaling WS closed');
          }
        }, 10000);
      }, 2000);
    }
  });

  dc.onMessage.subscribe((raw) => {
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    try {
      const evt = JSON.parse(text);
      const type = evt.event || evt.type;
      if (type === 'talk_state_changed') {
        console.log(`[DC] talk: ${evt.data?.state}`);
      } else if (type === 'message_received') {
        const msg = evt.data?.message;
        if (msg?.role === 'assistant') {
          if (msg.action === 'delta') process.stdout.write(msg.content || '');
          else if (msg.action === 'completed') {
            responseCount++;
            console.log(`\n[DC] RESPONSE #${responseCount} COMPLETED: "${(msg.content || '').slice(0, 150)}"`);
          } else console.log(`[DC] msg ${msg.action}`);
        }
      } else if (type === 'error') {
        console.log(`[DC] ERROR: ${JSON.stringify(evt.data)}`);
      } else if (type !== 'avatar_state_changed' && type !== 'audio_received') {
        console.log(`[DC] ${type}: ${JSON.stringify(evt.data).slice(0, 100)}`);
      }
    } catch {}
  });

  // Signaling
  ws = new WebSocket(signalingUrl);
  ws.on('open', async () => {
    console.log('Signaling open');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({
      type: 'set_remote_description',
      data: { sdp: pc.localDescription.sdp, type: 'offer' },
    }));
    pc.onIceCandidate.subscribe((c) => {
      if (c && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'add_ice_candidate',
          data: { candidate: { candidate: c.candidate, sdpMid: String(c.sdpMid ?? '0'), sdpMLineIndex: c.sdpMLineIndex ?? 0 } },
        }));
      }
    });
  });

  ws.on('message', async (raw) => {
    const text = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    const msg = JSON.parse(text);
    if ((msg.type === 'set_local_description' || msg.type === 'set_remote_description') && msg.data?.sdp) {
      await pc.setRemoteDescription({ type: msg.data.type || 'answer', sdp: msg.data.sdp });
      console.log('SDP answer applied');
    } else if (msg.type === 'add_ice_candidate' && msg.data) {
      await pc.addIceCandidate(msg.data);
    } else if (msg.type === 'error') {
      console.log(`[SIG-WS] ERROR: ${JSON.stringify(msg.data)}`);
    } else {
      const evtType = msg.event || msg.type;
      if (evtType === 'message_received') {
        const m = msg.data?.message;
        if (m?.role === 'assistant' && m.action === 'delta') {
          process.stdout.write(`[SIG]${m.content || ''}`);
        } else if (m?.role === 'assistant' && m.action === 'completed') {
          console.log(`\n[SIG] COMPLETED: "${(m.content || '').slice(0, 150)}"`);
        }
      } else if (evtType === 'talk_state_changed') {
        console.log(`[SIG] talk: ${msg.data?.state}`);
      }
    }
  });

  ws.on('error', (err) => console.error('WS err:', err.message));
  pc.iceConnectionStateChange.subscribe((s) => console.log(`ICE: ${s}`));

  setTimeout(() => {
    console.log('\n--- 35s timeout ---');
    console.log(`Total responses received: ${responseCount}`);
    dc.close(); pc.close(); ws.close();
    process.exit(0);
  }, 35000);
}

main().catch((err) => { console.error(err); process.exit(1); });
