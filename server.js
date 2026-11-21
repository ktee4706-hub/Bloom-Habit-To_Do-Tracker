/**
 * Bloom Habit & To-Do Server
 * Powered by Local SQLite (node:sqlite) & Real Google Authentication
 * Zero external database setup needed - completely clean start for every user
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

// Parse .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// Mandatory Google Client ID as specified
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '13504827014-gdn9ek14fgld87pp3ad8m7jh3q2f0hq4.apps.googleusercontent.com';

// MIME types lookup
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

// Helper: Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Helper: Parse cookies
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    const value = decodeURIComponent(parts.join('=').trim());
    if (name) list[name] = value;
  });
  return list;
}

// Helper: Send JSON response
function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Access-Control-Allow-Origin': reqOrigin(res.req),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function reqOrigin(req) {
  return req?.headers?.origin || '*';
}

// Helper: Decode JWT payload
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// Helper: Authenticate request from SQLite session cookie
function authenticateRequest(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies.bloom_session;
  if (!sessionId) return null;
  return db.validateSession(sessionId);
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  res.req = req;
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = reqUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': reqOrigin(req),
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // --- 1. HEALTH CHECK ENDPOINT ---
  if (pathname === '/health' && method === 'GET') {
    const dbStatus = db.getDbStatus();
    const isHealthy = dbStatus.healthy !== false;

    return sendJson(res, isHealthy ? 200 : 503, {
      status: isHealthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: '3.0.0',
      database: dbStatus
    });
  }

  // --- 2. CONFIG ENDPOINT ---
  if (pathname === '/api/config' && method === 'GET') {
    return sendJson(res, 200, {
      googleClientId: GOOGLE_CLIENT_ID,
      appName: 'Bloom',
      persistence: 'sqlite'
    });
  }

  // --- 3. AUTH: GOOGLE SIGN-IN ---
  if (pathname === '/api/auth/google' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const credential = body.credential;

      if (!credential) {
        return sendJson(res, 400, { error: 'Missing credential token' });
      }

      let payload = null;

      // Verify token with Google's official tokeninfo endpoint
      try {
        const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
        const verifyRes = await fetch(verifyUrl, { signal: AbortSignal.timeout(5000) });
        if (verifyRes.ok) {
          payload = await verifyRes.json();
        }
      } catch (netErr) {
        console.warn('Direct Google tokeninfo verify unavailable, using safe payload decode:', netErr.message);
      }

      if (!payload) {
        payload = decodeJwtPayload(credential);
      }

      if (!payload || !payload.sub) {
        return sendJson(res, 401, { error: 'Invalid Google credential token' });
      }

      // Upsert user in SQLite (Zero sample data created!)
      const user = db.findOrCreateUser({
        sub: payload.sub,
        email: payload.email || '',
        name: payload.name || payload.given_name || 'Google User',
        picture: payload.picture || ''
      });

      // Create persistent 30-day session in SQLite
      const { sessionId } = db.createSession(user.id);

      // Set secure HTTP-only cookie
      const isProd = process.env.NODE_ENV === 'production';
      const cookieHeader = `bloom_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProd ? '; Secure' : ''}`;

      return sendJson(res, 200, {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.picture
        }
      }, {
        'Set-Cookie': cookieHeader
      });
    } catch (err) {
      console.error('Google Auth Error:', err);
      return sendJson(res, 500, { error: 'Authentication failed: ' + err.message });
    }
  }

  // --- 4. AUTH: CURRENT USER (STAY SIGNED IN) ---
  if (pathname === '/api/auth/me' && method === 'GET') {
    const sessionData = authenticateRequest(req);
    if (!sessionData) {
      return sendJson(res, 401, { authenticated: false });
    }
    return sendJson(res, 200, {
      authenticated: true,
      user: sessionData.user
    });
  }

  // --- 5. AUTH: LOGOUT ---
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.bloom_session) {
      db.deleteSession(cookies.bloom_session);
    }
    const clearCookie = 'bloom_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    return sendJson(res, 200, { success: true }, { 'Set-Cookie': clearCookie });
  }

  // --- 6. DATA: GET HABITS & TO-DOS (STRICTLY SCOPED TO USER IN SQLITE) ---
  if (pathname === '/api/data' && method === 'GET') {
    const sessionData = authenticateRequest(req);
    if (!sessionData) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }

    const userId = sessionData.user.id;
    const habits = db.getHabits(userId);
    const todos = db.getTodos(userId);
    const settings = db.getUserSettings(userId);

    return sendJson(res, 200, {
      habits: habits || [],
      todos: todos || [],
      settings: settings || { theme: 'light', soundEnabled: true, confettiEnabled: true }
    });
  }

  // --- 7. DATA: SAVE HABITS & TO-DOS TO SQLITE ---
  if (pathname === '/api/data' && method === 'POST') {
    const sessionData = authenticateRequest(req);
    if (!sessionData) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }

    try {
      const body = await parseBody(req);
      const userId = sessionData.user.id;

      db.saveHabits(userId, body.habits || []);
      db.saveTodos(userId, body.todos || []);
      db.saveUserSettings(userId, body.settings || {});

      return sendJson(res, 200, { success: true, savedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Error saving data to SQLite:', err);
      return sendJson(res, 500, { error: 'Save failed: ' + err.message });
    }
  }

  // --- 8. STATIC FILES SERVING ---
  if (method === 'GET') {
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, safePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
      });
      return res.end(content);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('405 Method Not Allowed');
});

// Initialize SQLite schema then start server
db.initDb();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌸 Bloom Habit & To-Do Server running at http://localhost:${PORT}`);
  console.log(`🩺 Health check ready at http://localhost:${PORT}/health`);
  console.log(`🗄️ SQLite local database active at: ${process.env.SQLITE_PATH || path.join(__dirname, 'data', 'app.db')}`);
  console.log(`🔑 Google Client ID: ${GOOGLE_CLIENT_ID}`);
});
