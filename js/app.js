import {
  getSettings,
  saveSettings,
  getDayEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  getAllDayKeysSorted,
  getMostRecentEntry,
  previousDayKey,
  clearAllData,
  todayKey,
  makeEntryId,
} from './storage.js';
import { parseFoodDescription, NutritionApiError } from './api.js';
import {
  getFastingStatus,
  formatHours,
  formatDuration,
  windowLengthHours,
  fastedHoursBeforeFirstMeal,
} from './fasting.js';
import { dailyScore } from './scoring.js';

const app = document.getElementById('app');
let draft = null; // manual-entry values, only populated when automatic parsing fails
let toast = null; // one-shot success banner shown on the next Today render
let fastingTimerId = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function toTimeValue(timestamp) {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function currentScreen() {
  const hash = location.hash.replace('#', '') || 'log';
  return ['log', 'today', 'history', 'settings'].includes(hash) ? hash : 'log';
}

function navigate(screen) {
  location.hash = screen;
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

function render() {
  const screen = currentScreen();
  draft = screen === 'log' ? draft : null;
  stopFastingTimer();

  if (screen === 'log') app.innerHTML = renderLog();
  else if (screen === 'today') app.innerHTML = renderToday();
  else if (screen === 'history') app.innerHTML = renderHistory();
  else if (screen === 'settings') app.innerHTML = renderSettings();

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.screen === screen);
  });

  attachHandlers(screen);

  if (screen === 'today') startFastingTimer();
}

// ---------- LOG screen ----------

function renderLog() {
  if (draft) {
    return `
      <section class="screen">
        <h1>Enter manually</h1>
        <p class="muted">${escapeHtml(draft.confidence_note || '')}</p>
        <form id="confirm-form" class="card form">
          <label>Food<input type="text" name="food_name" value="${escapeHtml(draft.food_name)}" required></label>
          <label>Calories<input type="number" name="calories" value="${draft.calories}" step="1" min="0" required></label>
          <label>Protein (g)<input type="number" name="protein_g" value="${draft.protein_g}" step="0.1" min="0" required></label>
          <label>Carbs (g)<input type="number" name="carbs_g" value="${draft.carbs_g}" step="0.1" min="0"></label>
          <label>Fat (g)<input type="number" name="fat_g" value="${draft.fat_g}" step="0.1" min="0"></label>
          <div class="btn-row">
            <button type="button" id="discard-btn" class="btn secondary">Discard</button>
            <button type="submit" class="btn primary">Save</button>
          </div>
        </form>
      </section>`;
  }

  return `
    <section class="screen">
      <h1>Log food</h1>
      <p class="muted">Type it, or tap your keyboard's mic to dictate.</p>
      <form id="log-form" class="card form">
        <textarea name="description" rows="3" placeholder="e.g. large chicken burrito bowl with rice and beans" required autofocus></textarea>
        <div class="btn-row">
          <button type="submit" class="btn primary" id="log-submit">Log it</button>
        </div>
      </form>
      <div id="log-loading" class="muted hidden">Estimating nutrition…</div>
    </section>`;
}

// ---------- TODAY screen ----------

function renderToday() {
  const settings = getSettings();
  const key = todayKey();
  const entries = getDayEntries(key);
  const result = dailyScore(entries, settings);
  const lastEntry = getMostRecentEntry();
  const status = getFastingStatus(new Date(), settings, lastEntry?.timestamp ?? null);

  const flash = toast;
  toast = null;

  const entryRows = entries
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(
      (e) => `
      <li class="entry" data-id="${e.id}">
        <div class="entry-main">
          <span class="entry-name">${escapeHtml(e.food_name)}</span>
          <input type="time" class="entry-time-input" data-id="${e.id}" value="${toTimeValue(e.timestamp)}">
        </div>
        <div class="entry-macros muted">${Math.round(e.calories)} cal · ${Math.round(e.protein_g)}g protein</div>
        <button class="delete-entry" data-id="${e.id}" aria-label="Delete">✕</button>
      </li>`
    )
    .join('');

  return `
    <section class="screen">
      <h1>Today</h1>
      ${flash ? `<div class="toast">${escapeHtml(flash)}</div>` : ''}
      <div class="card score-card">
        <div class="score-number">${result.score}</div>
        <div class="score-label">Daily score</div>
        <div class="score-breakdown muted">
          Calories ${result.calorieScore} · Protein ${result.proteinScore} · Fasting ${result.fastingScore}
        </div>
      </div>

      <div class="card">
        <div class="stat-row">
          <div class="stat"><span class="stat-value">${Math.round(result.totals.calories)}</span><span class="stat-label">/ ${settings.calorieTarget} cal</span></div>
          <div class="stat"><span class="stat-value">${Math.round(result.totals.protein_g)}</span><span class="stat-label">/ ${settings.proteinTarget} g protein</span></div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${Math.min(100, (result.totals.calories / settings.calorieTarget) * 100)}%"></div></div>
        <div class="bar"><div class="bar-fill protein" style="width:${Math.min(100, (result.totals.protein_g / settings.proteinTarget) * 100)}%"></div></div>
      </div>

      <div id="fasting-card" class="card fasting-card ${status.inWindow ? 'in-window' : 'fasting'}">
        <div id="fasting-window-label">${status.label}</div>
        <div id="fasting-elapsed" class="fasting-timer">${status.hoursSinceLastMeal !== null ? `${formatDuration(status.hoursSinceLastMeal)} since last meal` : 'No meals logged yet'}</div>
      </div>

      <h2>Entries</h2>
      ${entries.length ? `<ul class="entry-list">${entryRows}</ul>` : '<p class="muted">Nothing logged yet today.</p>'}
    </section>`;
}

