import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { RTCPeerConnection, RTCIceCandidate, useH264, useVP8, useOPUS, usePCMU } from 'werift';
import { AudioDecoder, VideoDecoder } from './media-decoder.js';
import type { AgentConfig } from '../../../shared/types.js';

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY!;

interface TokenPayload {
  connection: {
    id: string;
    signalingEndpoint?: string;
  };
  // WebRTC tokens have signalingEndpoint inside connection, not at top level.
  // No authToken — the connection ID in the URL path is the auth.
  expiresAt: string;
}

export class WebRTCConnection extends EventEmitter {
  private pc: RTCPeerConnection | null = null;
  private dc: ReturnType<RTCPeerConnection['createDataChannel']> | null = null;
  private signalingWs: WebSocket | null = null;
  private audioDecoder: AudioDecoder | null = null;
  private videoDecoder: VideoDecoder | null = null;
  private config: AgentConfig;
  private connectionId: string | null = null;
  private responseBuffer: Map<string, string> = new Map();
  private audioChunkCount = 0;
  private frameStats = { json: 0, binary: 0, audioJson: 0, video: 0, total: 0 };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  private dcReady = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  get id() { return this.config.id; }
  get name() { return this.config.name; }

  async connect(): Promise<void> {
    // Reset state for fresh/reconnected connection
    this.audioChunkCount = 0;
    this.frameStats = { json: 0, binary: 0, audioJson: 0, video: 0, total: 0 };
    this.responseBuffer.clear();
    this.dcReady = false;

    // Create WebRTC connection via API (same endpoint, channelType: 'webrtc')
    const res = await fetch(`${API_BASE}/public/agents/${this.config.id}/connections`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: 'webrtc',
        externalClientId: this.config.externalClientId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create WebRTC connection for ${this.config.name}: ${res.status} ${err}`);
    }

    const data = await res.json();
    const decoded: TokenPayload = JSON.parse(
      Buffer.from(data.token, 'base64').toString('utf-8')
    );

    this.connectionId = decoded.connection.id;
    // WebRTC token: signalingEndpoint is inside connection, URL path includes connection ID
    const signalingBase = decoded.connection.signalingEndpoint;
    if (!signalingBase) {
      throw new Error(`No signalingEndpoint in token for ${this.config.name}`);
    }
    const signalingUrl = `${signalingBase}/ws/connections/${this.connectionId}/signaling`;

    console.log(`  [${this.config.name}] WebRTC token decoded, connection=${this.connectionId}, signaling=${signalingBase}`);

    // Create werift RTCPeerConnection with H264 + VP8 video codecs
    // Napster server requires H264 for avatar video rendering
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      codecs: {
        audio: [useOPUS(), usePCMU()],
        video: [useH264(), useVP8()],
      },
    });

    // Add audio + video transceivers as sendrecv (Napster server rejects recvonly offers)
    // We don't actually send media, but the SDP must advertise sendrecv to match what
    // a browser would offer. The server still sends its video/audio to us.
    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.pc.addTransceiver('video', { direction: 'sendrecv' });

    // Create data channel for text events (same JSON format as current WS events)
    this.dc = this.pc.createDataChannel('events');
    this.wireDataChannel();
    this.wireMediaTracks();

    // Perform signaling exchange (no auth token — connection ID in URL is the auth)
    await this.performSignaling(signalingUrl);
  }

  // ─── Signaling ───────────────────────────────────────────────────────────

  private performSignaling(signalingUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Signaling timeout for ${this.config.name}`));
      }, 20000);

      // Track if we already resolved (answer received)
      let resolved = false;

      // Open signaling WebSocket (no auth header — connection ID in URL path is the auth)
      this.signalingWs = new WebSocket(signalingUrl);

      this.signalingWs.on('open', async () => {
        console.log(`  [${this.config.name}] Signaling WS connected`);

        try {
          // Create offer
          const offer = await this.pc!.createOffer();
          await this.pc!.setLocalDescription(offer);

          const localDesc = this.pc!.localDescription;
          if (!localDesc) throw new Error('No local description after setLocalDescription');

          // Send our SDP offer (named from server's perspective: set_remote_description)
          this.signalingWs!.send(JSON.stringify({
            type: 'set_remote_description',
            data: { sdp: localDesc.sdp, type: 'offer' },
          }));
          console.log(`  [${this.config.name}] Sent SDP offer via signaling`);

          // Send ICE candidates as they become available
          // Napster expects: { type: "add_ice_candidate", data: { candidate: { candidate, sdpMid, sdpMLineIndex } } }
          this.pc!.onIceCandidate.subscribe((candidate) => {
            if (candidate && this.signalingWs?.readyState === WebSocket.OPEN) {
              this.signalingWs.send(JSON.stringify({
                type: 'add_ice_candidate',
                data: {
                  candidate: {
                    candidate: candidate.candidate,
                    sdpMid: String(candidate.sdpMid ?? '0'),
                    sdpMLineIndex: candidate.sdpMLineIndex ?? 0,
                  },
                },
              }));
            }
          });
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.signalingWs.on('message', async (raw) => {
        try {
          const text = Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw);
          const msg = JSON.parse(text);
          console.log(`  [${this.config.name}] Signaling RECV: type=${msg.type} data=${JSON.stringify(msg.data).slice(0, 300)}`);

          if ((msg.type === 'set_local_description' || msg.type === 'set_remote_description') && msg.data?.sdp) {
            // Server's SDP answer — may come as set_local_description or set_remote_description
            console.log(`  [${this.config.name}] Received SDP answer`);
            await this.pc!.setRemoteDescription({
              type: msg.data.type || 'answer',
              sdp: msg.data.sdp,
            });

            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve();
            }
          } else if (msg.type === 'add_ice_candidate' && msg.data) {
            // Server ICE candidate
            await this.pc!.addIceCandidate(msg.data as RTCIceCandidate);
          } else if (msg.type === 'error') {
            // Error response to a command we sent
            console.error(`  [${this.config.name}] Signaling error: ${JSON.stringify(msg.data)}`);
          } else if (msg.event || ['message_received', 'talk_state_changed', 'avatar_state_changed', 'audio_received'].includes(msg.type)) {
            // Event forwarded through signaling WS — handle same as data channel events
            this.handleEvent(msg);
          }
        } catch (err) {
          console.error(`  [${this.config.name}] Signaling message error:`, (err as Error).message);
        }
      });

      this.signalingWs.on('error', (err) => {
        console.error(`  [${this.config.name}] Signaling WS error:`, err.message);
        if (!resolved) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.signalingWs.on('close', (code) => {
        console.log(`  [${this.config.name}] Signaling WS closed: ${code}`);
        // Signaling WS closing after answer is normal — peer connection is established
      });

      // Monitor ICE connection state
      this.pc!.iceConnectionStateChange.subscribe((state) => {
        console.log(`  [${this.config.name}] ICE state: ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.emit('disconnected', 0);
          this.attemptReconnect();
        }
      });
    });
  }

  // ─── Data Channel ──────────────────────────────────────────────────────

  private wireDataChannel() {
    if (!this.dc) return;

    this.dc.stateChanged.subscribe((state: string) => {
      console.log(`  [${this.config.name}] Data channel state: ${state}`);

      if (state === 'open') {
        this.dcReady = true;

        // Instructions are set at agent creation time (providerSettings.instructions)
        // because WebRTC data channel rejects set_settings ("Modalitites other than video
        // are not supported in WebRTC connection"). send_message works via DC.
        console.log(`  [${this.config.name}] DC ready — instructions already set at agent creation`);

        // Prime the audio channel with silence (same as OmniagentConnection)
        const silence = Buffer.alloc(3200); // 1600 samples * 2 bytes = 100ms 16kHz 16-bit mono
        this.dc!.send(JSON.stringify({
          type: 'send_audio',
          data: { data: silence.toString('base64') },
        }));
        console.log(`  [${this.config.name}] Sent silent audio prime via DC`);
      }

      if (state === 'closed') {
        this.dcReady = false;
        this.emit('disconnected', 0);
        this.attemptReconnect();
      }
    });

    this.dc.onMessage.subscribe((raw: Buffer | string) => {
      this.frameStats.total++;

      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');

      // Log first 10 frames for debugging
      if (this.frameStats.total <= 10) {
        console.log(`  [${this.config.name}] DC FRAME #${this.frameStats.total}: ${text.slice(0, 200)}`);
      }

      // Log stats every 50 frames
      if (this.frameStats.total % 50 === 0) {
        console.log(`  [${this.config.name}] FRAME STATS: ${JSON.stringify(this.frameStats)}`);
      }

      try {
        const event = JSON.parse(text);
        this.frameStats.json++;
        this.handleEvent(event);
      } catch {
        console.log(`  [${this.config.name}] non-JSON DC message: ${text.length}b`);
      }
    });
  }

  // ─── Media Tracks (Audio/Video via RTP) ────────────────────────────────

  private wireMediaTracks() {
    if (!this.pc) return;

    this.pc.onTrack.subscribe((track) => {
      const kind = track.kind;
      console.log(`  [${this.config.name}] Track received: ${kind}`);

      if (kind === 'audio') {
        this.audioDecoder = new AudioDecoder();
        this.audioDecoder.start();

        this.audioDecoder.on('audio', (b64: string) => {
          this.audioChunkCount++;
          if (this.audioChunkCount <= 3) {
            console.log(`  [${this.config.name}] RTP audio chunk #${this.audioChunkCount}: ${b64.length} chars`);
          }
          this.emit('audio', {
            agentId: this.config.id,
            audio: b64,
          });
        });

        track.onReceiveRtp.subscribe((rtp) => {
          this.frameStats.binary++;
          this.audioDecoder?.feed(rtp.payload);
        });
      } else if (kind === 'video') {
        this.videoDecoder = new VideoDecoder();
        this.videoDecoder.start();

        this.videoDecoder.on('frame', (b64: string) => {
          this.frameStats.video++;
          this.emit('video_frame', {
            agentId: this.config.id,
            frame: b64,
          });
        });

        track.onReceiveRtp.subscribe((rtp) => {
          this.videoDecoder?.feed(rtp.payload);
        });
      }
    });
  }

  // ─── Event Handling (SAME logic as OmniagentConnection) ──────────────

  private handleEvent(event: any) {
    const eventType = event.event || event.type;

    switch (eventType) {
      case 'message_received':
        this.handleMessageReceived(event.data);
        break;
      case 'talk_state_changed':
        console.log(`  [${this.config.name}] talk: ${event.data?.state || JSON.stringify(event.data).slice(0, 100)}`);
        this.emit('talk_state', event.data);
        break;
      case 'avatar_state_changed':
        console.log(`  [${this.config.name}] avatar: ${event.data?.state}`);
        this.emit('avatar_state', event.data);
        break;
      case 'audio_received': {
        // Backup: audio via data channel instead of RTP
        this.frameStats.audioJson++;
        const audioB64 = event.data?.data || event.data?.audio;
        if (audioB64) {
          this.audioChunkCount++;
          if (this.audioChunkCount <= 3) {
            console.log(`  [${this.config.name}] audio chunk #${this.audioChunkCount}: ${audioB64.length} chars`);
          }
          this.emit('audio', {
            agentId: this.config.id,
            audio: audioB64,
          });
        }
        break;
      }
      default:
        if (eventType) console.log(`  [${this.config.name}] unknown event: ${eventType}`);
        break;
    }
  }

  private handleMessageReceived(data: any) {
    const msg = data.message || data;

    // Log all assistant messages for debugging
    if (msg.role === 'assistant') {
      if (msg.action === 'created') {
        console.log(`  [${this.config.name}] assistant created: item=${msg.item_id || 'none'} resp=${msg.response_id || 'none'}`);
      } else if (msg.action === 'delta') {
        const key = msg.item_id || 'unknown';
        if (!this.responseBuffer.has(key) || this.responseBuffer.get(key) === '') {
          console.log(`  [${this.config.name}] first delta: "${(msg.content || '').slice(0, 60)}"`);
        }
      } else if (msg.action === 'completed') {
        console.log(`  [${this.config.name}] assistant completed: item=${msg.item_id} content=${(msg.content || '').slice(0, 80)}`);
      } else {
        console.log(`  [${this.config.name}] assistant ${msg.action}: ${JSON.stringify(msg).slice(0, 150)}`);
      }
    }

    if (msg.role === 'assistant') {
      if (msg.action === 'created' && msg.item_id) {
        this.responseBuffer.set(msg.item_id, '');
        this.emit('response_start', { itemId: msg.item_id });
      } else if (msg.action === 'delta' && msg.item_id && msg.content) {
        const current = this.responseBuffer.get(msg.item_id) || '';
        this.responseBuffer.set(msg.item_id, current + msg.content);
        this.emit('response_delta', { itemId: msg.item_id, content: msg.content });
      } else if (msg.action === 'completed' && msg.item_id) {
        const fullText = this.responseBuffer.get(msg.item_id) || msg.content || '';
        this.responseBuffer.delete(msg.item_id);
        if (fullText) {
          console.log(`  [${this.config.name}] SPEECH_END: "${fullText.slice(0, 100)}"`);
          this.emit('speech_end', {
            agentId: this.config.id,
            agentName: this.config.name,
            text: fullText,
            timestamp: Date.now(),
          });
        } else {
          console.warn(`  [${this.config.name}] completed but buffer empty for ${msg.item_id}`);
        }
      }
    }
  }

  // ─── Public API (same as OmniagentConnection) ───────────────────────

  sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
    const payload = JSON.stringify({
      type: 'send_message',
      data: { role, text, trigger_response: triggerResponse },
    });
    console.log(`  [${this.config.name}] Sending: role=${role} trigger=${triggerResponse} text="${text.slice(0, 80)}..."`);
    this.sendCommand(payload);
  }

  updateSettings(instructions: string) {
    const payload = JSON.stringify({
      type: 'set_settings',
      data: {
        instructions,
        turn_detection: {
          threshold: 0.9,
          silence_duration_ms: 2000,
        },
      },
    });
    this.sendCommand(payload);
  }

  /**
   * Send a command to the Napster server via data channel.
   * send_message and send_audio work via DC.
   * set_settings does NOT work via DC ("Modalitites other than video are not supported").
   * Instructions must be set at agent creation time via providerSettings.
   */
  private sendCommand(json: string) {
    if (this.dcReady && this.dc) {
      this.dc.send(json);
      return;
    }
    console.warn(`  [${this.config.name}] Cannot send command - data channel not ready`);
  }

  disconnect() {
    this.shouldReconnect = false;

    // Stop decoders
    if (this.audioDecoder) {
      this.audioDecoder.stop();
      this.audioDecoder = null;
    }
    if (this.videoDecoder) {
      this.videoDecoder.stop();
      this.videoDecoder = null;
    }

    // Close data channel
    if (this.dc) {
      try { this.dc.close(); } catch { /* ignore */ }
      this.dc = null;
      this.dcReady = false;
    }

    // Close signaling WebSocket
    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
    }

    // Close peer connection
    if (this.pc) {
      this.pc.close().catch(() => { /* ignore */ });
      this.pc = null;
    }
  }

  // ─── Reconnect (same exponential backoff as OmniagentConnection) ────

  private attemptReconnect() {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error(`  [${this.config.name}] Max reconnect attempts (${this.maxReconnectAttempts}) reached - agent is dead`);
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(2000 * this.reconnectAttempts, 10000);
    console.log(`  [${this.config.name}] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        // Clean up old connection before reconnecting
        this.cleanupForReconnect();
        await this.connect();
        console.log(`  [${this.config.name}] Reconnected successfully`);
        this.reconnectAttempts = 0;
        this.emit('reconnected');
      } catch (err) {
        console.error(`  [${this.config.name}] Reconnect failed:`, (err as Error).message);
        this.attemptReconnect();
      }
    }, delay);
  }

  private cleanupForReconnect() {
    // Stop decoders without disabling reconnect
    if (this.audioDecoder) {
      this.audioDecoder.stop();
      this.audioDecoder = null;
    }
    if (this.videoDecoder) {
      this.videoDecoder.stop();
      this.videoDecoder = null;
    }

    if (this.dc) {
      try { this.dc.close(); } catch { /* ignore */ }
      this.dc = null;
      this.dcReady = false;
    }

    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
    }

    if (this.pc) {
      this.pc.close().catch(() => { /* ignore */ });
      this.pc = null;
    }
  }
}
