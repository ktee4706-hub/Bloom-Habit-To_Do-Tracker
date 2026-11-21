/**
 * Persistent Storage Engine for Bloom
 * - Server Mode: Direct sync with SQLite backend (/api/data)
 * - Standalone Mode (file://): Instant localStorage persistence
 * Zero sample data seeded - completely empty start
 */

const LOCAL_HABITS_KEY = 'bloom_habits_v2';
const LOCAL_TODOS_KEY = 'bloom_todos_v2';
const LOCAL_SETTINGS_KEY = 'bloom_settings_v2';

class StorageManager {
  constructor() {
    this.syncTimeout = null;
    this.isStandaloneFileMode = window.location.protocol === 'file:';
  }

  async loadState() {
    // 1. Standalone file:// mode: read directly from localStorage
    if (this.isStandaloneFileMode) {
      return this.loadFromLocalStorage();
    }

    // 2. Server mode: fetch from SQLite backend
    try {
      const res = await fetch('/api/data', {
        credentials: 'same-origin',
        cache: 'no-cache'
      });

      if (res.ok) {
        const data = await res.json();
        const state = {
          habits: Array.isArray(data.habits) ? data.habits : [],
          todos: Array.isArray(data.todos) ? data.todos : [],
          settings: data.settings || { theme: 'light', soundEnabled: true, confettiEnabled: true }
        };
        // Also cache locally for seamless offline capability
        this.saveToLocalStorage(state);
        return state;
      }
    } catch (e) {
      console.warn('Network unavailable, falling back to local storage cache:', e);
    }

    return this.loadFromLocalStorage();
  }

  loadFromLocalStorage() {
    let habits = [];
    let todos = [];
    let settings = { theme: 'light', soundEnabled: true, confettiEnabled: true };

    try {
      const hRaw = localStorage.getItem(LOCAL_HABITS_KEY);
      if (hRaw) habits = JSON.parse(hRaw);

      const tRaw = localStorage.getItem(LOCAL_TODOS_KEY);
      if (tRaw) todos = JSON.parse(tRaw);

      const sRaw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (sRaw) settings = JSON.parse(sRaw);
    } catch (e) {
      console.warn('Error reading from localStorage:', e);
    }

    return { habits, todos, settings };
  }

  saveToLocalStorage(data) {
    try {
      localStorage.setItem(LOCAL_HABITS_KEY, JSON.stringify(data.habits || []));
      localStorage.setItem(LOCAL_TODOS_KEY, JSON.stringify(data.todos || []));
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(data.settings || {}));
    } catch (e) {}
  }

  saveState(data) {
    // Always save to localStorage immediately for instant UI response
    this.saveToLocalStorage(data);

    // If running in standalone file:// mode, we're done!
    if (this.isStandaloneFileMode) {
      return;
    }

    // Debounce save to SQLite backend
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(async () => {
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            habits: data.habits || [],
            todos: data.todos || [],
            settings: data.settings || {}
          })
        });
      } catch (err) {
        console.error('Error saving data to SQLite:', err);
      }
    }, 400);
  }
}

window.bloomStorage = new StorageManager();
