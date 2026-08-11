# Food Tracker

A no-build, installable web app for logging food by text or voice from your phone. Claude estimates calories/protein from your description; the app tracks your intermittent fasting window and rolls everything into a daily score.

Everything runs client-side — no server, no database. Your logs live in your phone browser's local storage. The only network call is straight to the Claude API to parse each food description.

## 1. Get an Anthropic API key

1. Go to https://console.anthropic.com and create an account.
2. Add billing (pay-as-you-go — nutrition parsing with Haiku costs a small fraction of a cent per log).
3. Create an API key under **API Keys** and copy it.

You'll paste this into the app's **Settings** tab once it's running. It's stored only in your phone browser's local storage — never sent anywhere except directly to Anthropic's API.

**Security note:** because this app calls the Claude API directly from the browser (no backend), your API key is visible in your browser's network/dev tools while the app runs. That's fine for a private app only you use on your own phone, but don't share the deployed URL or your phone's browser session with anyone else.

## 2. Push this repo to GitHub

1. Create a new empty repository on GitHub, e.g. named `food-tracker` (don't initialize it with a README).
2. This folder already has a local git repo with a commit. From this folder, run:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/food-tracker.git
git push -u origin main
```

## 3. Turn on GitHub Pages

1. On GitHub, open the repo → **Settings** → **Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Save. After a minute your app will be live at `https://<your-username>.github.io/food-tracker/`.

## 4. Install it on your phone

1. Open that URL in your phone's browser (Safari on iOS, Chrome on Android).
2. Use the browser's **Share → Add to Home Screen** (iOS) or **⋮ menu → Install app** (Android).
3. Open it from the home screen icon — it runs full-screen like a native app.
4. Go to **Settings** in the app and paste your Anthropic API key, then set your daily calorie/protein targets and eating window.

## Logging food

On the **Log** tab, type or tap your phone keyboard's microphone icon to dictate a description (e.g. "two eggs and toast with butter"), then **Log it**. Claude estimates calories/protein/carbs/fat and it's saved immediately — no extra confirmation step. If the API call fails (bad/missing key, offline, etc.) you'll get a manual entry form instead, so logging never dead-ends.

The **Today** tab shows a live ticking timer for how long it's been since your last meal, plus how long until your eating window opens or closes.

The **History** tab shows calorie, protein, and hours-fasted trends as bar charts for your last 14 days, with a dashed line marking your target for each, plus a day-by-day list below.

## How the daily score works

```
calorie score  = 100 − |calories − target| / target × 100      (closer to target = higher)
protein score  = min(100, protein / target × 100)               (meeting/exceeding target = full points)
fasting score  = % of today's logged entries that fall inside your eating window
daily score    = 0.4×calories + 0.3×protein + 0.3×fasting
```

Weights are defined in `js/scoring.js` if you want to tune them.

## Notes

- The nutrition model defaults to `claude-haiku-4-5-20251001` (fast, cheap). To use a more capable model, edit `model` in `js/storage.js`'s `DEFAULT_SETTINGS`.
- Offline support and "Add to Home Screen" install prompts only work once the app is served over HTTPS (i.e. after deploying to GitHub Pages) — they won't work when opening `index.html` directly from disk.
- To wipe all data, use **Settings → Clear all data**.
