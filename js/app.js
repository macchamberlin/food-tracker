import {
  getSettings,
  saveSettings,
  getDayEntries,
  addEntry,
  deleteEntry,
  getAllDayKeysSorted,
  clearAllData,
  todayKey,
  makeEntryId,
} from './storage.js';
import { parseFoodDescription, NutritionApiError } from './api.js';
import { getFastingStatus, formatHours } from './fasting.js';
import { dailyScore } from './scoring.js';

const app = document.getElementById('app');
let draft = null; // parsed-but-unsaved nutrition result, held between Log and its confirm step

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
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

  if (screen === 'log') app.innerHTML = renderLog();
  else if (screen === 'today') app.innerHTML = renderToday();
  else if (screen === 'history') app.innerHTML = renderHistory();
  else if (screen === 'settings') app.innerHTML = renderSettings();

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.screen === screen);
  });

  attachHandlers(screen);
}

// ---------- LOG screen ----------

function renderLog() {
  if (draft) {
    return `
      <section class="screen">
        <h1>Confirm entry</h1>
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
  const status = getFastingStatus(new Date(), settings, entries);

  const entryRows = entries
    .slice()
    .reverse()
    .map(
      (e) => `
      <li class="entry" data-id="${e.id}">
        <div class="entry-main">
          <span class="entry-name">${escapeHtml(e.food_name)}</span>
          <span class="entry-time">${new Date(e.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
        <div class="entry-macros muted">${Math.round(e.calories)} cal · ${Math.round(e.protein_g)}g protein</div>
        <button class="delete-entry" data-id="${e.id}" aria-label="Delete">✕</button>
      </li>`
    )
    .join('');

  return `
    <section class="screen">
      <h1>Today</h1>
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

      <div class="card fasting-card ${status.inWindow ? 'in-window' : 'fasting'}">
        <div>${status.label}</div>
        ${status.hoursSinceLastMeal !== null ? `<div class="muted">Last ate ${formatHours(status.hoursSinceLastMeal)} ago</div>` : ''}
      </div>

      <h2>Entries</h2>
      ${entries.length ? `<ul class="entry-list">${entryRows}</ul>` : '<p class="muted">Nothing logged yet today.</p>'}
    </section>`;
}

// ---------- HISTORY screen ----------

function renderHistory() {
  const settings = getSettings();
  const keys = getAllDayKeysSorted();

  if (!keys.length) {
    return `<section class="screen"><h1>History</h1><p class="muted">No days logged yet.</p></section>`;
  }

  const rows = keys
    .map((key) => {
      const entries = getDayEntries(key);
      const result = dailyScore(entries, settings);
      return `
      <li class="history-row">
        <span class="history-date">${key}</span>
        <span class="history-score">${result.score}</span>
        <span class="muted">${Math.round(result.totals.calories)} cal · ${Math.round(result.totals.protein_g)}g protein</span>
      </li>`;
    })
    .join('');

  return `
    <section class="screen">
      <h1>History</h1>
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
          const result = await parseFoodDescription(description, settings);
          draft = result;
          render();
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
