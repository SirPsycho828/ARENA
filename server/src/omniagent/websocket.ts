import { EventEmitter } from 'events';
import WebSocket from 'ws';

const API_BASE = 'https://companion-api.napster.com';

/**
 * Direct WebSocket connection to a Napster Omniagent.
 * Emits the same events as MockOmniagentConnection so SessionManager
 * can wire them identically via wireAgentEvents().
 */
export class WebSocketAgentConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private agentId: string;
  private agentName: string;
  private apiKey: string;
  private connected = false;
  public lastActivityAt: number = Date.now();
  private responseBuffer: Map<string, string> = new Map();

  constructor(agentId: string, agentName: string, apiKey: string) {
    super();
    this.agentId = agentId;
    this.agentName = agentName;
    this.apiKey = apiKey;
  }

  get id() { return this.agentId; }
  get name() { return this.agentName; }

  isAlive(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    // 1. Create WebSocket connection via Napster API
    const res = await fetch(`${API_BASE}/public/agents/${this.agentId}/connections`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelType: 'websocket' }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Connection API ${res.status}: ${errBody.substring(0, 200)}`);
    }

    const { token } = await res.json() as { token: string };

    // 2. Decode base64 token → { url, authToken }
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { url, authToken } = decoded;

    // 3. Open WebSocket
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout (15s)')), 15000);

      this.ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.lastActivityAt = Date.now();
        console.log(`  [WS ${this.agentName}] Connected`);

        // Prime audio channel with 100ms of silence (16kHz, 16-bit mono = 3200 bytes)
        const silence = Buffer.alloc(3200, 0).toString('base64');
        this.ws!.send(JSON.stringify({ type: 'send_audio', data: { audio: silence } }));

        resolve();
      });

      this.ws.on('message', (raw) => {
        this.lastActivityAt = Date.now();
        try {
          const event = JSON.parse(raw.toString());
          this.handleEvent(event);
        } catch { /* ignore parse errors */ }
      });

      this.ws.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (wasConnected) {
          console.log(`  [WS ${this.agentName}] Disconnected`);
          this.emit('disconnected');
        }
      });

      this.ws.on('error', (err) => {
        console.error(`  [WS ${this.agentName}] Error:`, (err as Error).message);
        if (!this.connected) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  private handleEvent(event: any) {
    // Napster uses event.event for the event type (not event.type)
    const eventType = event.event || event.type;
    const data = event.data || {};

    switch (eventType) {
      case 'message_received': {
        // Messages nested: data.message.{role, action, item_id, content}
        const msg = data.message || data;
        if (msg.role !== 'assistant') return;

        const itemId = msg.item_id || '';
        const action = msg.action;
        const content = msg.content || '';

        if (action === 'created') {
          // Response start — emit on first created event
          this.emit('response_start', { itemId });
          this.responseBuffer.set(itemId, '');
        } else if (action === 'delta') {
          const prev = this.responseBuffer.get(itemId) || '';
          this.responseBuffer.set(itemId, prev + content);
          this.emit('response_delta', { itemId, content });
        } else if (action === 'completed') {
          const fullText = content || this.responseBuffer.get(itemId) || '';
          this.responseBuffer.delete(itemId);
          this.emit('speech_end', {
            agentId: this.agentId,
            agentName: this.agentName,
            text: fullText,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'talk_state_changed': {
        const state = data.state || data.talk_state;
        if (state) this.emit('talk_state', { state });
        break;
      }

      case 'audio_received': {
        const audioData = data.audio;
        if (audioData) {
          this.emit('audio_data', { audio: audioData });
        }
        break;
      }

      case 'function_call': {
        this.emit('tool_effect', {
          agentId: this.agentId,
          agentName: this.agentName,
          toolName: data.name || data.function_name || '',
          args: data.arguments || data.args || {},
          callId: data.call_id || data.id || '',
        });
        break;
      }
    }
  }

  sendMessage(role: 'user' | 'system', text: string, triggerResponse = true) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`  [WS ${this.agentName}] Cannot send — not connected`);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'send_message',
      data: { role, text, trigger_response: triggerResponse, delay: false },
    }));
  }

  updateSettings(instructions: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'set_settings',
      data: { instructions },
    }));
  }

  disconnect() {
    this.connected = false;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
