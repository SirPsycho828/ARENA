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
  private _eventCount = 0;

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
        clearTimeout(timeout);
        resolve();
      });

      this.ws!.on('message', (raw) => {
        try {
          const event = JSON.parse(raw.toString());
          // Log first 5 raw events to discover actual structure
          if (!this._eventCount) this._eventCount = 0;
          if (this._eventCount < 5) {
            console.log(`  [${this.config.name}] RAW EVENT:`, JSON.stringify(event).slice(0, 300));
            this._eventCount++;
          }
          this.handleEvent(event);
        } catch {
          // Binary audio data — ignore for orchestration
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

  private handleEvent(event: any) {
    const eventType = event.event || event.type;

    switch (eventType) {
      case 'message_received':
        this.handleMessageReceived(event.data);
        break;
      case 'talk_state_changed':
        this.emit('talk_state', event.data);
        break;
      case 'avatar_state_changed':
        this.emit('avatar_state', event.data);
        break;
    }
  }

  private handleMessageReceived(data: any) {
    const msg = data.message || data;

    if (msg.role === 'assistant') {
      if (msg.action === 'created' && msg.item_id) {
        this.responseBuffer.set(msg.item_id, '');
        this.emit('response_start', { itemId: msg.item_id });
      } else if (msg.action === 'delta' && msg.item_id && msg.content) {
        const current = this.responseBuffer.get(msg.item_id) || '';
        this.responseBuffer.set(msg.item_id, current + msg.content);
        this.emit('response_delta', { itemId: msg.item_id, content: msg.content });
      } else if (msg.action === 'completed' && msg.item_id) {
        const fullText = this.responseBuffer.get(msg.item_id) || '';
        this.responseBuffer.delete(msg.item_id);
        if (fullText) {
          this.emit('speech_end', {
            agentId: this.config.id,
            agentName: this.config.name,
            text: fullText,
            timestamp: Date.now(),
          });
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
      data: { instructions },
    }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