function startFastingTimer() {
  const settings = getSettings();
  const lastEntry = getMostRecentEntry();
  const lastTimestamp = lastEntry?.timestamp ?? null;

  const tick = () => {
    const card = document.getElementById('fasting-card');
    if (!card) {
      stopFastingTimer();
      return;
    }
    const status = getFastingStatus(new Date(), settings, lastTimestamp);
    card.classList.toggle('in-window', status.inWindow);
    card.classList.toggle('fasting', !status.inWindow);
    document.getElementById('fasting-window-label').textContent = status.label;
    document.getElementById('fasting-elapsed').textContent =
      status.hoursSinceLastMeal !== null
        ? `${formatDuration(status.hoursSinceLastMeal)} since last meal`
        : 'No meals logged yet';
  };

  fastingTimerId = setInterval(tick, 1000);
}

function stopFastingTimer() {
  if (fastingTimerId) {
    clearInterval(fastingTimerId);
    fastingTimerId = null;
  }
}

// ---------- HISTORY screen ----------

function dayStats(key, settings) {
  const entries = getDayEntries(key);
  const result = dailyScore(entries, settings);
  const fastedHours = fastedHoursBeforeFirstMeal(entries, getDayEntries(previousDayKey(key)));
  return { key, result, fastedHours };
}

function sparkBarChart({ label, values, target, color }) {
  const width = 320;
  const height = 60;
  const gap = 4;
  const n = values.length;
  const barWidth = (width - gap * (n - 1)) / n;
  const maxVal = Math.max(target || 0, ...values.map((v) => v ?? 0), 1) * 1.15;
  const targetY = height - (Math.min(target || 0, maxVal) / maxVal) * height;

  const bars = values
    .map((v, i) => {
      if (v == null) return '';
      const h = (v / maxVal) * height;
      const x = i * (barWidth + gap);
      const y = height - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}"></rect>`;
    })
    .join('');

  const targetLine = target
    ? `<line x1="0" y1="${targetY.toFixed(1)}" x2="${width}" y2="${targetY.toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3,3" stroke-width="1"></line>`
    : '';

  return `
    <div class="chart-block">
      <div class="chart-label">${label}</div>
      <svg viewBox="0 0 ${width} ${height}" class="chart-svg" preserveAspectRatio="none">${targetLine}${bars}</svg>
    </div>`;
}

function renderHistory() {
  const settings = getSettings();
  const keys = getAllDayKeysSorted(); // newest first

  if (!keys.length) {
    return `<section class="screen"><h1>History</h1><p class="muted">No days logged yet.</p></section>`;
  }

  const chartKeys = keys.slice(0, 14).slice().reverse(); // oldest -> newest, most recent 14
  const chartStats = chartKeys.map((key) => dayStats(key, settings));
  const fastedTarget = Math.max(0, 24 - windowLengthHours(settings.windowStart, settings.windowEnd));

  const chartsHtml = `
    <div class="card">
      ${sparkBarChart({ label: 'Calories', values: chartStats.map((d) => d.result.totals.calories), target: settings.calorieTarget, color: 'var(--primary-light)' })}
      ${sparkBarChart({ label: 'Protein (g)', values: chartStats.map((d) => d.result.totals.protein_g), target: settings.proteinTarget, color: '#4a90d9' })}
      ${sparkBarChart({ label: 'Hours fasted', values: chartStats.map((d) => d.fastedHours), target: fastedTarget, color: '#d9a24a' })}
      <div class="chart-range muted">${chartKeys[0]} → ${chartKeys[chartKeys.length - 1]}</div>
    </div>`;

  const rows = keys
    .map((key) => {
      const { result, fastedHours } = dayStats(key, settings);
      return `
      <li class="history-row">
        <span class="history-date">${key}</span>
        <span class="history-score">${result.score}</span>
        <span class="muted">${Math.round(result.totals.calories)} cal · ${Math.round(result.totals.protein_g)}g protein${fastedHours != null ? ` · ${formatHours(fastedHours)} fasted` : ''}</span>
      </li>`;
    })
    .join('');

  return `
    <section class="screen">
      <h1>History</h1>
      ${chartsHtml}
      <ul class="history-list">${rows}</ul>
    </section>`;
}

