const assert = require('assert');
const db = require('./db');

async function runReminderTests() {
  console.log('🧪 Running Reminders & Alerts Database Verification Tests...');

  db.initDb();

  const testUser = db.findOrCreateUser({
    sub: 'test_sub_reminder_12345',
    email: 'reminder_test@example.com',
    name: 'Reminder Tester',
    picture: ''
  });

  assert.ok(testUser && testUser.id, 'User must be created or found');
  const userId = testUser.id;

  const reminderDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now

  const testTodos = [
    {
      id: 'td_test_1',
      title: 'Complete Project Report',
      completed: false,
      priority: 'high',
      category: 'Work',
      createdAt: new Date().toISOString(),
      completedAt: null,
      reminderTime: reminderDate,
      reminderNotify: true,
      reminderAlarm: true,
      reminderTriggered: false
    },
    {
      id: 'td_test_2',
      title: 'Grocery Shopping',
      completed: false,
      priority: 'low',
      category: 'Personal',
      createdAt: new Date().toISOString(),
      completedAt: null,
      reminderTime: null,
      reminderNotify: false,
      reminderAlarm: true,
      reminderTriggered: false
    }
  ];

  console.log('1. Saving to-dos with reminder fields...');
  db.saveTodos(userId, testTodos);

  console.log('2. Fetching to-dos from SQLite...');
  const fetched = db.getTodos(userId);
  assert.strictEqual(fetched.length, 2, 'Should have 2 todos');

  const todo1 = fetched.find(t => t.id === 'td_test_1');
  assert.ok(todo1, 'Todo 1 should exist');
  assert.strictEqual(todo1.title, 'Complete Project Report');
  assert.strictEqual(todo1.reminderTime, reminderDate, 'Reminder time should match');
  assert.strictEqual(todo1.reminderNotify, true, 'reminderNotify should be true');
  assert.strictEqual(todo1.reminderAlarm, true, 'reminderAlarm should be true');
  assert.strictEqual(todo1.reminderTriggered, false, 'reminderTriggered should be false');
  assert.strictEqual(todo1.earlyFired, false, 'earlyFired should default to false');
  assert.strictEqual(todo1.lastFollowUp, null, 'lastFollowUp should default to null');

  console.log('✅ Initial reminder fields successfully saved and retrieved!');

  console.log('3. Updating reminder to 1-minute early fired and triggered states...');
  todo1.earlyFired = true;
  todo1.reminderTriggered = true;
  const nowIso = new Date().toISOString();
  todo1.lastFollowUp = nowIso;
  db.saveTodos(userId, fetched);

  const updated = db.getTodos(userId);
  const updatedTodo1 = updated.find(t => t.id === 'td_test_1');
  assert.strictEqual(updatedTodo1.earlyFired, true, 'earlyFired should now be true');
  assert.strictEqual(updatedTodo1.reminderTriggered, true, 'reminderTriggered should now be true');
  assert.strictEqual(updatedTodo1.lastFollowUp, nowIso, 'lastFollowUp should match nowIso');
  console.log('✅ Early-fired, triggered, and follow-up states successfully persisted!');

  console.log('4. Clearing reminder...');
  updatedTodo1.reminderTime = null;
  updatedTodo1.reminderTriggered = false;
  updatedTodo1.earlyFired = false;
  updatedTodo1.lastFollowUp = null;
  db.saveTodos(userId, updated);

  const cleared = db.getTodos(userId);
  const clearedTodo1 = cleared.find(t => t.id === 'td_test_1');
  assert.strictEqual(clearedTodo1.reminderTime, null, 'reminderTime should be cleared');
  assert.strictEqual(clearedTodo1.reminderTriggered, false, 'reminderTriggered should be false');
  assert.strictEqual(clearedTodo1.earlyFired, false, 'earlyFired should be false');
  assert.strictEqual(clearedTodo1.lastFollowUp, null, 'lastFollowUp should be null');
  console.log('✅ Reminder clearing verified!');

  // Cleanup test todos
  db.saveTodos(userId, []);
  console.log('🧹 Cleaned up test data.');

  console.log('\n🎉 ALL REMINDER PERSISTENCE TESTS PASSED CLEANLY!');
}

runReminderTests();
