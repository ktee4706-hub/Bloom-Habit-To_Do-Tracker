/**
 * Unlimited To-Do List Module
 * Zero sample data - completely empty start
 * With Specific-Time Reminders, Desktop/Push Notifications & Web Audio Alarm Chimes
 */

class TodosManager {
  constructor(app) {
    this.app = app;
    this.todos = [];
    this.filter = 'all';
    this.searchQuery = '';
    this.lastDeletedItem = null;
    this.lastDeletedIndex = -1;
    this.reminderCheckInterval = null;

    this.startReminderChecker();
  }

  setTodos(list) {
    this.todos = Array.isArray(list) ? list : [];
    this.render();
  }

  addTodo(title, priority = 'medium', category = 'General', reminderTime = null, reminderNotify = true, reminderAlarm = true) {
    if (!title || !title.trim()) return;

    // Clean reminder timestamp if passed
    let cleanReminderTime = null;
    if (reminderTime) {
      const d = new Date(reminderTime);
      if (!isNaN(d.getTime())) {
        cleanReminderTime = d.toISOString();
      }
    }

    const newTodo = {
      id: 'td_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      completed: false,
      priority: priority || 'medium',
      category: category ? category.trim() : 'General',
      createdAt: new Date().toISOString(),
      reminderTime: cleanReminderTime,
      reminderNotify: reminderNotify !== false,
      reminderAlarm: reminderAlarm !== false,
      reminderTriggered: false,
      earlyFired: false,
      lastFollowUp: null
    };

    // Request notification permission if notification was requested
    if (cleanReminderTime && reminderNotify && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {}
    }

    this.todos.unshift(newTodo);
    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();
    this.app.showToast(cleanReminderTime ? 'Added task with reminder ⏰' : 'Added task ✨');
  }

  updateTodo(id, updates) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    if (updates.title !== undefined) todo.title = updates.title.trim();
    if (updates.priority !== undefined) todo.priority = updates.priority;
    if (updates.category !== undefined) todo.category = updates.category.trim();

    if (updates.reminderTime !== undefined) {
      if (updates.reminderTime) {
        const d = new Date(updates.reminderTime);
        if (!isNaN(d.getTime())) {
          todo.reminderTime = d.toISOString();
          const scheduledTime = d.getTime();
          const now = Date.now();
          // Reset triggered state if scheduled in future
          if (scheduledTime > now) {
            todo.reminderTriggered = false;
            todo.earlyFired = scheduledTime <= now + 60000;
            todo.lastFollowUp = null;
          } else {
            todo.reminderTriggered = true;
            todo.earlyFired = true;
            todo.lastFollowUp = null;
          }
        }
      } else {
        todo.reminderTime = null;
        todo.reminderTriggered = false;
        todo.earlyFired = false;
        todo.lastFollowUp = null;
        const modal = document.getElementById('modal-reminder-alert');
        if (modal && modal.dataset.todoId === id) {
          this.app.stopAlarmSound();
          this.app.closeModal('modal-reminder-alert');
        }
      }
    }

    if (updates.reminderNotify !== undefined) todo.reminderNotify = Boolean(updates.reminderNotify);
    if (updates.reminderAlarm !== undefined) {
      todo.reminderAlarm = Boolean(updates.reminderAlarm);
      if (!todo.reminderAlarm) {
        const modal = document.getElementById('modal-reminder-alert');
        if (modal && modal.dataset.todoId === id) {
          this.app.stopAlarmSound();
        }
      }
    }

    if (todo.reminderTime && todo.reminderNotify && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {}
    }