// ---------- SETTINGS screen ----------

function renderSettings() {
  const s = getSettings();
  return `
    <section class="screen">
      <h1>Settings</h1>
      <form id="settings-form" class="card form">
        <label>Anthropic API key<input type="password" name="apiKey" value="${escapeHtml(s.apiKey)}" placeholder="sk-ant-..."></label>
        <label>Daily calorie target<input type="number" name="calorieTarget" value="${s.calorieTarget}" min="0" step="10"></label>
        <label>Daily protein target (g)<input type="number" name="proteinTarget" value="${s.proteinTarget}" min="0" step="1"></label>
        <label>Eating window start<input type="time" name="windowStart" value="${s.windowStart}"></label>
        <label>Eating window end<input type="time" name="windowEnd" value="${s.windowEnd}"></label>
        <div class="btn-row">
          <button type="submit" class="btn primary">Save settings</button>
        </div>
      </form>
      <button id="clear-data-btn" class="btn danger">Clear all data</button>
    </section>`;
}

// ---------- Event handling ----------

function attachHandlers(screen) {
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.onclick = () => navigate(el.dataset.screen);
  });

  if (screen === 'log') {
    if (draft) {
      const form = document.getElementById('confirm-form');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const entry = {
          id: makeEntryId(),
          timestamp: Date.now(),
          food_name: fd.get('food_name'),
          calories: Number(fd.get('calories')) || 0,
          protein_g: Number(fd.get('protein_g')) || 0,
          carbs_g: Number(fd.get('carbs_g')) || 0,
          fat_g: Number(fd.get('fat_g')) || 0,
        };
        addEntry(entry);
        toast = `Logged "${entry.food_name}" — ${Math.round(entry.calories)} cal, ${Math.round(entry.protein_g)}g protein`;
        draft = null;
        navigate('today');
      });
      document.getElementById('discard-btn').addEventListener('click', () => {
        draft = null;
        render();
      });
    } else {
      const form = document.getElementById('log-form');
      const loadingEl = document.getElementById('log-loading');
      const submitBtn = document.getElementById('log-submit');
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const description = new FormData(form).get('description')?.trim();
        if (!description) return;
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;
        try {
          const settings = getSettings();
          const parsed = await parseFoodDescription(description, settings);
          const entry = {
            id: makeEntryId(),
            timestamp: Date.now(),
            food_name: parsed.food_name,
            calories: parsed.calories,
            protein_g: parsed.protein_g,
            carbs_g: parsed.carbs_g,
            fat_g: parsed.fat_g,
          };
          addEntry(entry);
          toast = `Logged "${entry.food_name}" — ${Math.round(entry.calories)} cal, ${Math.round(entry.protein_g)}g protein`;
          navigate('today');
        } catch (err) {
          const message = err instanceof NutritionApiError ? err.message : 'Something went wrong. Try again.';
          draft = {
            food_name: description,
            calories: 0,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            confidence_note: `${message} Fill in values manually below.`,
          };
          render();
        } finally {
          loadingEl.classList.add('hidden');
          submitBtn.disabled = false;
        }
      });
    }
  }

  if (screen === 'today') {
    document.querySelectorAll('.delete-entry').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteEntry(todayKey(), btn.dataset.id);
        render();
      });
    });
    document.querySelectorAll('.entry-time-input').forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.value) return;
        const key = todayKey();
        const entry = getDayEntries(key).find((e) => e.id === input.dataset.id);
        if (!entry) return;
        const [hours, minutes] = input.value.split(':').map(Number);
        const updated = new Date(entry.timestamp);
        updated.setHours(hours, minutes, 0, 0);
        updateEntry(key, entry.id, { timestamp: updated.getTime() });
        render();
      });
    });
  }

  if (screen === 'settings') {
    const form = document.getElementById('settings-form');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const current = getSettings();
      saveSettings({
        ...current,
        apiKey: fd.get('apiKey')?.trim() || '',
        calorieTarget: Number(fd.get('calorieTarget')) || 0,
        proteinTarget: Number(fd.get('proteinTarget')) || 0,
        windowStart: fd.get('windowStart') || '00:00',
        windowEnd: fd.get('windowEnd') || '23:59',
      });
      navigate('today');
    });
    document.getElementById('clear-data-btn').addEventListener('click', () => {
      if (confirm('Delete all logged data and settings? This cannot be undone.')) {
        clearAllData();
        render();
      }
    });
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

render();
