/**
 * Bloom Authentication Manager
 * Supports:
 * 1. Web Mode (http://localhost or custom domain): Official Google Identity Services + SQLite session
 * 2. Standalone Mode (direct file:// open): Instant local persistent session with localStorage
 */

const EXACT_GOOGLE_CLIENT_ID = '13504827014-gdn9ek14fgld87pp3ad8m7jh3q2f0hq4.apps.googleusercontent.com';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.clientId = EXACT_GOOGLE_CLIENT_ID;
    this.isStandaloneFileMode = window.location.protocol === 'file:';
    this.init();
  }

  async init() {
    // Check if running directly via file:// protocol
    if (this.isStandaloneFileMode) {
      this.initStandaloneMode();
      return;
    }

    // --- Web Mode (http://localhost or custom domain) ---
    // 1. Fetch server config
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        if (config.googleClientId) {
          this.clientId = config.googleClientId;
        }
      }
    } catch (e) {
      // Offline fallback: use exact Client ID
    }

    // 2. Check existing persistent session (HTTP-only cookie)
    try {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.authenticated && meData.user) {
          this.currentUser = meData.user;
          this.showAuthenticatedView();
          return;
        }
      }
    } catch (e) {
      console.log('Unauthenticated or backend unreachable');
    }

    // 3. Unauthenticated: Show landing screen and initialize Google Sign-In
    this.showUnauthenticatedLanding();
    this.setupGoogleIdentity();
  }

  // --- Standalone file:// Mode Logic ---
  initStandaloneMode() {
    console.log('🌸 Bloom running in direct Standalone File Mode (file://)');

    // Check if user previously started a standalone session
    try {
      const savedUser = localStorage.getItem('bloom_standalone_user');
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
        this.showAuthenticatedView();
        return;
      }
    } catch (e) {}

    // Show landing screen with standalone button
    this.showUnauthenticatedLanding();

    const fileBox = document.getElementById('file-standalone-box');
    const googleBox = document.getElementById('google-auth-box');
    if (fileBox) fileBox.style.display = 'block';
    if (googleBox) googleBox.style.display = 'none';

    document.getElementById('start-standalone-btn')?.addEventListener('click', () => {
      this.currentUser = {
        id: 'local_user',
        name: 'Local Planner',
        email: 'Saved locally in browser',
        picture: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238FB89D'><circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 4-6 8-6s8 2 8 6'/></svg>"
      };
      localStorage.setItem('bloom_standalone_user', JSON.stringify(this.currentUser));
      this.showAuthenticatedView();
      window.bloomApp?.showToast('Started standalone offline session! 🌱');
    });
  }

  // --- Google Identity Services Setup ---
  setupGoogleIdentity() {
    if (this.isStandaloneFileMode) return;

    if (!window.google || !window.google.accounts) {
      window.addEventListener('load', () => this.setupGoogleIdentity(), { once: true });
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: this.clientId,
        callback: this.handleCredentialResponse.bind(this),
        auto_select: true,
        cancel_on_tap_outside: false
      });

      const container = document.getElementById('g_id_signin_landing_container');
      if (container) {
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 280
        });
      }
    } catch (err) {
      console.error('Google Sign-In initialization error:', err);
    }
  }

  // Handle Google JWT Token response
  async handleCredentialResponse(response) {
    if (!response || !response.credential) return;

    try {
      const authRes = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credential: response.credential })
      });

      if (!authRes.ok) {
        throw new Error('Authentication failed');
      }

      const result = await authRes.json();
      if (result.success && result.user) {
        this.currentUser = result.user;
        this.showAuthenticatedView();
        window.bloomApp?.showToast(`Welcome, ${result.user.name}! 🌸`);
      }
    } catch (err) {
      alert('Sign-In Error: ' + err.message);
    }
  }

  async signOut() {
    if (this.isStandaloneFileMode) {
      localStorage.removeItem('bloom_standalone_user');
      this.currentUser = null;
      this.showUnauthenticatedLanding();
      if (window.bloomApp) {
        window.bloomApp.clearUserData();
        window.bloomApp.showToast('Signed out from local session');
      }
      return;
    }

    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {}

    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }

    this.currentUser = null;
    this.showUnauthenticatedLanding();
    this.setupGoogleIdentity();
    if (window.bloomApp) {
      window.bloomApp.clearUserData();
      window.bloomApp.showToast('Signed out successfully');
    }
  }

  showAuthenticatedView() {
    const landing = document.getElementById('unauth-landing-screen');
    const appView = document.getElementById('authenticated-app-view');
    if (landing) landing.style.display = 'none';
    if (appView) appView.style.display = 'block';

    const avatar = document.getElementById('header-user-avatar');
    const name = document.getElementById('header-user-name');
    if (avatar) avatar.src = this.currentUser.picture || '';
    if (name) name.textContent = this.currentUser.name || 'User';

    // Update Modal Info
    const info = document.getElementById('modal-storage-info');
    if (info) {
      if (this.isStandaloneFileMode) {
        info.innerHTML = `
          ✓ Direct Browser Mode (file://)<br>
          ✓ Data saved locally in browser (localStorage)<br>
          ✓ Ready for SQLite backend & custom domain
        `;
      } else {
        info.innerHTML = `
          ✓ Connected via Google Identity Services<br>
          ✓ Data saved persistently in SQLite database<br>
          ✓ Persistent 30-day session active
        `;
      }
    }

    if (window.bloomApp) {
      window.bloomApp.reloadState();
    }
  }

  showUnauthenticatedLanding() {
    const landing = document.getElementById('unauth-landing-screen');
    const appView = document.getElementById('authenticated-app-view');
    if (landing) landing.style.display = 'flex';
    if (appView) appView.style.display = 'none';

    const fileBox = document.getElementById('file-standalone-box');
    const googleBox = document.getElementById('google-auth-box');

    if (this.isStandaloneFileMode) {
      if (fileBox) fileBox.style.display = 'block';
      if (googleBox) googleBox.style.display = 'none';
    } else {
      if (fileBox) fileBox.style.display = 'none';
      if (googleBox) googleBox.style.display = 'block';
    }
  }
}

window.bloomAuth = new AuthManager();
