const assert = require('assert');

// Simulate the exact TodosManager logic in isolation for thorough unit testing
class MockApp {
  constructor() {
    this.soundPlayed = false;
    this.alarmPlaying = false;
    this.savedData = null;
    this.toasts = [];
  }
  playLoudSingleShotAlarm() {
    this.alarmPlaying = true;
  }
  stopAlarmSound() {
    this.alarmPlaying = false;
  }
  saveAllData() {
    this.savedData = true;
  }
  render() {}
  showToast(msg) {
    this.toasts.push(msg);
  }
  openModal() {}
  closeModal() {}
  updateProgressBanner() {}
  triggerConfetti() {}
  playSound() {}
}

// Logic under test
function simulateReminderCheck(todo, now, alerts, app) {
  if (!todo.reminderTime || todo.completed) return;

  const scheduledTime = new Date(todo.reminderTime).getTime();
  if (isNaN(scheduledTime)) return;

  // 1. Exact 1-Minute-Early Heads-Up:
  if (!todo.earlyFired) {
    if (now >= scheduledTime - 60000 && now < scheduledTime) {
      todo.earlyFired = true;
      alerts.push({ type: 'early', todoId: todo.id, time: now });
      if (todo.reminderAlarm !== false) app.playLoudSingleShotAlarm();
      return;
    } else if (now >= scheduledTime) {
      todo.earlyFired = true;
    }
  }

  // 2. Exact On-Time Alert:
  if (!todo.reminderTriggered && now >= scheduledTime) {
    todo.reminderTriggered = true;
    todo.earlyFired = true;
    todo.lastFollowUp = new Date(now).toISOString();
    alerts.push({ type: 'due', todoId: todo.id, time: now });
    if (todo.reminderAlarm !== false) app.playLoudSingleShotAlarm();
    return;
  }

  // 3. Follow-Up Alert Every 5 Minutes Until Ticked:
  if (todo.reminderTriggered && !todo.completed) {
    const lastAlertTime = todo.lastFollowUp ? new Date(todo.lastFollowUp).getTime() : scheduledTime;
    const elapsedSinceLast = now - lastAlertTime;
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    if (elapsedSinceLast >= FIVE_MINUTES_MS) {
      todo.lastFollowUp = new Date(now).toISOString();
      alerts.push({ type: 'followup', todoId: todo.id, time: now });
      if (todo.reminderAlarm !== false) app.playLoudSingleShotAlarm();
      return;
    }
  }
}

function simulateToggleTodo(todo, app) {
  todo.completed = !todo.completed;
  if (todo.completed) {
    todo.completedAt = new Date().toISOString();
    app.stopAlarmSound();
    todo.reminderTriggered = true;
    todo.earlyFired = true;
    todo.lastFollowUp = null;
  }
}

