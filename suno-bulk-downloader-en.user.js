// ==UserScript==
// @name         Suno Bulk Downloader (EN)
// @namespace    local.suno.tools
// @version      9.2.0
// @description  Bulk-download the tracks you select from your Suno library as WAV/MP3, named after each track
// @match        https://suno.com/*
// @match        https://www.suno.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @grant        unsafeWindow
// @grant        GM_addElement
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Cape-PC/suno-bulk-downloader/main/suno-bulk-downloader-en.user.js
// @downloadURL  https://raw.githubusercontent.com/Cape-PC/suno-bulk-downloader/main/suno-bulk-downloader-en.user.js
// @homepageURL  https://github.com/Cape-PC/suno-bulk-downloader
// @supportURL   https://github.com/Cape-PC/suno-bulk-downloader/issues
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'https://studio-api-prod.suno.com/api/gen';
  const CDN_BASE = 'https://cdn1.suno.ai';
  const POLL_INTERVAL = 2000;  // interval while waiting for the WAV conversion to finish
  const POLL_MAX = 45;         // max polling attempts (~90 seconds)
  const BETWEEN_SONGS = 1000;  // pause before moving on to the next track

  GM_addStyle(`
    #sbd-panel h4 { margin:0 0 8px; font-size:13px; font-weight:600; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none; }
    #sbd-panel select, #sbd-panel button { width:100%; padding:7px; margin-top:6px; cursor:pointer;
      background:#2d6cdf; color:#fff; border:0; border-radius:6px; font-size:13px; }
    #sbd-panel select { background:#2a2a2a; }
    #sbd-panel button:disabled { background:#555; cursor:default; }
    #sbd-panel button.sbd-sub { background:#3a3a3a; }
    #sbd-opt { display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; cursor:pointer; }
    #sbd-list { margin-top:8px; max-height:220px; overflow:auto; border:1px solid #333; border-radius:6px; }
    #sbd-list label { display:flex; gap:6px; align-items:flex-start; padding:5px 6px; border-bottom:1px solid #2a2a2a; font-size:12px; cursor:pointer; }
    #sbd-list label:last-child { border-bottom:none; }
    #sbd-list input { margin-top:2px; }
    #sbd-list .sbd-liked { color:#4ea1ff; }
    #sbd-listctl { display:flex; gap:6px; margin-top:6px; }
    #sbd-listctl button { margin-top:0; padding:5px; font-size:11px; }
    #sbd-log { margin-top:8px; max-height:140px; overflow:auto; font-size:11px; color:#aaa; white-space:pre-wrap; }
  `);

  const panel = document.createElement('div');
  panel.id = 'sbd-panel';
  // Set layout-critical styles inline with !important so Suno's page CSS
  // or extension filters can't override or hide the panel.
  // Default position is offset from the bottom-right so it clears Suno's own volume slider.
  const forcedStyles = {
    position: 'fixed', right: '110px', bottom: '100px', 'z-index': '2147483647',
    background: '#181818', color: '#eee', font: '13px/1.5 system-ui,sans-serif',
    border: '1px solid #444', 'border-radius': '10px', padding: '12px', width: '300px',
    'box-shadow': '0 6px 24px rgba(0,0,0,.5)', display: 'block', visibility: 'visible', opacity: '1',
  };
  Object.entries(forcedStyles).forEach(([p, v]) => panel.style.setProperty(p, v, 'important'));
  panel.innerHTML = `
    <h4 title="Drag to move">Suno Bulk Downloader <span style="font-weight:400;color:#888;">v9.2.0</span><span id="sbd-min" style="cursor:pointer;font-weight:400;">—</span></h4>
    <div id="sbd-body">
      <select id="sbd-format">
        <option value="wav" selected>WAV</option>
        <option value="mp3">MP3</option>
      </select>
      <label id="sbd-opt"><input type="checkbox" id="sbd-likedonly"> Liked tracks only</label>
      <button id="sbd-scan" class="sbd-sub">Scan songs</button>
      <div id="sbd-list"></div>
      <div id="sbd-listctl">
        <button id="sbd-all" class="sbd-sub">Select all</button>
        <button id="sbd-none" class="sbd-sub">Deselect all</button>
      </div>
      <button id="sbd-run" disabled>Bulk download</button>
      <button id="sbd-stop" class="sbd-sub" style="display:none;">Stop</button>
      <div id="sbd-log">Go to your library screen and click "Scan songs."</div>
    </div>
  `;

  // Suno's React app re-renders and can wipe out anything appended under
  // body, so attach directly under html and restore it if that happens.
  function ensurePanelAttached() {
    if (!document.documentElement.contains(panel)) document.documentElement.appendChild(panel);
  }
  ensurePanelAttached();
  new MutationObserver(ensurePanelAttached).observe(document.documentElement, { childList: true });

  const $ = (sel) => panel.querySelector(sel);
  const logEl = $('#sbd-log');
  const listEl = $('#sbd-list');
  const runBtn = $('#sbd-run');
  const stopBtn = $('#sbd-stop');
  const scanBtn = $('#sbd-scan');
  const formatSel = $('#sbd-format');
  const likedOnly = $('#sbd-likedonly');

  $('#sbd-min').addEventListener('click', () => {
    const body = $('#sbd-body');
    body.style.display = body.style.display === 'none' ? '' : 'none';
  });

  // ---- Moving the panel (drag the header) -----------------------------
  // Lets you get it out of the way if it overlaps the playback bar or
  // volume slider. Position is saved to localStorage and restored next time.
  const POS_KEY = 'sbd-panel-pos';

  function applyPosition(left, top) {
    const w = panel.offsetWidth || 300;
    const h = panel.offsetHeight || 200;
    const x = Math.min(Math.max(0, left), window.innerWidth - w);
    const y = Math.min(Math.max(0, top), window.innerHeight - Math.min(h, 80));
    panel.style.setProperty('left', `${x}px`, 'important');
    panel.style.setProperty('top', `${y}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }

  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && typeof saved.left === 'number') applyPosition(saved.left, saved.top);
  } catch (e) { /* keep the default position if the saved value is corrupted */ }

  const header = $('h4');
  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'sbd-min') return;  // don't drag when clicking the collapse button
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;

    const onMove = (ev) => applyPosition(ev.clientX - dx, ev.clientY - dy);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      const r = panel.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
      } catch (e2) { /* not fatal if this can't be saved */ }
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  });

  const log = (msg) => { logEl.textContent = msg + '\n' + logEl.textContent; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let rows = [];       // { moreBtn, labelText, liked, checked }
  let aborted = false;

  // ---- Finding tracks ---------------------------------------------------

  // Each track row's "..." (more) button. Suno marks it with
  // data-context-menu-trigger="true".
  function findMoreButtons() {
    return Array.from(document.querySelectorAll('button[data-context-menu-trigger="true"]'));
  }

  // Suno's own UI text that shows up near a track row but isn't the track
  // title — filtered out so it's never mistaken for a song name. Covers
  // both the Japanese UI and the English UI (in case your Suno account is
  // set to display in English).
  const GENERIC_LABELS = new Set([
    'その他のオプション', 'リミックス', '編集', '公開', 'シェア', 'ダウンロード', '管理',
    'キューに追加', 'プレイリストに追加', 'ソングラジオ', 'ゴミ箱へ移動', 'ボイス',
  ]);
  // English UI labels, matched case-insensitively since Suno's exact casing
  // isn't guaranteed. Add to this list if you spot a menu label slipping
  // through as a track name on the English interface.
  const GENERIC_LABELS_EN = new Set([
    'more options', 'options', 'remix', 'edit', 'publish', 'share', 'download',
    'manage', 'add to queue', 'add to playlist', 'song radio', 'move to trash',
    'delete', 'voice', 'like', 'dislike', 'liked', 'audio', 'video',
  ]);
  function isGenericLabel(t) {
    if (!t) return true;
    if (GENERIC_LABELS.has(t)) return true;
    if (GENERIC_LABELS_EN.has(t.trim().toLowerCase())) return true;
    if (/^\d+:\d+$/.test(t)) return true;  // playback time, e.g. "1:23"
    if (/^v\d/i.test(t)) return true;      // version tag, e.g. "v5.5"
    return false;
  }

  function rowOf(btn) {
    return btn.closest('.clip-row') || btn.closest('[role="group"][aria-label]');
  }

  // The track title lives in the track row's (.clip-row) aria-label
  function guessLabel(btn, index) {
    const row = rowOf(btn);
    const rowLabel = row?.getAttribute('aria-label')?.trim();
    if (rowLabel && !isGenericLabel(rowLabel)) return rowLabel;
    const alt = row?.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    if (alt && !isGenericLabel(alt)) return alt.replace(/\s*artwork$/i, '');
    return `Track #${index + 1}`;
  }

  // "Liked" detection: only the pressed button carries the class
  // hxc-btn-variant-primary (unpressed is hxc-btn-variant-standard-legacy).
  // Matches the Like button's aria-label in either Japanese ("いいね") or
  // English ("Like"), so this works whether your Suno account is set to
  // Japanese or English.
  function isLiked(btn) {
    const row = rowOf(btn);
    if (!row) return false;
    for (const b of row.querySelectorAll('button[aria-label]')) {
      const label = b.getAttribute('aria-label') || '';
      const isLikeBtn = /いいね/.test(label) ? !/よくない/.test(label) : /\blike\b/i.test(label) && !/dislike/i.test(label);
      if (!isLikeBtn) continue;
      if (b.getAttribute('aria-pressed') === 'true') return true;
      if (/hxc-btn-variant-primary/.test(b.className)) return true;
    }
    return false;
  }

  function renderList() {
    listEl.innerHTML = rows
      .map((r, i) => `<label><input type="checkbox" data-i="${i}" ${r.checked ? 'checked' : ''}/> <span>${r.liked ? '<span class="sbd-liked">♥</span> ' : ''}${r.labelText}</span></label>`)
      .join('');
    listEl.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        rows[Number(e.target.dataset.i)].checked = e.target.checked;
        updateButtons();
      });
    });
  }

  function updateButtons() {
    runBtn.disabled = !rows.some((r) => r.checked);
  }

  function scan() {
    const buttons = findMoreButtons();
    // Only buttons inside a track row count. Folder cards don't have .clip-row.
    const inClipRow = buttons.filter((btn) => btn.closest('.clip-row'));
    let found = inClipRow.map((btn, i) => ({
      moreBtn: btn,
      labelText: guessLabel(btn, i),
      liked: isLiked(btn),
      checked: true,
    }));

    const likedCount = found.filter((r) => r.liked).length;
    if (likedOnly.checked) found = found.filter((r) => r.liked);

    rows = found;
    renderList();
    updateButtons();

    if (rows.length === 0) {
      log(likedOnly.checked
        ? `No liked tracks found (0 of ${inClipRow.length} visible tracks).`
        : 'No tracks found. Open a folder so tracks are listed on screen, then scan again.');
      return;
    }
    log(`Found ${rows.length} track(s) (${inClipRow.length} visible / ${likedCount} liked).`);
  }

  // ---- Getting the track ID -----------------------------------------------

  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function extractClipId(btn) {
    const row = rowOf(btn);
    if (!row) return null;
    const link = row.querySelector('a[href*="/song/"]')?.getAttribute('href');
    const fromLink = link?.match(UUID_RE);
    if (fromLink) return fromLink[0];
    const fromData = row.querySelector('[data-clip-id]')?.getAttribute('data-clip-id')?.match(UUID_RE);
    if (fromData) return fromData[0];
    for (const img of row.querySelectorAll('img[src]')) {
      const m = img.getAttribute('src').match(UUID_RE);
      if (m) return m[0];
    }
    const m = row.outerHTML.match(UUID_RE);
    return m ? m[0] : null;
  }

  // ---- Saving ---------------------------------------------------------------

  function sanitizeFileName(name) {
    return (name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  // Duplicate track names can happen, so append a number to avoid overwriting a file already saved this run
  const usedNames = new Set();
  function uniqueName(base, ext) {
    let name = `${base}.${ext}`;
    let n = 2;
    while (usedNames.has(name)) name = `${base} (${n++}).${ext}`;
    usedNames.add(name);
    return name;
  }

  async function downloadViaFetch(url, name) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      return { ok: false, error: `network error (${e && e.message ? e.message : e})` };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
    return { ok: true, size: blob.size };
  }

  function downloadViaGM(url, name) {
    return new Promise((resolve) => {
      GM_download({
        url, name, saveAs: false,
        onload: () => resolve({ ok: true }),
        onerror: (e) => resolve({ ok: false, error: (e && (e.error || e.details)) || 'error' }),
        ontimeout: () => resolve({ ok: false, error: 'timeout' }),
      });
    });
  }

  // ---- Resolving the audio URL ---------------------------------------------
  // WAV: runs the same steps as the on-screen download, in the same
  //   logged-in session.
  //   1) POST /api/gen/{id}/convert_wav/  start the conversion
  //   2) GET  /api/gen/{id}/wav_file/     → { wav_file_url }
  // MP3: no conversion needed — fetched straight from the CDN.

  // ---- Getting the auth token ------------------------------------------------
  // Suno's API wants a short-lived (~60 s) JWT issued by Clerk, sent as a
  // Bearer token. In case Suno changes something or Tampermonkey runs the
  // script in a different environment, these are tried in order, and the
  // reason each one fails is kept in diag and shown in the error message:
  //   A) unsafeWindow.Clerk.session.getToken()  after waiting for Clerk to load
  //   B) run getToken() in the page's own world and receive it via postMessage
  //   C) the __session cookie Clerk keeps (used only if it hasn't expired)
  // @auth-begin
  const AUTH_WAIT_FIRST = 6000;     // max time to wait for Clerk to show up, first call only (ms)
  const AUTH_WAIT_NEXT = 500;       // later calls (so a logged-out page doesn't stall every track)
  const AUTH_BRIDGE_TIMEOUT = 5000; // how long to wait for B to answer (ms)
  let authWaited = false;
  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  async function tokenFromClerk(diag, waitMs) {
    const start = Date.now();
    let c = pageWin.Clerk;
    while ((!c || !c.session) && Date.now() - start < waitMs) {
      await sleep(250);
      c = pageWin.Clerk;
    }
    if (!c) { diag.push('A:no-clerk'); return null; }
    if (!c.session) { diag.push('A:no-session'); return null; }
    try {
      const t = await c.session.getToken();
      if (t) return t;
      diag.push('A:empty-token');
    } catch (e) {
      diag.push('A:error(' + (e && e.message ? e.message : e) + ')');
    }
    return null;
  }

  function tokenFromPageWorld(diag) {
    return new Promise((resolve) => {
      const nonce = 'sbd_' + Math.random().toString(36).slice(2);
      let done = false;
      let timer = null;
      const finish = (t) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(t);
      };
      const onMsg = (ev) => {
        const d = ev && ev.data;
        if (!d || d.sbdNonce !== nonce) return;
        if (!d.token) diag.push('B:' + (d.note || 'empty'));
        finish(d.token || null);
      };
      timer = setTimeout(() => { diag.push('B:timeout'); finish(null); }, AUTH_BRIDGE_TIMEOUT);
      window.addEventListener('message', onMsg);

      // Run inside the page's world and send back only the result via
      // postMessage (the nonce tells it apart from any other message).
      const code =
        '(async()=>{var n=' + JSON.stringify(nonce) + ',t=null,note="";' +
        'try{var c=window.Clerk;if(!c)note="no-clerk";else if(!c.session)note="no-session";' +
        'else t=await c.session.getToken();}catch(e){note="error("+(e&&e.message)+")";}' +
        'window.postMessage({sbdNonce:n,token:t,note:note},"*");})();';
      try {
        // GM_addElement can insert a script without being blocked by the page's CSP
        if (typeof GM_addElement === 'function') {
          const el = GM_addElement('script', { textContent: code });
          if (el && el.remove) el.remove();
        } else {
          const s = document.createElement('script');
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        }
      } catch (e) {
        diag.push('B:inject-error(' + (e && e.message ? e.message : e) + ')');
        finish(null);
      }
    });
  }

  function jwtExpiry(jwt) {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const exp = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))).exp;
      return typeof exp === 'number' ? exp : null;
    } catch (e) {
      return null;
    }
  }

  function tokenFromCookie(diag) {
    let found = 0;
    for (const part of document.cookie.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const name = part.slice(0, i).trim();
      const val = part.slice(i + 1).trim();
      if (!/^__session(_.+)?$/.test(name)) continue;
      found++;
      const exp = jwtExpiry(val);
      if (exp !== null && exp * 1000 > Date.now() + 5000) return val;
    }
    diag.push(found ? 'C:expired-or-invalid' : 'C:no-session-cookie');
    return null;
  }

  async function acquireAuthToken() {
    const diag = [];
    const waitMs = authWaited ? AUTH_WAIT_NEXT : AUTH_WAIT_FIRST;
    authWaited = true;
    let token = await tokenFromClerk(diag, waitMs);
    if (!token) token = await tokenFromPageWorld(diag);
    if (!token) token = tokenFromCookie(diag);
    return { token, diag };
  }
  // @auth-end

  // Sends an authenticated request. If the token has expired (401), fetch a
  // fresh one and resend once.
  async function authedFetch(url, options, auth) {
    const send = () => fetch(url, {
      ...options,
      headers: { ...((options && options.headers) || {}), Authorization: `Bearer ${auth.token}` },
    });
    let res = await send();
    if (res.status === 401) {
      const again = await acquireAuthToken();
      if (again.token) {
        auth.token = again.token;
        res = await send();
      }
    }
    return res;
  }

  async function fetchWavUrl(clipId) {
    const { token, diag } = await acquireAuthToken();
    if (!token) {
      return { error: `Could not get an auth token (check that you're logged in) [diagnostics: ${diag.join(', ')}]` };
    }
    const auth = { token };

    const conv = await authedFetch(`${API_BASE}/${clipId}/convert_wav/`, { method: 'POST' }, auth);
    if (!conv.ok && conv.status !== 204) return { error: `Failed to start conversion — HTTP ${conv.status}` };

    for (let i = 0; i < POLL_MAX; i++) {
      if (aborted) return { error: 'stopped' };
      const res = await authedFetch(`${API_BASE}/${clipId}/wav_file/`, {}, auth);
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json && json.wav_file_url) return { url: json.wav_file_url };
      } else if (res.status === 402 || res.status === 403) {
        return { error: `HTTP ${res.status} (possibly a plan restriction)` };
      }
      await sleep(POLL_INTERVAL);
    }
    return { error: 'Timed out waiting for the conversion' };
  }

  async function resolveAudioUrl(clipId, format) {
    if (format === 'mp3') return { url: `${CDN_BASE}/${clipId}.mp3` };
    return await fetchWavUrl(clipId);
  }

  async function run() {
    const targets = rows.filter((r) => r.checked);
    if (targets.length === 0) return;
    const format = formatSel.value;      // 'wav' | 'mp3'
    aborted = false;
    runBtn.disabled = true;
    scanBtn.disabled = true;
    stopBtn.style.display = '';
    log(`Starting bulk download: ${targets.length} track(s) (${format.toUpperCase()})`);

    let done = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        if (aborted) { log('Stopped.'); break; }
        const row = targets[i];
        const id = extractClipId(row.moreBtn);
        if (!id) {
          log(`(${i + 1}/${targets.length}) Skipped: "${row.labelText}" — couldn't identify the track ID`);
          continue;
        }
        log(`(${i + 1}/${targets.length}) "${row.labelText}" — fetching...`);
        const { url, error } = await resolveAudioUrl(id, format);
        if (!url) {
          log(`  Failed: "${row.labelText}" — ${error} / ID=${id.slice(0, 8)}`);
          continue;
        }
        const name = uniqueName(sanitizeFileName(row.labelText) || id, format);
        let res = await downloadViaFetch(url, name);
        if (!res.ok) {
          const alt = await downloadViaGM(url, name);
          if (alt.ok) res = alt;
          else res = { ok: false, error: `${res.error} / GM:${alt.error}` };
        }
        if (res.ok) {
          done++;
          log(`  Saved: ${name}${res.size ? ` (${Math.round(res.size / 1024 / 1024)}MB)` : ''} / ID=${id.slice(0, 8)}`);
        } else {
          log(`  Failed: ${name} — ${res.error}`);
        }
        await sleep(BETWEEN_SONGS);
      }
      log(`Bulk download finished: saved ${done} track(s).`);
    } finally {
      stopBtn.style.display = 'none';
      scanBtn.disabled = false;
      updateButtons();
    }
  }

  scanBtn.addEventListener('click', scan);
  runBtn.addEventListener('click', run);
  stopBtn.addEventListener('click', () => { aborted = true; log('Stopping...'); });
  likedOnly.addEventListener('change', () => { if (rows.length > 0) scan(); });
  $('#sbd-all').addEventListener('click', () => { rows.forEach((r) => (r.checked = true)); renderList(); updateButtons(); });
  $('#sbd-none').addEventListener('click', () => { rows.forEach((r) => (r.checked = false)); renderList(); updateButtons(); });
})();
