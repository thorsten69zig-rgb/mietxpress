/* Google-Anbindung: Anmelden (Google Identity Services, nur im Browser, kein Server)
   und Kalender lesen. Das Skript von Google wird erst beim Antippen geladen, damit die
   App offline sofort startet. Der Zugriff ist nur lesend (calendar.readonly). */
const GCAL = (function () {
  const CLIENT_ID = '780465482026-0kj6jjln8md7c96hiphjvs0tom5k8fg9.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
  const API = 'https://www.googleapis.com/calendar/v3';
  const PALETTE = ['#6d28d9', '#0f766e', '#b58900', '#2b6cb0', '#be123c', '#047857', '#9333ea', '#c2410c'];

  let tokenClient = null;
  let token = null;
  let tokenExp = 0;

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google ist nicht erreichbar. Bist du offline?'));
      document.head.append(s);
    });
  }

  // Muss durch einen Fingertipp ausgelöst werden (sonst blockiert iOS das Anmeldefenster)
  let pending = null;
  function signIn() {
    if (token && Date.now() < tokenExp) return Promise.resolve(token);
    if (pending) return pending;
    pending = (async () => {
      await loadGsi();
      return new Promise((resolve, reject) => {
        if (!tokenClient) {
          tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
        }
        tokenClient.callback = (r) => {
          if (r.error) return reject(new Error(r.error_description || r.error));
          token = r.access_token;
          tokenExp = Date.now() + ((Number(r.expires_in) || 3600) - 60) * 1000;
          resolve(token);
        };
        tokenClient.error_callback = (e) => reject(new Error(e && e.type === 'popup_closed' ? 'Anmeldung abgebrochen' : 'Anmeldung fehlgeschlagen'));
        tokenClient.requestAccessToken({ prompt: '' });
      });
    })();
    const clear = () => { pending = null; };
    pending.then(clear, clear);
    return pending;
  }

  function signOut() {
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) { /* egal */ }
    }
    token = null;
    tokenExp = 0;
  }

  const isSignedIn = () => !!token && Date.now() < tokenExp;

  async function api(path, params) {
    if (!isSignedIn()) throw new Error('Nicht angemeldet');
    const url = new URL(API + path);
    Object.keys(params || {}).forEach((k) => { if (params[k] != null) url.searchParams.set(k, params[k]); });
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 401) { token = null; tokenExp = 0; throw new Error('Anmeldung abgelaufen, bitte neu verbinden'); }
    if (!res.ok) throw new Error('Google-Fehler ' + res.status);
    return res.json();
  }

  // Allgemeiner Aufruf mit Anmelde-Token (für Drive)
  async function authFetch(url, opts) {
    if (!isSignedIn()) throw new Error('Nicht angemeldet');
    const o = Object.assign({}, opts || {});
    o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Bearer ' + token });
    let res;
    try { res = await fetch(url, o); } catch (e) { throw new Error('Google ist nicht erreichbar. Bist du offline?'); }
    if (res.status === 401) { token = null; tokenExp = 0; throw new Error('Anmeldung abgelaufen, bitte neu verbinden'); }
    return res;
  }

  // Termine schreiben (nur Buchungs-Termine; der Bereich calendar.events erlaubt nur Termine, keine Kalender-Einstellungen)
  async function calWrite(method, path, body) {
    const opts = { method };
    if (body) { opts.headers = { 'Content-Type': 'application/json' }; opts.body = JSON.stringify(body); }
    const res = await authFetch(API + path, opts);
    if (res.status === 404 || res.status === 410) return { gone: true };
    if (res.status === 403) throw new Error('Kalender-Schreibrecht fehlt. Bitte "Verbindung trennen" und neu verbinden.');
    if (!res.ok) throw new Error('Google-Fehler ' + res.status + ' beim Eintragen');
    return method === 'DELETE' ? {} : res.json();
  }
  const evPath = (cal, id) => '/calendars/' + encodeURIComponent(cal) + '/events' + (id ? '/' + encodeURIComponent(id) : '');
  const createEvent = (cal, ev) => calWrite('POST', evPath(cal), ev);
  const updateEvent = (cal, id, ev) => calWrite('PUT', evPath(cal, id), ev);
  const deleteEvent = (cal, id) => calWrite('DELETE', evPath(cal, id));

  async function listCalendars() {
    const j = await api('/users/me/calendarList', { minAccessRole: 'reader', maxResults: 100 });
    return (j.items || []).map((c, i) => ({
      id: c.id,
      name: c.summaryOverride || c.summary || c.id,
      color: PALETTE[i % PALETTE.length],
      primary: !!c.primary,
      access: c.accessRole || ''
    }));
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const prevDay = (s) => { const p = s.split('-').map(Number); return isoLocal(new Date(p[0], p[1] - 1, p[2] - 1)); };

  // Google-Termin in unser Format: ganztägige Termine enden bei Google "exklusiv"
  function normEvent(ev, calId) {
    if (!ev || ev.status === 'cancelled' || !ev.start) return null;
    let start, ende, zeit = '';
    if (ev.start.date) {
      start = ev.start.date;
      ende = ev.end && ev.end.date ? prevDay(ev.end.date) : start;
      if (ende < start) ende = start;
    } else if (ev.start.dateTime) {
      const s = new Date(ev.start.dateTime);
      start = isoLocal(s);
      zeit = pad(s.getHours()) + ':' + pad(s.getMinutes());
      ende = start;
      if (ev.end && ev.end.dateTime) {
        const e = new Date(ev.end.dateTime);
        ende = isoLocal(e);
        if (ende > start && e.getHours() === 0 && e.getMinutes() === 0) ende = prevDay(ende);
        if (ende < start) ende = start;
      }
    } else return null;
    return { id: calId + ':' + ev.id, cal: calId, title: ev.summary || '(ohne Titel)', start, ende, zeit, ort: ev.location || '', typ: ev.eventType || '' };
  }

  async function listEvents(calId, fromIso, toIso) {
    const out = [];
    let pageToken = null;
    for (let page = 0; page < 6; page++) {
      const j = await api('/calendars/' + encodeURIComponent(calId) + '/events', {
        singleEvents: 'true', orderBy: 'startTime', maxResults: 250, pageToken,
        timeMin: new Date(fromIso + 'T00:00:00').toISOString(),
        timeMax: new Date(toIso + 'T00:00:00').toISOString()
      });
      (j.items || []).forEach((ev) => { const n = normEvent(ev, calId); if (n) out.push(n); });
      pageToken = j.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  return { signIn, signOut, isSignedIn, authFetch, listCalendars, listEvents, normEvent, createEvent, updateEvent, deleteEvent };
})();
