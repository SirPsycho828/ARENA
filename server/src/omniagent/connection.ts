import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { AgentConfig, AgentConnection, MessageReceivedEvent } from '../../../shared/types.js';

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY!;

interface TokenPayload {
  url: string;
  token?: string;
  authToken?: string;
  connection: { id: string };
  expiresAt: string;
}

export class OmniagentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: AgentConfig;
  private connectionId: string | null = null;
  private responseBuffer: Map<string, string> = new Map();
  private audioChunkCount = 0;
  private frameStats = { json: 0, binary: 0, audioJson: 0, total: 0 };

  constructor(config: AgentConfig) {
    super();
    this.config = config;
  }

  get id() { return this.config.id; }
  get name() { return this.config.name; }

  async connect(): Promise<void> {
    // Create WebSocket connection via API
    const res = await fetch(`${API_BASE}/public/agents/${this.config.id}/connections`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: 'websocket',
        externalClientId: this.config.externalClientId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create connection for ${this.config.name}: ${res.status} ${err}`);
    }

    const data = await res.json();
    const decoded: TokenPayload = JSON.parse(
      Buffer.from(data.token, 'base64').toString('utf-8')
    );

    this.connectionId = decoded.connection.id;
    const wsUrl = decoded.url;
    const authToken = decoded.authToken || decoded.token;

    // Open WebSocket with auth header
    this.ws = new WebSocket(wsUrl, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);

      this.ws!.on('open', () => {
        console.log(`  [${this.config.name}] WebSocket connected`);
        // Override stock companion instructions with our debate persona
        if (this.config.systemPrompt) {
          this.updateSettings(this.config.systemPrompt);
          console.log(`  [${this.config.name}] Sent set_settings to override companion instructions`);
        }
        // Prime the audio channel by sending a short silent audio chunk.
        // Without this, text-only send_message won't trigger audio_received events.
        // 16-bit PCM, 16kHz, mono — 1600 samples = 100ms of silence
        const silence = Buffer.alloc(3200); // 1600 samples * 2 bytes each
        this.ws!.send(JSON.stringify({
          type: 'send_audio',
          data: { data: silence.toString('base64') },
        }));
        console.log(`  [${this.config.name}] Sent silent audio to prime audio channel`);
        clearTimeout(timeout);
        resolve();
      });

      this.ws!.on('message', (raw, isBinary) => {
        this.frameStats.total++;
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as any);

        // Log first 10 frames fully to understand the protocol
        if (this.frameStats.total <= 10) {
          const preview = isBinary
            ? `BINARY ${buf.length}b first4=[${buf.slice(0, 4).toString('hex')}]`
            : `TEXT ${buf.length}b: ${buf.toString('utf-8').slice(0, 200)}`;
          console.log(`  [${this.config.name}] FRAME #${this.frameStats.total} (isBinary=${isBinary}): ${preview}`);
        }

        // Log stats every 50 frames
        if (this.frameStats.total % 50 === 0) {
          console.log(`  [${this.config.name}] FRAME STATS: ${JSON.stringify(this.frameStats)}`);
        }

        // Binary frames = raw PCM audio
        if (isBinary) {
          this.frameStats.binary++;
          this.emit('audio', {
            agentId: this.config.id,
            audio: buf.toString('base64'),
          });
          return;
        }

        // Text frames = JSON events
        try {
          const event = JSON.parse(buf.toString('utf-8'));
          this.frameStats.json++;
          this.handleEvent(event);
        } catch {
          // Non-JSON text frame — might be audio in unexpected format
          this.frameStats.binary++;
          console.log(`  [${this.config.name}] non-JSON text frame: ${buf.length}b`);
        }
      });

      this.ws!.on('error', (err) => {
        console.error(`  [${this.config.name}] WS error:`, err.message);
        this.emit('error', err);
        clearTimeout(timeout);
        reject(err);
      });

      this.ws!.on('close', (code) => {
        console.log(`  [${this.config.name}] WS closed: ${code}`);
        this.emit('disconnected', code);
      });
    });
  }

  private isJsonBuffer(buf: Buffer): boolean {
    if (buf.length === 0) return false;
    const first = buf[0];
    // JSON starts with { (0x7B) or [ (0x5B)
    return first === 0x7B || first === 0x5B;
  }

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
        // Napster sends audio as event.data.data (base64 PCM 16-bit 16kHz mono)
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
        // Log unknown event types for debugging
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
        // Log first delta per item to confirm text is flowing
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

  sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`  [${this.config.name}] Cannot send — WS state: ${this.ws?.readyState ?? 'null'}`);
      return;
    }

    const payload = {
      type: 'send_message',
      data: { role, text, trigger_response: triggerResponse },
    };
    console.log(`  [${this.config.name}] Sending: role=${role} trigger=${triggerResponse} text="${text.slice(0, 80)}..."`);
    this.ws.send(JSON.stringify(payload));
  }

  updateSettings(instructions: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: 'set_settings',
      data: {
        instructions,
        // High silence threshold so agent doesn't self-trigger from silence priming
        turn_detection: {
          threshold: 0.9,
          silence_duration_ms: 2000,
        },
      },
    }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
