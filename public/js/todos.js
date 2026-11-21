/**
 * Unlimited To-Do List Module
 * Zero sample data - completely empty start
 */

class TodosManager {
  constructor(app) {
    this.app = app;
    this.todos = [];
    this.filter = 'all';
    this.searchQuery = '';
    this.lastDeletedItem = null;
    this.lastDeletedIndex = -1;
  }

  setTodos(list) {
    this.todos = Array.isArray(list) ? list : [];
    this.render();
  }

  addTodo(title, priority = 'medium', category = 'General') {
    if (!title || !title.trim()) return;

    const newTodo = {
      id: 'td_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      completed: false,
      priority: priority || 'medium',
      category: category.trim() || 'General',
      createdAt: new Date().toISOString()
    };

    this.todos.unshift(newTodo);
    this.app.saveAllData();
    this.render();
    this.app.updateProgressBanner();
    this.app.showToast('Added task ✨');
  }

  toggleTodo(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    todo.completed = !todo.completed;
    if (todo.completed) {
      todo.completedAt = new Date().toISOString();
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

  editTodoPrompt(id) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    const newTitle = prompt('Edit task:', todo.title);
    if (newTitle !== null && newTitle.trim()) {
      todo.title = newTitle.trim();
      this.app.saveAllData();
      this.render();
      this.app.showToast('Task updated');
    }
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

    container.innerHTML = filtered.map(todo => {
      const priorityClass = `priority-${todo.priority || 'medium'}`;
      const isCompleted = todo.completed;

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
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button class="card-action-btn" onclick="window.bloomTodos.editTodoPrompt('${todo.id}')" title="Edit Task">
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
