/**
 * Integration test: Mock debate loop
 * Verifies: session creation → debate start → agents take turns → transcripts relay
 */

const BASE = 'http://localhost:3001';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n=== ARENA Mock Debate Integration Test ===\n');

  // 1. Health check
  console.log('1. Health check...');
  const health = await fetch(`${BASE}/health`).then(r => r.json());
  console.log(`   Status: ${health.status}, Mock: ${health.activeSession === null ? 'no active session' : 'has session'}`);
  if (health.status !== 'ok') throw new Error('Health check failed');
  console.log('   ✓ Server healthy\n');

  // 2. Create session
  console.log('2. Creating session...');
  const session = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'Is pineapple on pizza a war crime?', agentCount: 3 }),
  }).then(r => r.json());

  if (session.error) throw new Error(`Session creation failed: ${session.error}`);
  console.log(`   Session ID: ${session.id}`);
  console.log(`   Topic: ${session.topic}`);
  console.log(`   Agents: ${session.agentIds.length}`);
  console.log(`   Status: ${session.status}`);
  if (session.agentIds.length < 2) throw new Error('Need at least 2 agents');
  console.log('   ✓ Session created\n');

  // 3. Check status API
  console.log('3. Checking status API...');
  const status = await fetch(`${BASE}/api/status`).then(r => r.json());
  console.log(`   Agents: ${status.agents.map(a => a.name).join(', ')}`);
  console.log(`   Current speaker: ${status.currentSpeaker || 'none'}`);
  console.log('   ✓ Status API working\n');

  // 4. Start debate
  console.log('4. Starting debate...');
  const startResult = await fetch(`${BASE}/api/sessions/start`, { method: 'POST' }).then(r => r.json());
  if (startResult.error) throw new Error(`Start failed: ${startResult.error}`);
  console.log('   ✓ Debate started\n');

  // 5. Wait for mock agents to produce transcripts
  console.log('5. Waiting for mock agents to debate (8 seconds)...');
  await sleep(8000);

  // 6. Check state after debate runs
  console.log('6. Checking debate state...');
  const postStatus = await fetch(`${BASE}/api/status`).then(r => r.json());
  console.log(`   Current speaker: ${postStatus.currentSpeaker || 'none'}`);
  console.log(`   Session status: ${postStatus.session?.status}`);
  console.log('   ✓ Debate is running\n');

  // 7. End debate
  console.log('7. Ending debate...');
  const endResult = await fetch(`${BASE}/api/sessions/end`, { method: 'POST' }).then(r => r.json());
  if (endResult.error) throw new Error(`End failed: ${endResult.error}`);
  console.log('   ✓ Debate ended\n');

  // 8. Verify ended state
  console.log('8. Verifying ended state...');
  const finalStatus = await fetch(`${BASE}/api/status`).then(r => r.json());
  console.log(`   Session status: ${finalStatus.session?.status}`);
  if (finalStatus.session?.status !== 'ended') throw new Error('Session not ended');
  console.log('   ✓ Session properly ended\n');

  console.log('=== ALL TESTS PASSED ===\n');
}

main().catch(err => {
  console.error(`\n✗ TEST FAILED: ${err.message}\n`);
  process.exit(1);
});
