import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { AgentConfig, AgentConnection, MessageReceivedEvent } from '../../../shared/types.js';

const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.OMNIAGENT_API_KEY!;

interface TokenPayload {
  url: string;
  token: string;
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

    // Open WebSocket
    this.ws = new WebSocket(wsUrl);

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

  private handleEvent(event: { type: string; data: any }) {
    switch (event.type) {
      case 'message_received':
        this.handleMessageReceived(event.data as MessageReceivedEvent);
        break;
      case 'talk_state_changed':
        this.emit('talk_state', event.data);
        break;
      case 'avatar_state_changed':
        this.emit('avatar_state', event.data);
        break;
    }
  }

  private handleMessageReceived(data: MessageReceivedEvent) {
    const { message } = data;

    if (message.role === 'assistant') {
      if (message.action === 'created' && message.item_id) {
        // New response starting — init buffer
        this.responseBuffer.set(message.item_id, '');
        this.emit('response_start', { itemId: message.item_id });
      } else if (message.action === 'delta' && message.item_id && message.content) {
        // Streaming content chunk
        const current = this.responseBuffer.get(message.item_id) || '';
        this.responseBuffer.set(message.item_id, current + message.content);
        this.emit('response_delta', { itemId: message.item_id, content: message.content });
      } else if (message.action === 'completed' && message.item_id) {
        // Response complete — emit full transcript
        const fullText = this.responseBuffer.get(message.item_id) || '';
        this.responseBuffer.delete(message.item_id);
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
      console.warn(`  [${this.config.name}] Cannot send — not connected`);
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'send_message',
      data: { role, text, trigger_response: triggerResponse },
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