async function runTimingTests() {
  console.log('🧪 Starting Exact Timing, Stop-on-Complete & Follow-Up Simulation Tests...');

  const app = new MockApp();
  const alerts = [];

  const baseTime = 1700000000000; // Reference timestamp
  const T = baseTime + 100000; // Scheduled at baseTime + 100 seconds

  const todo = {
    id: 'td_test_timing',
    title: 'Important Presentation Prep',
    completed: false,
    reminderTime: new Date(T).toISOString(),
    reminderNotify: true,
    reminderAlarm: true,
    reminderTriggered: false,
    earlyFired: false,
    lastFollowUp: null
  };

  // Test 1: Well before 1-minute early (e.g. 80 seconds before T -> T - 80000)
  console.log('\n1. Checking 80 seconds before T (Too early for 1-minute alert)...');
  simulateReminderCheck(todo, T - 80000, alerts, app);
  assert.strictEqual(alerts.length, 0, 'No alert should fire before T - 60s');
  assert.strictEqual(todo.earlyFired, false, 'earlyFired must still be false');
  console.log('✅ PASS: No early firing before T - 60s');

  // Test 2: Exactly at 1 minute early (T - 60000)
  console.log('\n2. Checking exactly at 1 minute early (T - 60000)...');
  simulateReminderCheck(todo, T - 60000, alerts, app);
  assert.strictEqual(alerts.length, 1, 'Exactly one alert should have fired');
  assert.strictEqual(alerts[0].type, 'early', 'Alert type must be early');
  assert.strictEqual(todo.earlyFired, true, 'earlyFired must now be true');
  assert.strictEqual(app.alarmPlaying, true, 'Alarm chime should have played');
  console.log('✅ PASS: Exact 1-minute-early heads-up fired once!');

  // Test 3: Between T - 60s and T (e.g. T - 30000)
  console.log('\n3. Checking at T - 30000 (Early alert already fired, before T)...');
  simulateReminderCheck(todo, T - 30000, alerts, app);
  assert.strictEqual(alerts.length, 1, 'Should NOT fire early alert a second time');
  console.log('✅ PASS: Early alert does not repeat');

  // Test 4: Exactly at scheduled time T (On-time alert)
  console.log('\n4. Checking at scheduled time T (On-time alert)...');
  simulateReminderCheck(todo, T, alerts, app);
  assert.strictEqual(alerts.length, 2, 'Should now have 2 alerts (early + due)');
  assert.strictEqual(alerts[1].type, 'due', 'Alert type must be due');
  assert.strictEqual(todo.reminderTriggered, true, 'reminderTriggered must be true');
  assert.ok(todo.lastFollowUp, 'lastFollowUp must be set');
  console.log('✅ PASS: Exact on-time alert fired once!');

  // Test 5: 2 minutes after T (Before 5-minute follow-up)
  console.log('\n5. Checking 2 minutes after T (Before 5m follow-up window)...');
  simulateReminderCheck(todo, T + 2 * 60 * 1000, alerts, app);
  assert.strictEqual(alerts.length, 2, 'Should not fire before 5 minutes elapsed');
  console.log('✅ PASS: No premature follow-up');

  // Test 6: Exactly 5 minutes after T (Follow-up 1)
  console.log('\n6. Checking exactly 5 minutes after T (First 5-minute follow-up)...');
  simulateReminderCheck(todo, T + 5 * 60 * 1000, alerts, app);
  assert.strictEqual(alerts.length, 3, 'Should have 3 alerts now');
  assert.strictEqual(alerts[2].type, 'followup', 'Alert type must be followup');
  console.log('✅ PASS: First 5-minute follow-up alert fired!');

  // Test 7: 10 minutes after T (Second 5-minute follow-up)
  console.log('\n7. Checking exactly 10 minutes after T (Second 5-minute follow-up)...');
  simulateReminderCheck(todo, T + 10 * 60 * 1000, alerts, app);
  assert.strictEqual(alerts.length, 4, 'Should have 4 alerts now');
  assert.strictEqual(alerts[3].type, 'followup', 'Alert type must be followup');
  console.log('✅ PASS: Second 5-minute follow-up alert fired!');

  // Test 8: Instant Stop-on-Complete
  console.log('\n8. Testing instant Stop-on-Complete...');
  assert.strictEqual(app.alarmPlaying, true, 'Alarm was playing before completion');
  simulateToggleTodo(todo, app);
  assert.strictEqual(todo.completed, true, 'Todo must now be completed');
  assert.strictEqual(app.alarmPlaying, false, 'Alarm must instantly stop when marked completed');
  console.log('✅ PASS: Alarm sound stopped immediately when marked complete!');

  // Test 9: Verify no further triggers once completed
  console.log('\n9. Verifying no further triggers after completion...');
  simulateReminderCheck(todo, T + 15 * 60 * 1000, alerts, app);
  simulateReminderCheck(todo, T + 20 * 60 * 1000, alerts, app);
  simulateReminderCheck(todo, T + 60 * 60 * 1000, alerts, app);
  assert.strictEqual(alerts.length, 4, 'Alert count must remain 4 forever after completed');
  console.log('✅ PASS: Zero alerts fire forever once completed!');

  // Test 10: App opened AFTER T (Late launch)
  console.log('\n10. Testing late launch (opening app after T)...');
  const lateTodo = {
    id: 'td_late',
    title: 'Late Launch Test',
    completed: false,
    reminderTime: new Date(baseTime).toISOString(), // Was due at baseTime
    reminderNotify: true,
    reminderAlarm: true,
    reminderTriggered: false,
    earlyFired: false,
    lastFollowUp: null
  };
  const lateAlerts = [];
  // Open 10 minutes after baseTime
  simulateReminderCheck(lateTodo, baseTime + 10 * 60 * 1000, lateAlerts, app);
  assert.strictEqual(lateAlerts.length, 1, 'Should fire on-time alert upon late open');
  assert.strictEqual(lateAlerts[0].type, 'due', 'Alert type must be due, NOT early');
  assert.strictEqual(lateTodo.earlyFired, true, 'earlyFired must be marked true without firing early alert');
  console.log('✅ PASS: Late launch triggers on-time alert and correctly bypasses early heads-up!');

  console.log('\n🎉 ALL EXACT TIMING, STOP-ON-COMPLETE & 5-MIN FOLLOW-UP TESTS PASSED CLEANLY!\n');
}

runTimingTests();
