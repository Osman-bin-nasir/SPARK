const USER_SETTINGS_EVENT = 'spark-user-settings-updated';

const ALLOWED_THEME_MODES = ['light', 'dark'];
const ALLOWED_INTERFACE_DENSITIES = ['comfortable', 'compact'];
const ALLOWED_CONTENT_WIDTHS = ['standard', 'wide'];
const ALLOWED_SHEET_RANGES = ['1m', '3m', '6m', '12m'];
const ALLOWED_TRANSACTIONS_PAGE_SIZES = [25, 50, 100];

function resolveStoredThemeMode() {
  const storedTheme = localStorage.getItem('theme');
  return ALLOWED_THEME_MODES.includes(storedTheme) ? storedTheme : 'light';
}

function sanitizeEnum(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

function sanitizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

export function getUserSettingsStorageKey(userId) {
  return userId ? `spark.user-settings.${userId}` : '';
}

export function getDefaultDisplayName(user) {
  const email = String(user?.email || '').trim();
  const localPart = email.split('@')[0] || 'Workspace user';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeUserSettings(rawSettings = {}, user = null) {
  const settings = rawSettings || {};
  const defaultDisplayName = getDefaultDisplayName(user) || 'Workspace User';

  return {
    display_name: String(settings.display_name || '').trim() || defaultDisplayName,
    theme_mode: sanitizeEnum(settings.theme_mode, ALLOWED_THEME_MODES, resolveStoredThemeMode()),
    interface_density: sanitizeEnum(settings.interface_density, ALLOWED_INTERFACE_DENSITIES, 'comfortable'),
    content_width: sanitizeEnum(settings.content_width, ALLOWED_CONTENT_WIDTHS, 'standard'),
    show_topbar_search: sanitizeBoolean(settings.show_topbar_search, true),
    reduce_motion: sanitizeBoolean(settings.reduce_motion, false),
    email_notifications: sanitizeBoolean(settings.email_notifications, true),
    unusual_spend_alerts: sanitizeBoolean(settings.unusual_spend_alerts, true),
    monthly_close_reminders: sanitizeBoolean(settings.monthly_close_reminders, false),
    default_google_sheet_range: sanitizeEnum(settings.default_google_sheet_range, ALLOWED_SHEET_RANGES, '1m'),
    transactions_page_size: sanitizeNumber(Number(settings.transactions_page_size), ALLOWED_TRANSACTIONS_PAGE_SIZES, 50)
  };
}

export function getUserSettings(user) {
  const storageKey = getUserSettingsStorageKey(user?.id);

  if (!storageKey) {
    return normalizeUserSettings({}, user);
  }

  try {
    const rawValue = localStorage.getItem(storageKey);

    if (!rawValue) {
      return normalizeUserSettings({}, user);
    }

    return normalizeUserSettings(JSON.parse(rawValue), user);
  } catch (_error) {
    return normalizeUserSettings({}, user);
  }
}

export function persistUserSettings(user, nextSettings) {
  const normalized = normalizeUserSettings(nextSettings, user);
  const storageKey = getUserSettingsStorageKey(user?.id);

  if (storageKey) {
    localStorage.setItem(storageKey, JSON.stringify(normalized));
  }

  window.dispatchEvent(new CustomEvent(USER_SETTINGS_EVENT, {
    detail: {
      userId: user?.id || '',
      settings: normalized
    }
  }));

  return normalized;
}

export function getUserSettingsEventName() {
  return USER_SETTINGS_EVENT;
}
