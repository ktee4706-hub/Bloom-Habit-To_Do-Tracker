/**
 * Bloom Main Application Controller
 * Handles navigation, Web Audio synthesis, pastel canvas confetti, toast & UI state
 */

class BloomApp {
  constructor() {
    this.currentTab = 'habits';
    this.theme = 'light';
    this.soundEnabled = true;
    this.audioCtx = null;
    this.activeToastTimeout = null;

    this.habitsManager = new HabitsManager(this);
    this.todosManager = new TodosManager(this);
    window.bloomHabits = this.habitsManager;
    window.bloomTodos = this.todosManager;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.setupTheme();
    this.initConfetti();
  }

  async reloadState() {
    const data = await window.bloomStorage.loadState();
    if (data.settings) {
      if (data.settings.theme) this.applyTheme(data.settings.theme);
      if (typeof data.settings.soundEnabled === 'boolean') this.soundEnabled = data.settings.soundEnabled;
    }
    this.habitsManager.setHabits(data.habits || []);
    this.todosManager.setTodos(data.todos || []);
    this.updateProgressBanner();
  }

  clearUserData() {
    this.habitsManager.setHabits([]);
    this.todosManager.setTodos([]);
    this.updateProgressBanner();
  }

  saveAllData() {
    const payload = {
      habits: this.habitsManager.habits,
      todos: this.todosManager.todos,
      settings: {
        theme: this.theme,
        soundEnabled: this.soundEnabled
      }
    };
    window.bloomStorage.saveState(payload);
  }

