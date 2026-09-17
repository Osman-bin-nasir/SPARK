import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDefaultDisplayName,
  getUserSettings,
  getUserSettingsEventName,
  getUserSettingsStorageKey,
  normalizeUserSettings,
  persistUserSettings
} from '../src/lib/user-settings.js';

function createStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test.beforeEach(() => {
  globalThis.localStorage = createStorage();
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  globalThis.window = {
    dispatchEvent() {}
  };
});

test.afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.CustomEvent;
  delete globalThis.window;
});

test('user settings normalize invalid persisted values to safe defaults', () => {
  localStorage.setItem('theme', 'dark');

  const settings = normalizeUserSettings({
    display_name: '  ',
    theme_mode: 'system',
    interface_density: 'tiny',
    show_topbar_search: 'yes',
    transactions_page_size: '100',
    default_google_sheet_range: 'all'
  }, { email: 'jane.doe@example.com' });

  assert.equal(settings.display_name, 'Jane Doe');
  assert.equal(settings.theme_mode, 'dark');
  assert.equal(settings.interface_density, 'comfortable');
  assert.equal(settings.show_topbar_search, true);
  assert.equal(settings.transactions_page_size, 100);
  assert.equal(settings.default_google_sheet_range, '1m');
});

test('user settings recover from corrupt storage and derive stable identity helpers', () => {
  const user = { id: 'user-1', email: 'alex-smith@example.com' };
  localStorage.setItem(getUserSettingsStorageKey(user.id), '{not-json');

  assert.equal(getUserSettingsStorageKey(user.id), 'spark.user-settings.user-1');
  assert.equal(getUserSettingsStorageKey(null), '');
  assert.equal(getDefaultDisplayName(user), 'Alex Smith');
  assert.equal(getUserSettings(user).display_name, 'Alex Smith');
});

test('persisting user settings stores normalized data and emits an update event', () => {
  const user = { id: 'user-2', email: 'owner@example.com' };
  let receivedEvent = null;
  window.dispatchEvent = (event) => {
    receivedEvent = event;
  };

  const result = persistUserSettings(user, {
    display_name: '  Finance Owner  ',
    transactions_page_size: 25,
    reduce_motion: true
  });

  assert.equal(result.display_name, 'Finance Owner');
  assert.equal(result.transactions_page_size, 25);
  assert.equal(result.reduce_motion, true);
  assert.deepEqual(
    JSON.parse(localStorage.getItem('spark.user-settings.user-2')),
    result
  );
  assert.equal(receivedEvent.type, getUserSettingsEventName());
  assert.deepEqual(receivedEvent.detail, { userId: 'user-2', settings: result });
});
