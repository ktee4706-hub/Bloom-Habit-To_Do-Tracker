/**
 * Unlimited Habit Tracker Module
 * Zero sample data - completely empty start
 */

class HabitsManager {
  constructor(app) {
    this.app = app;
    this.habits = [];
  }

  setHabits(list) {
    this.habits = Array.isArray(list) ? list : [];
    this.calculateAllStreaks();
    this.render();
  }

  getTodayString() {
    return new Date().toISOString().slice(0, 10);
  }

  calculateStreak(completedDates) {
    if (!completedDates || !completedDates.length) {
      return { streak: 0, bestStreak: 0 };
    }

    const uniqueDates = Array.from(new Set(completedDates)).sort().reverse();
    const today = this.getTodayString();
    
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    let currentStreak = 0;
    let checkDate = new Date();

    if (uniqueDates.includes(today)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (uniqueDates.includes(yesterday)) {
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      return { streak: 0, bestStreak: this.calculateBestStreak(uniqueDates) };
    }

    while (true) {
      const dateStr = checkDate.toISOString().slice(0, 10);
      if (uniqueDates.includes(dateStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      streak: currentStreak,
      bestStreak: Math.max(currentStreak, this.calculateBestStreak(uniqueDates))
    };
  }

  calculateBestStreak(uniqueSortedDescDates) {
    if (!uniqueSortedDescDates.length) return 0;
    const datesAsc = [...uniqueSortedDescDates].reverse();
    let best = 1;
    let temp = 1;

    for (let i = 1; i < datesAsc.length; i++) {
      const prev = new Date(datesAsc[i - 1]);
      const curr = new Date(datesAsc[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        temp++;
        if (temp > best) best = temp;
      } else if (diffDays > 1) {
        temp = 1;
      }
    }
    return best;
  }

  calculateAllStreaks() {
    this.habits.forEach(h => {
      const { streak, bestStreak } = this.calculateStreak(h.completedDates || []);
      h.streak = streak;
      h.bestStreak = Math.max(h.bestStreak || 0, bestStreak);
    });
  }

  addHabit(title, category = 'Daily', icon = '🌱', color = 'sage') {
    if (!title || !title.trim()) return;

    const newHabit = {
      id: 'hbt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      category: category.trim() || 'Daily',
      icon: icon || '🌱',
      color: color || 'sage',
      streak: 0,
      bestStreak: 0,
      completedDates: [],
      createdAt: new Date().toISOString()
    };

    this.habits.unshift(newHabit);
    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();
    this.app.showToast(`Added habit "${newHabit.title}" 🌱`);
  }

  toggleToday(habitId) {
    const habit = this.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (!Array.isArray(habit.completedDates)) {
      habit.completedDates = [];
    }

    const today = this.getTodayString();
    const index = habit.completedDates.indexOf(today);

    let isCompletedNow = false;
    if (index === -1) {
      habit.completedDates.push(today);
      isCompletedNow = true;
      this.app.playSound('habit');
    } else {
      habit.completedDates.splice(index, 1);
    }

    const { streak, bestStreak } = this.calculateStreak(habit.completedDates);
    habit.streak = streak;
    habit.bestStreak = Math.max(habit.bestStreak || 0, bestStreak);

    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();

    if (isCompletedNow) {
      if (this.areAllCompletedToday()) {
        this.app.triggerConfetti();
        this.app.showToast('All habits completed today! Wonderful rhythm 🌸');
      }
    }
  }

  resetStreak(habitId) {
    const habit = this.habits.find(h => h.id === habitId);
    if (!habit) return;
    if (confirm(`Reset streak for "${habit.title}"?`)) {
      habit.completedDates = [];
      habit.streak = 0;
      this.app.saveAllData();
      this.render();
      this.app.updateProgressBanner();
      this.app.showToast(`Streak reset for "${habit.title}"`);
    }
  }

  deleteHabit(habitId) {
    const habit = this.habits.find(h => h.id === habitId);
    if (!habit) return;
    if (confirm(`Delete habit "${habit.title}"?`)) {
      this.habits = this.habits.filter(h => h.id !== habitId);
      this.app.saveAllData();
      this.render();
      this.app.updateProgressBanner();
      this.app.showToast(`Deleted habit "${habit.title}"`);
    }
  }

  areAllCompletedToday() {
    if (!this.habits.length) return false;
    const today = this.getTodayString();
    return this.habits.every(h => (h.completedDates || []).includes(today));
  }

  getCompletedTodayCount() {
    const today = this.getTodayString();
    return this.habits.filter(h => (h.completedDates || []).includes(today)).length;
  }

  getPast7Days() {
    const days = [];
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        dateStr,
        dayName: dayNames[d.getDay()],
        isToday: i === 0
      });
    }
    return days;
  }

  render() {
    const container = document.getElementById('habits-list-container');
    if (!container) return;

    if (!this.habits.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🌱</div>
          <div class="empty-text">No habits tracked yet</div>
          <div class="empty-subtext">Add a daily habit above to begin your journey with zero limits.</div>
        </div>
      `;
      return;
    }

    const today = this.getTodayString();
    const past7Days = this.getPast7Days();

    container.innerHTML = this.habits.map(habit => {
      const isDoneToday = (habit.completedDates || []).includes(today);
      const streak = habit.streak || 0;
      const best = habit.bestStreak || 0;

      const weekDotsHtml = past7Days.map(d => {
        const isDone = (habit.completedDates || []).includes(d.dateStr);
        return `
          <div class="week-day-col" title="${d.dateStr}">
            <span class="week-day-label">${d.dayName}</span>
            <div class="week-day-dot ${isDone ? 'done' : ''} ${d.isToday ? 'today' : ''}">
              ${isDone ? '✓' : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="habit-card ${isDoneToday ? 'completed-today' : ''}" data-id="${habit.id}">
          <div class="habit-top-row">
            <div class="habit-main-left">
              <button class="habit-check-btn" onclick="window.bloomHabits.toggleToday('${habit.id}')" title="Check off today" aria-label="Toggle ${habit.title}">
                ✓
              </button>
              <div class="habit-info">
                <div class="habit-title">${this.escapeHtml(habit.icon || '🌸')} ${this.escapeHtml(habit.title)}</div>
                <div class="habit-meta">
                  <span class="category-tag">${this.escapeHtml(habit.category || 'Daily')}</span>
                  <span>Total: ${(habit.completedDates || []).length} days</span>
                </div>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:8px;">
              <div class="streak-pill ${streak === 0 ? 'zero' : ''}" title="Current: ${streak} | Best: ${best}">
                <span>🔥</span>
                <span>${streak}d</span>
              </div>
              <div class="habit-actions">
                <button class="card-action-btn" onclick="window.bloomHabits.resetStreak('${habit.id}')" title="Reset Streak">
                  🔄
                </button>
                <button class="card-action-btn delete" onclick="window.bloomHabits.deleteHabit('${habit.id}')" title="Delete Habit">
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div class="habit-week-grid">
            ${weekDotsHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
}

window.bloomHabits = null;
