const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('Spawning Bloom server with local SQLite persistence...');
  const child = spawn(process.execPath, ['server.js'], { stdio: 'inherit' });

  // Wait 1.5s for server to start
  await new Promise(r => setTimeout(r, 1500));

  try {
    console.log('\n--- 1. Testing GET /health ---');
    const healthRes = await fetch('http://localhost:3000/health');
    const healthJson = await healthRes.json();
    console.log('Status:', healthRes.status);
    console.log('Response:', JSON.stringify(healthJson, null, 2));

    if (healthJson.database.engine !== 'SQLite' || healthJson.database.status !== 'connected') {
      throw new Error('SQLite database not reported as connected in /health');
    }

    console.log('\n--- 2. Checking SQLite Database File on Disk ---');
    const dbPath = path.join(__dirname, 'data', 'app.db');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Expected SQLite database file at ${dbPath}`);
    }
    console.log(`✅ SQLite file verified on disk: ${dbPath} (${fs.statSync(dbPath).size} bytes)`);

    console.log('\n--- 3. Testing GET /api/config ---');
    const configRes = await fetch('http://localhost:3000/api/config');
    const configJson = await configRes.json();
    console.log('Status:', configRes.status);
    console.log('Configured Google Client ID:', configJson.googleClientId);
    if (configJson.googleClientId !== '13504827014-gdn9ek14fgld87pp3ad8m7jh3q2f0hq4.apps.googleusercontent.com') {
      throw new Error('Google Client ID mismatch');
    }

    console.log('\n--- 4. Testing GET /api/auth/me (Unauthenticated) ---');
    const meRes = await fetch('http://localhost:3000/api/auth/me');
    console.log('Status:', meRes.status, '(Expected 401 Unauthorized)');
    if (meRes.status !== 401) {
      throw new Error('Expected 401 for unauthenticated session');
    }

    console.log('\n--- 5. Testing GET /api/data (Protected - Unauthenticated) ---');
    const dataRes = await fetch('http://localhost:3000/api/data');
    console.log('Status:', dataRes.status, '(Expected 401 Unauthorized)');
    if (dataRes.status !== 401) {
      throw new Error('Expected 401 for protected data route');
    }

    console.log('\n--- 6. Testing GET / (Landing Screen Shell) ---');
    const indexRes = await fetch('http://localhost:3000/');
    const indexText = await indexRes.text();
    console.log('Status:', indexRes.status);
    console.log('Contains landing screen elements:', indexText.includes('unauth-landing-screen'));
    console.log('Zero sample habits seeded:', !indexText.includes('Drink 2L Water'));

    console.log('\n✅ ALL SQLITE & STANDALONE ARCHITECTURE CHECKS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
}

test();