    this.app.saveAllData();
    this.render();
    this.app.showToast('Task updated ✨');
  }

  clearReminder(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    todo.reminderTime = null;
    todo.reminderTriggered = false;
    todo.earlyFired = false;
    todo.lastFollowUp = null;

    const modal = document.getElementById('modal-reminder-alert');
    if (modal && modal.dataset.todoId === id) {
      this.app.stopAlarmSound();
      this.app.closeModal('modal-reminder-alert');
    }

    this.app.saveAllData();
    this.render();
    this.app.showToast('Reminder cleared ⏰');
  }

  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    todo.completed = !todo.completed;
    if (todo.completed) {
      todo.completedAt = new Date().toISOString();
      // Instantly stop playing alarm sound and cancel future reminder/follow-ups forever
      this.app.stopAlarmSound();
      const modal = document.getElementById('modal-reminder-alert');
      if (modal && modal.dataset.todoId === id) {
        this.app.closeModal('modal-reminder-alert');
      }
      todo.reminderTriggered = true;
      todo.earlyFired = true;
      todo.lastFollowUp = null;
      this.app.playSound('pop');
    } else {
      delete todo.completedAt;
    }

    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();

    if (this.areAllCompleted() && this.todos.length > 0) {
      this.app.triggerConfetti();
      this.app.showToast('All tasks completed! Enjoy the calm 🌸');
    }
  }

  deleteTodo(id, showUndo = true) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return;

    // Immediately stop active alarm and close alert modal if deleting this task
    const modal = document.getElementById('modal-reminder-alert');
    if (modal && modal.dataset.todoId === id) {
      this.app.stopAlarmSound();
      this.app.closeModal('modal-reminder-alert');
    }

    this.lastDeletedItem = this.todos[index];
    this.lastDeletedIndex = index;

    this.todos.splice(index, 1);
    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();

    if (showUndo) {
      this.app.showToast('Task deleted', () => this.undoDelete());
    }
  }

  undoDelete() {
    if (!this.lastDeletedItem) return;
    this.todos.splice(this.lastDeletedIndex, 0, this.lastDeletedItem);
    this.lastDeletedItem = null;
    this.lastDeletedIndex = -1;
    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();
    this.app.showToast('Restored task 💫');
  }

  clearCompleted() {
    const completedCount = this.todos.filter(t => t.completed).length;
    if (completedCount === 0) {
      this.app.showToast('No completed tasks to clear');
      return;
    }

    if (confirm(`Clear ${completedCount} completed task(s)?`)) {
      this.todos = this.todos.filter(t => !t.completed);
      this.app.saveAllData();
      this.render();
      this.app.updateProgressBanner();
      this.app.showToast(`Cleared ${completedCount} completed tasks 🧹`);
    }
  }

  setFilter(filterName) {
    this.filter = filterName;
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filterName);
    });
    this.render();
  }

  setSearchQuery(q) {
    this.searchQuery = (q || '').toLowerCase().trim();
    this.render();
  }

  getFilteredTodos() {
    return this.todos.filter(todo => {
      if (this.filter === 'active' && todo.completed) return false;
      if (this.filter === 'completed' && !todo.completed) return false;

      if (this.searchQuery) {
        const matchesTitle = (todo.title || '').toLowerCase().includes(this.searchQuery);
        const matchesCategory = (todo.category || '').toLowerCase().includes(this.searchQuery);
        if (!matchesTitle && !matchesCategory) return false;
      }

      return true;
    });
  }

  areAllCompleted() {
    return this.todos.length > 0 && this.todos.every(t => t.completed);
  }

  getCounts() {
    const total = this.todos.length;
    const completed = this.todos.filter(t => t.completed).length;
    const active = total - completed;
    return { total, completed, active };
  }

  // Edit Modal Dialog opener
  openEditModal(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    const idInput = document.getElementById('edit-todo-id');
    const titleInput = document.getElementById('edit-todo-title');
    const categoryInput = document.getElementById('edit-todo-category');
    const reminderTimeInput = document.getElementById('edit-todo-reminder-time');
    const reminderNotifyInput = document.getElementById('edit-todo-reminder-notify');
    const reminderAlarmInput = document.getElementById('edit-todo-reminder-alarm');
    const statusNote = document.getElementById('edit-reminder-status-note');

    if (idInput) idInput.value = todo.id;
    if (titleInput) titleInput.value = todo.title;
    if (categoryInput) categoryInput.value = todo.category || '';

    // Set Priority Pills
    document.querySelectorAll('.edit-priority-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.priority === (todo.priority || 'medium'));
    });

    // Set Reminder fields
    if (reminderTimeInput) {
      if (todo.reminderTime) {
        reminderTimeInput.value = this.toDatetimeLocal(todo.reminderTime);
      } else {
        reminderTimeInput.value = '';
      }
    }

    if (reminderNotifyInput) reminderNotifyInput.checked = todo.reminderNotify !== false;
    if (reminderAlarmInput) reminderAlarmInput.checked = todo.reminderAlarm !== false;

    if (statusNote) {
      if (todo.reminderTime) {
        const isPassed = new Date(todo.reminderTime).getTime() <= Date.now();
        if (todo.completed) {
          statusNote.textContent = '✓ Task completed. Reminders canceled.';
        } else if (todo.reminderTriggered || isPassed) {
          statusNote.textContent = 'ℹ️ Reminder due. Follow-ups active every 5m until completed. Reschedule anytime.';
        } else {
          statusNote.textContent = `⏰ Active: Scheduled for ${this.formatReminderTime(todo.reminderTime)} (Heads-up 1m early)`;
        }
      } else {
        statusNote.textContent = 'No reminder currently scheduled.';
      }
    }

    this.app.openModal('modal-edit-todo');
  }

  // Convert ISO string to datetime-local value (YYYY-MM-DDTHH:mm)
  toDatetimeLocal(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  // Format reminder time with friendly relative day + time
  formatReminderTime(isoStr) {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((targetDay - today) / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (diffDays === 0) {
      return `Today, ${timeStr}`;
    } else if (diffDays === 1) {
      return `Tomorrow, ${timeStr}`;
    } else if (diffDays === -1) {
      return `Yesterday, ${timeStr}`;
    } else {
      const monthStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${monthStr}, ${timeStr}`;
    }
  }

  // --- Periodic Reminder Checker ---
  startReminderChecker() {
    if (this.reminderCheckInterval) clearInterval(this.reminderCheckInterval);
    // Exact 1-second interval for 1-minute early, on-time, and 5-minute follow-ups
    this.reminderCheckInterval = setInterval(() => this.checkDueReminders(), 1000);
  }

  checkDueReminders() {
    if (!this.todos || !this.todos.length) return;
    const now = Date.now();

    for (const todo of this.todos) {
      // Completed items or items without reminders never trigger
      if (!todo.reminderTime || todo.completed) continue;

      const scheduledTime = new Date(todo.reminderTime).getTime();
      if (isNaN(scheduledTime)) continue;

      // 1. Exact 1-Minute-Early Heads-Up:
      // Condition: ONLY within the 1-minute window [T - 60s, T)
      // Never earlier and never later.
      if (!todo.earlyFired) {
        if (now >= scheduledTime - 60000 && now < scheduledTime) {
          todo.earlyFired = true;
          this.app.saveAllData();
          this.render();
          this.triggerReminderAlert(todo, 'early');
          break; // Process one alert per cycle
        } else if (now >= scheduledTime) {
          // If the app was opened after T, mark earlyFired = true without firing early heads-up
          todo.earlyFired = true;
          this.app.saveAllData();
        }
      }

      // 2. Exact On-Time Alert:
      // When scheduled time T is reached and task is not yet completed
      if (!todo.reminderTriggered && now >= scheduledTime) {
        todo.reminderTriggered = true;
        todo.earlyFired = true;
        todo.lastFollowUp = new Date(now).toISOString();
        this.app.saveAllData();
        this.render();
        this.triggerReminderAlert(todo, 'due');
        break; // Process one alert per cycle
      }

      // 3. Follow-Up Alert Every 5 Minutes Until Ticked:
      // Condition: On-time already fired, to-do still NOT completed, >= 5 minutes since last alert
      if (todo.reminderTriggered && !todo.completed) {
        const lastAlertTime = todo.lastFollowUp ? new Date(todo.lastFollowUp).getTime() : scheduledTime;
        const elapsedSinceLast = now - lastAlertTime;
        const FIVE_MINUTES_MS = 5 * 60 * 1000;

        if (elapsedSinceLast >= FIVE_MINUTES_MS) {
          todo.lastFollowUp = new Date(now).toISOString();
          this.app.saveAllData();
          this.render();
          this.triggerReminderAlert(todo, 'followup');
          break; // Process one alert per cycle
        }
      }
    }
  }

  // Trigger Notification + Loud Single-Shot Alarm at scheduled time
  triggerReminderAlert(todo, type = 'due') {
    let alertTitle = '';
    let alertBody = '';
    let badgeText = '';
    let badgeClass = '';

    const formattedTime = this.formatReminderTime(todo.reminderTime);

    if (type === 'early') {
      alertTitle = `⏰ Heads-Up (1 min): ${todo.title}`;
      alertBody = `Upcoming task "${todo.title}" is scheduled in 1 minute!`;
      badgeText = 'Heads-Up (1 Min Early)';
      badgeClass = 'early';
    } else if (type === 'followup') {
      alertTitle = `⏰ Follow-Up: ${todo.title}`;
      alertBody = `Task "${todo.title}" is still pending! Scheduled for ${formattedTime}`;
      badgeText = 'Follow-Up (Still Pending)';
      badgeClass = 'followup';
    } else {
      // type === 'due'
      alertTitle = `⏰ Task Due Now: ${todo.title}`;
      alertBody = `Scheduled time reached for "${todo.title}"`;
      badgeText = 'Reminder Due Now';
      badgeClass = 'due';
    }

    // 1. Browser Notification (with friendly in-app fallback)
    if (todo.reminderNotify !== false) {
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(alertTitle, {
            body: alertBody,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%238FB89D'/><text x='50' y='62' font-size='42' text-anchor='middle'>🌸</text></svg>",
            tag: `${todo.id}-${type}`,
            renotify: true
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch (e) {
          console.warn('Native notification failed:', e);
        }
      } else {
        // In-app fallback toast
        this.app.showToast(alertTitle);
      }
    }

    // 2. Loud Single-Shot Audible Alarm Chime
    if (todo.reminderAlarm !== false) {
      this.app.playLoudSingleShotAlarm();
    }

    // 3. Prominent in-app alert dialog with Stop, Snooze & Mark as Done options
    const modal = document.getElementById('modal-reminder-alert');
    if (modal) {
      modal.dataset.todoId = todo.id;
      const titleElem = document.getElementById('alarm-todo-title');
      const timeElem = document.getElementById('alarm-todo-time-text');
      const badgeElem = document.getElementById('alarm-badge') || modal.querySelector('.alarm-pill-badge');
      const bellElem = modal.querySelector('.alarm-bell-icon');

      if (titleElem) titleElem.textContent = todo.title;
      if (badgeElem) {
        badgeElem.textContent = badgeText;
        badgeElem.className = `alarm-pill-badge ${badgeClass}`;
      }
      if (bellElem) {
        bellElem.classList.remove('ringing');
        void bellElem.offsetWidth;
        bellElem.classList.add('ringing');
      }

      if (timeElem) {
        const soundText = todo.reminderAlarm !== false ? ' • 🔊 Loud chime played' : '';
        timeElem.textContent = `Scheduled for ${formattedTime}${soundText}`;
      }

      this.app.openModal('modal-reminder-alert');
    }
  }

  // Snooze reminder for X minutes
  snoozeTodo(id, minutes = 5) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    const newTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    todo.reminderTime = newTime;
    todo.reminderTriggered = false;
    todo.earlyFired = false;
    todo.lastFollowUp = null;

    this.app.stopAlarmSound();
    const modal = document.getElementById('modal-reminder-alert');
    if (modal && modal.dataset.todoId === id) {
      this.app.closeModal('modal-reminder-alert');
    }

    this.app.saveAllData();
    this.render();
    this.app.showToast(`Snoozed "${todo.title}" for ${minutes} minutes ⏰`);
  }

  render() {
    const container = document.getElementById('todos-list-container');
    if (!container) return;

    const filtered = this.getFilteredTodos();
    const counts = this.getCounts();

    const activeBadge = document.getElementById('active-todos-count');
    if (activeBadge) activeBadge.textContent = counts.active;

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">${this.searchQuery ? 'No matching tasks found' : 'Your to-do list is completely clear'}</div>
          <div class="empty-subtext">${this.searchQuery ? 'Try clearing your search term.' : 'Add your first task above whenever you are ready.'}</div>
        </div>
      `;
      return;
    }

    const now = Date.now();

    container.innerHTML = filtered.map(todo => {
      const priorityClass = `priority-${todo.priority || 'medium'}`;
      const isCompleted = todo.completed;

      // Reminder badge HTML
      let reminderHtml = '';
      if (todo.reminderTime) {
        const isPassed = new Date(todo.reminderTime).getTime() <= now;
        const formatted = this.formatReminderTime(todo.reminderTime);
        const notifyIcon = todo.reminderNotify !== false ? '<span title="Notification alert enabled">🔔</span>' : '';
        const alarmIcon = todo.reminderAlarm !== false ? '<span title="Loud alarm chime enabled">🔊</span>' : '';

        let statusBadge = '';
        if (todo.completed) {
          statusBadge = '<span class="reminder-state-tag done" title="Task completed">✓</span>';
        } else if (todo.reminderTriggered || isPassed) {
          statusBadge = '<span class="reminder-state-tag due" title="Due / 5-min follow-ups active">Due</span>';
        }

        reminderHtml = `
          <div class="todo-reminder-pill ${!todo.completed && (isPassed || todo.reminderTriggered) ? 'passed' : ''}" 
               onclick="window.bloomTodos.openEditModal('${todo.id}')" 
               title="Scheduled: ${new Date(todo.reminderTime).toLocaleString()} (Click to edit)">
            <span>⏰ ${formatted}</span>
            ${statusBadge}
            ${notifyIcon}
            ${alarmIcon}
            <button type="button" class="reminder-clear-btn" onclick="event.stopPropagation(); window.bloomTodos.clearReminder('${todo.id}')" title="Clear reminder">✕</button>
          </div>
        `;
      }

      return `
        <div class="todo-card ${isCompleted ? 'completed' : ''}" data-id="${todo.id}">
          <div class="todo-card-left">
            <button class="custom-checkbox" onclick="window.bloomTodos.toggleTodo('${todo.id}')" aria-label="Mark ${todo.title} as ${isCompleted ? 'incomplete' : 'complete'}">
              ✓
            </button>
            <div class="todo-text-wrap">
              <span class="todo-title">${this.escapeHtml(todo.title)}</span>
              <div class="todo-meta-row">
                <span class="priority-tag ${priorityClass}">${todo.priority || 'medium'}</span>
                ${todo.category ? `<span class="category-tag">${this.escapeHtml(todo.category)}</span>` : ''}
                ${reminderHtml}
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button class="card-action-btn" onclick="window.bloomTodos.openEditModal('${todo.id}')" title="Edit Task & Reminder">
              ✏️
            </button>
            <button class="card-action-btn delete" onclick="window.bloomTodos.deleteTodo('${todo.id}')" title="Delete Task">
              ✕
            </button>
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

window.bloomTodos = null;
