/**
 * ARENA PoC - Dev Server
 *
 * Serves the browser test page and proxies API calls
 * (keeps API key server-side).
 *
 * Run: node server.js
 * Then open: http://localhost:3000
 */

import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const API_BASE = 'https://companion-api.napster.com';
const API_KEY = process.env.NAPSTER_API_KEY;

app.use(express.json());
app.use(express.static(__dirname));

// Proxy: Create a WebRTC connection for a given agent
app.post('/api/connect/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { externalClientId } = req.body;

    const body = { channelType: 'webrtc' };
    if (externalClientId) body.externalClientId = externalClientId;

    const response = await fetch(`${API_BASE}/public/agents/${agentId}/connections`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: List stock companions
app.get('/api/companions', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/public/companions/napster-stock`, {
      headers: { 'X-Api-Key': API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: Create an agent
app.post('/api/agents', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/public/agents`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: List agents
app.get('/api/agents', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/public/agents`, {
      headers: { 'X-Api-Key': API_KEY },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Proxy: Delete agent
app.delete('/api/agents/:agentId', async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/public/agents/${req.params.agentId}`, {
      method: 'DELETE',
      headers: { 'X-Api-Key': API_KEY },
    });
    if (response.status === 204) return res.status(204).end();
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ARENA PoC Server running at http://localhost:${PORT}`);
  console.log(`  API Key: ${API_KEY?.substring(0, 15)}...`);
  console.log(`\n  Open the browser to test SDK widgets.\n`);
});