  // Web Audio API feedback
  playSound(type = 'pop') {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'pop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.start(now);
        osc.stop(now + 0.09);
      } else if (type === 'habit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.06);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {}
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) btn.textContent = this.soundEnabled ? '🔔' : '🔕';
    this.saveAllData();
    this.showToast(this.soundEnabled ? 'Sound enabled 🔔' : 'Sound muted 🔕');
  }

  // Theme Management
  setupTheme() {
    const savedTheme = localStorage.getItem('bloom_theme') || 'light';
    this.applyTheme(savedTheme);
  }

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('bloom_theme', theme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  toggleTheme() {
    const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    this.saveAllData();
  }

  // Progress Bar & Daily Stats
  updateProgressBanner() {
    const totalHabits = this.habitsManager.habits.length;
    const habitsCompleted = this.habitsManager.getCompletedTodayCount();

    const todoCounts = this.todosManager.getCounts();
    const totalTodos = todoCounts.total;
    const todosCompleted = todoCounts.completed;

    const totalItems = totalHabits + totalTodos;
    const totalCompleted = habitsCompleted + todosCompleted;

    const percent = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

    const fillElem = document.getElementById('progress-bar-fill');
    const percentElem = document.getElementById('progress-percent-text');
    const labelElem = document.getElementById('progress-summary-text');

    if (fillElem) fillElem.style.width = `${percent}%`;
    if (percentElem) percentElem.textContent = `${percent}%`;
    if (labelElem) {
      if (totalItems === 0) {
        labelElem.textContent = 'Add your first habit or task above';
      } else {
        labelElem.textContent = `${habitsCompleted}/${totalHabits} habits • ${todoCounts.active} tasks remaining`;
      }
    }

    const habitBadge = document.getElementById('nav-habit-badge');
    if (habitBadge) habitBadge.textContent = `${habitsCompleted}/${totalHabits}`;
    
    const todoBadge = document.getElementById('nav-todo-badge');
    if (todoBadge) todoBadge.textContent = todoCounts.active;
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    const habitsSection = document.getElementById('section-habits');
    const todosSection = document.getElementById('section-todos');

    if (tabName === 'habits') {
      habitsSection.style.display = 'block';
      todosSection.style.display = 'none';
    } else if (tabName === 'todos') {
      habitsSection.style.display = 'none';
      todosSection.style.display = 'block';
    } else {
      habitsSection.style.display = 'block';
      todosSection.style.display = 'block';
    }
  }

  showToast(message, undoCallback = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    clearTimeout(this.activeToastTimeout);
    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span>${this.escapeHtml(message)}</span>
      ${undoCallback ? '<button class="toast-undo">Undo</button>' : ''}
    `;

    if (undoCallback) {
      toast.querySelector('.toast-undo')?.addEventListener('click', () => {
        undoCallback();
        toast.classList.remove('show');
      });
    }

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    this.activeToastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // Canvas Confetti
  initConfetti() {
    this.canvas = document.getElementById('confetti-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.confettiParticles = [];
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  triggerConfetti() {
    if (!this.canvas || !this.ctx) return;
    const colors = ['#8FB89D', '#A89AC9', '#EAA88C', '#89B6D8', '#DF8F9E', '#E2B068'];
    const count = 65;

    for (let i = 0; i < count; i++) {
      this.confettiParticles.push({
        x: window.innerWidth * (0.3 + Math.random() * 0.4),
        y: window.innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.7) * 14,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 8,
        life: 1
      });
    }

    if (!this.confettiRunning) {
      this.confettiRunning = true;
      this.animateConfetti();
    }
  }

  animateConfetti() {
    if (!this.confettiParticles.length) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.confettiRunning = false;
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
      const p = this.confettiParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.rotationSpeed;
      p.life -= 0.015;

      if (p.life <= 0 || p.y > window.innerHeight) {
        this.confettiParticles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.2);
      this.ctx.restore();
    }

    requestAnimationFrame(() => this.animateConfetti());
  }

  openAccountModal() {
    const user = window.bloomAuth.currentUser;
    if (!user) return;

    const avatar = document.getElementById('modal-user-avatar');
    const name = document.getElementById('modal-user-name');
    const email = document.getElementById('modal-user-email');

    if (avatar) avatar.src = user.picture || '';
    if (name) name.textContent = user.name || 'Google User';
    if (email) email.textContent = user.email || '';

    document.getElementById('modal-account')?.classList.add('open');
  }

  closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  bindEvents() {
    // Nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Theme & Sound
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('sound-toggle-btn')?.addEventListener('click', () => this.toggleSound());

    // Account Modal & Sign Out
    document.getElementById('user-profile-btn')?.addEventListener('click', () => this.openAccountModal());
    document.getElementById('header-signout-btn')?.addEventListener('click', () => window.bloomAuth.signOut());
    document.getElementById('modal-logout-btn')?.addEventListener('click', () => {
      this.closeModal('modal-account');
      window.bloomAuth.signOut();
    });

    // To-Do Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => this.todosManager.setFilter(btn.dataset.filter));
    });

    // Search filter
    document.getElementById('todo-search-input')?.addEventListener('input', (e) => {
      this.todosManager.setSearchQuery(e.target.value);
    });

    // Clear completed
    document.getElementById('clear-completed-btn')?.addEventListener('click', () => {
      this.todosManager.clearCompleted();
    });

    // Add To-Do
    const todoForm = document.getElementById('add-todo-form');
    todoForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('todo-title-input');
      const priorityElem = document.querySelector('.todo-priority-pill.active');
      const priority = priorityElem ? priorityElem.dataset.priority : 'medium';
      if (input && input.value.trim()) {
        this.todosManager.addTodo(input.value.trim(), priority);
        input.value = '';
      }
    });

    // Priority pill toggles in add todo
    document.querySelectorAll('.todo-priority-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.todo-priority-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // Add Habit
    const habitForm = document.getElementById('add-habit-form');
    habitForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('habit-title-input');
      const iconElem = document.querySelector('.habit-icon-pill.active');
      const icon = iconElem ? iconElem.dataset.icon : '🌱';
      const catInput = document.getElementById('habit-cat-input');
      const cat = (catInput && catInput.value.trim()) || 'Daily';

      if (input && input.value.trim()) {
        this.habitsManager.addHabit(input.value.trim(), cat, icon);
        input.value = '';
      }
    });

    // Habit Icon pills
    document.querySelectorAll('.habit-icon-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.habit-icon-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // Modal Close
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.bloomApp = new BloomApp();
});
