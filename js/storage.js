// Local persistence: settings + per-day food logs, all in localStorage.

const SETTINGS_KEY = 'ft_settings_v1';
const LOGS_KEY = 'ft_logs_v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-haiku-4-5-20251001',
  calorieTarget: 2000,
  proteinTarget: 120,
  windowStart: '12:00',
  windowEnd: '20:00',
  weights: { calories: 0.4, protein: 0.3, fasting: 0.3 },
};

export function getSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getAllLogs() {
  const raw = localStorage.getItem(LOGS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAllLogs(logs) {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayEntries(dateKey) {
  const logs = getAllLogs();
  return logs[dateKey] || [];
}

export function addEntry(entry) {
  const logs = getAllLogs();
  const key = todayKey(new Date(entry.timestamp));
  if (!logs[key]) logs[key] = [];
  logs[key].push(entry);
  saveAllLogs(logs);
  return key;
}

export function updateEntry(dateKey, entryId, updates) {
  const logs = getAllLogs();
  const day = logs[dateKey] || [];
  const idx = day.findIndex((e) => e.id === entryId);
  if (idx !== -1) {
    day[idx] = { ...day[idx], ...updates };
    logs[dateKey] = day;
    saveAllLogs(logs);
  }
}

export function deleteEntry(dateKey, entryId) {
  const logs = getAllLogs();
  const day = logs[dateKey] || [];
  logs[dateKey] = day.filter((e) => e.id !== entryId);
  saveAllLogs(logs);
}

export function getAllDayKeysSorted() {
  const logs = getAllLogs();
  return Object.keys(logs).sort((a, b) => (a < b ? 1 : -1));
}

export function clearAllData() {
  localStorage.removeItem(LOGS_KEY);
  localStorage.removeItem(SETTINGS_KEY);
}

export function makeEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
