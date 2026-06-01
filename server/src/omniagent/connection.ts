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
        clearTimeout(timeout);
        resolve();
      });

      this.ws!.on('message', (raw) => {
        try {
          const event = JSON.parse(raw.toString());
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
        console.log(`  [${this.config.name}] talk: ${event.data?.state || JSON.stringify(event.data).slice(0, 100)}`);
        this.emit('talk_state', event.data);
        break;
      case 'avatar_state_changed':
        console.log(`  [${this.config.name}] avatar: ${event.data?.state}`);
        this.emit('avatar_state', event.data);
        break;
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
