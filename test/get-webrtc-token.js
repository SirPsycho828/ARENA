// Quick test: Create a Napster agent + WebRTC connection, print the token
// Usage: node test/get-webrtc-token.js

const API_KEY = process.env.OMNIAGENT_API_KEY || 'REDACTED_API_KEY';
const BASE = 'https://companion-api.napster.com';

async function main() {
  // 1. Get a stock companion
  console.log('Fetching stock companions...');
  const compRes = await fetch(`${BASE}/public/companions/napster-stock?pageSize=1`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  if (!compRes.ok) throw new Error(`Companions: ${compRes.status} ${await compRes.text()}`);
  const compData = await compRes.json();
  const companionId = compData.items[0].id;
  console.log(`Using companion: ${companionId}`);

  // 2. Create an agent
  console.log('Creating agent...');
  const agentRes = await fetch(`${BASE}/public/agents`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companionId,
      name: 'WebRTC Token Test',
      voiceId: 'alloy',
      providerSettings: { temperature: 0.7 },
    }),
  });
  if (!agentRes.ok) throw new Error(`Agent: ${agentRes.status} ${await agentRes.text()}`);
  const agent = await agentRes.json();
  console.log(`Agent created: ${agent.id}`);

  // 3. Create WebRTC connection
  console.log('Creating WebRTC connection...');
  const connRes = await fetch(`${BASE}/public/agents/${agent.id}/connections`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'webrtc',
      externalClientId: 'tokentest01',
    }),
  });
  if (!connRes.ok) throw new Error(`Connection: ${connRes.status} ${await connRes.text()}`);
  const conn = await connRes.json();

  console.log('\n========== TOKEN ==========');
  console.log(conn.token);
  console.log('===========================\n');
  console.log(`Connection ID: ${conn.connection?.id || 'N/A'}`);
  console.log(`Agent ID: ${agent.id} (delete later: curl -X DELETE ${BASE}/public/agents/${agent.id} -H "X-Api-Key: $OMNIAGENT_API_KEY")`);
  console.log('\nPaste this token into BOTH browser tabs at: http://localhost:5174/test/webrtc-token-test.html');
}

main().catch(console.error);
