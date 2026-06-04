import puppeteer, { type Browser, type Page } from 'puppeteer';

interface HostAgent {
  id: string;
  name: string;
  token: string; // Napster WebRTC token
  livekitToken?: string; // Per-agent LiveKit publisher token
}

interface AvatarHostCallbacks {
  onSpeechDelta: (agentId: string, text: string) => void;
  onSpeechEnd: (agentId: string, fullText: string) => void;
  onTalkState: (agentId: string, state: string) => void;
  onResponseStart: (agentId: string) => void;
  onToolEffect: (agentId: string, toolName: string, argsJson: string, callId: string) => void;
  onHostReady: () => void;
}

export class AvatarHost {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private ready = false;

  async launch(
    agents: HostAgent[],
    livekitUrl: string,
    livekitToken: string,
    serverPort: number,
    callbacks: AvatarHostCallbacks,
  ): Promise<void> {
    // Use headed mode when DISPLAY is set (Xvfb in Docker) — gives a real
    // compositor so captureStream() produces video frames. Headless locally.
    const hasDisplay = !!process.env.DISPLAY;
    console.log(`[AvatarHost] Launching Chrome (headed=${hasDisplay}, DISPLAY=${process.env.DISPLAY || 'none'})...`);

    this.browser = await puppeteer.launch({
      headless: !hasDisplay,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies',
        '--use-gl=swiftshader',
        '--enable-gpu',
        '--ignore-gpu-blocklist',
      ],
      protocolTimeout: 180000,
    });

    this.page = await this.browser.newPage();

    // Log ALL browser console to server console (don't filter — we need LiveKit errors)
    this.page.on('console', (msg) => {
      const text = msg.text();
      const level = msg.type(); // 'log', 'warn', 'error', etc.
      if (level === 'error') {
        console.error(`  [Chrome] ${text}`);
      } else {
        console.log(`  [Chrome] ${text}`);
      }
    });

    this.page.on('pageerror', (err) => {
      console.error('[AvatarHost] Page error:', String(err));
    });

    // Expose callback functions BEFORE navigating
    const readyPromise = new Promise<void>((resolve) => {
      callbacks.onHostReady = resolve;
    });

    await this.page.exposeFunction('__onSpeechDelta', callbacks.onSpeechDelta);
    await this.page.exposeFunction('__onSpeechEnd', callbacks.onSpeechEnd);
    await this.page.exposeFunction('__onTalkState', callbacks.onTalkState);
    await this.page.exposeFunction('__onResponseStart', callbacks.onResponseStart);
    await this.page.exposeFunction('__onToolEffect', callbacks.onToolEffect);
    await this.page.exposeFunction('__onHostReady', () => {
      this.ready = true;
      callbacks.onHostReady();
    });

    // Navigate to host page
    const url = `http://localhost:${serverPort}/avatar-host/page.html`;
    console.log(`[AvatarHost] Loading ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the ES module to load (defines window.initHost)
    await this.page.waitForFunction('typeof window.initHost === "function"', { timeout: 30000 });

    // Initialize with agent tokens and LiveKit config (per-agent LiveKit tokens)
    const config = {
      agents: agents.map(a => ({ id: a.id, name: a.name, token: a.token, livekitToken: a.livekitToken })),
      livekit: { url: livekitUrl },
    };

    console.log('[AvatarHost] Calling initHost...');
    await this.page.evaluate((cfg) => (window as any).initHost(cfg), config);

    // Wait for avatars to be ready (90s max — page.html uses 45s per avatar)
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('AvatarHost readyPromise timed out after 90s')), 90000),
    );
    try {
      await Promise.race([readyPromise, timeout]);
      console.log('[AvatarHost] Host is ready!');
    } catch (err) {
      console.error('[AvatarHost]', (err as Error).message, '— proceeding anyway');
      this.ready = true;
    }
  }

  async sendMessage(agentId: string, role: string, text: string, triggerResponse: boolean): Promise<void> {
    if (!this.page || !this.ready) {
      console.warn(`[AvatarHost] Cannot send — not ready`);
      return;
    }
    await this.page.evaluate(
      (id, r, t, tr) => (window as any).sendToAvatar(id, r, t, tr),
      agentId, role, text, triggerResponse,
    );
  }

  async stopSpeaking(agentId: string): Promise<void> {
    if (!this.page || !this.ready) return;
    await this.page.evaluate(
      (id) => (window as any).stopAvatar(id),
      agentId,
    );
  }

  isReady(): boolean {
    return this.ready;
  }

  async shutdown(): Promise<void> {
    console.log('[AvatarHost] Shutting down...');
    this.ready = false;
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
