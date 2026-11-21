# 🌸 Bloom — Calm Habits & To-Dos (SQLite & Standalone Mode)

A clean, smooth, cute, and unlimited Habit Tracker & To-Do List web application with **zero sample data** (starts completely empty), **local SQLite persistence**, and **Mandatory Google Sign-In** when hosted.

Designed to work in two flexible modes:
1. **Direct Standalone Mode (`index.html`)**: Double-click and open directly in any browser with **zero server** required!
2. **Server Mode with SQLite (`node server.js`)**: Full backend with Node.js built-in SQLite database (`./data/app.db`) and official Google Authentication.

---

## 🌟 Key Features

- **🌱 Completely Empty Start**: Zero sample habits, zero demo to-dos, zero seeded streaks. Your list belongs 100% to you from day one.
- **✨ Clean, Cute & Minimal**: Soft pastel palette (sage, lavender, peach, sky), gentle dark mode toggle, and micro-interactions (sensory pop/chime sounds, pastel confetti celebration).
- **🔒 Mandatory Google Sign-In (On Web / Localhost)**:
  - Exact Client ID: `13504827014-gdn9ek14fgld87pp3ad8m7jh3q2f0hq4.apps.googleusercontent.com`
  - No client ID picker, no demo bypass.
  - Persistent 30-day session saved in SQLite and HTTP-only cookie.
- **🗄️ Local SQLite Persistence**:
  - Automatically creates `./data/app.db` and all relational tables on startup.
  - Zero external database setup or cloud accounts needed.
  - Excluded from Git via `.gitignore`.
- **💻 Android & Laptop Optimized**:
  - Android: Bottom-anchored thumb navigation bar, touch-friendly tap targets, PWA installable manifest (`manifest.json`).
  - Laptops: Centered readable container, keyboard shortcuts (`Enter` to add, `Esc` to close).

---

## 🚀 Two Ways to Run

### Method 1: Standalone Direct Open (No Server Needed)
You can open Bloom directly in your browser without starting any server or running any terminal command:

1. Locate the file:
   ```
   To-do_Habit-tracker App/index.html
   ```
   *(or `public/index.html`)*
2. Double-click to open it in **Google Chrome**, **Edge**, or **Firefox**.
3. Click **"Start Standalone Session 🌱"**.
4. Start adding habits and tasks! All data persists in your browser's local storage across page refreshes and browser restarts.

> ℹ️ **How Google Sign-In behaves on `file://`:**
> Google's OAuth security policy strictly prohibits the `file://` protocol (`origin: null`). When opening `index.html` directly from your hard drive, Bloom automatically detects the `file://` protocol and enables **Standalone Direct Browser Mode**. When you run the local server or deploy to your own domain, real Google Sign-In activates automatically!

---

### Method 2: Server Mode with SQLite (`http://localhost:3000`)
To run with local SQLite database storage and real Google Authentication:

```bash
# 1. Start the server (zero external npm dependencies required)
node server.js
```
*(Or `npm start`)*

2. Open in your browser:
   👉 **[http://localhost:3000](http://localhost:3000)**
3. The official Google Sign-In button will appear.
4. Sign in with your Google account. Your session and habits will be stored in `./data/app.db`.

---

## 🩺 Health Check Endpoint

When running the server, check the system and SQLite health at:
👉 **`GET http://localhost:3000/health`**

Example response:
```json
{
  "status": "ok",
  "uptimeSeconds": 14,
  "timestamp": "2026-11-21T09:32:21.030Z",
  "version": "3.0.0",
  "database": {
    "status": "connected",
    "engine": "SQLite",
    "path": "./data/app.db",
    "healthy": true,
    "fileSizeBytes": 4096,
    "stats": {
      "users": 1,
      "habits": 0,
      "todos": 0,
      "sessions": 1
    }
  }
}
```

---

## 🌐 Connecting to a Custom Domain Later

When you are ready to point Bloom to your own custom domain (e.g. `https://habits.yourdomain.com`):

1. **Add Authorized Origin in Google Cloud Console**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
   - Select your OAuth 2.0 Web Client (`13504827014-gdn9ek14fgld87pp3ad8m7jh3q2f0hq4.apps.googleusercontent.com`).
   - Under **Authorized JavaScript origins**, add:
     - `https://habits.yourdomain.com`
     - `http://localhost:3000` (for local development)
   - Save changes.

2. **Deploy the Server**:
   - Run with Docker:
     ```bash
     docker compose up -d
     ```
   - Or deploy to any Node.js host (VPS, Render, Railway, DigitalOcean, Fly.io) with:
     ```bash
     node server.js
     ```
   - The SQLite database file persists inside `./data/app.db`.

---

## 📂 File Architecture

```
To-do_Habit-tracker App/
├── index.html           # Standalone direct-open shell for immediate double-click
├── server.js            # Node.js HTTP server & API routes (/health, /api/*)
├── db.js                # SQLite database engine (node:sqlite DatabaseSync)
├── test_server.js       # Automated health check and architecture test script
├── package.json         # Zero external dependencies
├── .env.example / .env  # Port & SQLITE_PATH configuration
├── .gitignore           # Excludes data/*.db, logs, and temp files
├── Dockerfile           # Alpine image with SQLite volume
├── docker-compose.yml   # Docker compose configuration
├── data/
│   └── app.db           # SQLite database file (auto-created on server start)
└── public/
    ├── index.html       # Server-served HTML shell
    ├── manifest.json    # Android PWA install manifest
    ├── css/
    │   └── style.css    # Pastel aesthetic design, dark mode, responsive styles
    └── js/
        ├── app.js       # App controller, audio synthesizer, canvas confetti
        ├── auth.js      # Google Identity Services & Standalone mode handler
        ├── habits.js    # Unlimited habit tracker, streaks, 7-day matrix
        ├── todos.js     # Unlimited to-do list, priority, search, undo toast
        └── storage.js   # Dual storage engine (SQLite API + localStorage fallback)
```
