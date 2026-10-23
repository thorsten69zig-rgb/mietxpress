/* Google Drive: die Hauptdaten liegen als eine JSON-Datei im eigenen Drive.
   Scope drive.file = die App sieht nur Dateien, die sie selbst angelegt hat. */
const GDRIVE = (function () {
  const NAME = 'mietxpress-daten.json';
  const FILES = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  async function check(res, what) {
    if (res.ok) return res;
    if (res.status === 403 || res.status === 404) throw new Error('Drive: Zugriff verweigert (' + res.status + '). Bitte neu verbinden.');
    throw new Error('Drive-Fehler ' + res.status + ' bei ' + what);
  }

  // Neueste Datei mit unserem Namen (oder null)
  async function find() {
    const q = "name='" + NAME + "' and trashed=false";
    const url = FILES + '?q=' + encodeURIComponent(q) + '&spaces=drive&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,modifiedTime)';
    const res = await check(await GCAL.authFetch(url), 'Suche');
    const j = await res.json();
    return j.files && j.files[0] ? { id: j.files[0].id, modified: j.files[0].modifiedTime } : null;
  }

  // Eingangsdateien von Claude (Scope drive.readonly nötig, damit die App Dateien anderer Herkunft sieht)
  async function listInbox() {
    const q = "name contains 'mietxpress-eingang' and trashed=false";
    const url = FILES + '?q=' + encodeURIComponent(q) + '&spaces=drive&orderBy=createdTime&pageSize=100&fields=files(id,name)';
    const res = await check(await GCAL.authFetch(url), 'Eingang');
    const j = await res.json();
    return j.files || [];
  }

  async function download(id) {
    const res = await check(await GCAL.authFetch(FILES + '/' + encodeURIComponent(id) + '?alt=media'), 'Laden');
    return res.json();
  }

  async function create(obj) {
    const boundary = 'mx' + Date.now();
    const meta = JSON.stringify({ name: NAME, mimeType: 'application/json' });
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
      '\r\n--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(obj) +
      '\r\n--' + boundary + '--';
    const res = await check(await GCAL.authFetch(UPLOAD + '?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
    }), 'Anlegen');
    const j = await res.json();
    return { id: j.id, modified: j.modifiedTime };
  }

  async function update(id, obj) {
    const res = await check(await GCAL.authFetch(UPLOAD + '/' + encodeURIComponent(id) + '?uploadType=media&fields=id,modifiedTime', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(obj)
    }), 'Speichern');
    const j = await res.json();
    return { id: j.id || id, modified: j.modifiedTime };
  }

  // ---- Zusammenführen (rein rechnerisch, ohne Oberfläche, gut testbar) ----
  // Buchungen: pro Buchung entscheidet der neuere Änderungszeitpunkt ("geaendert").
  // Gelöschte Buchungen merken sich einen Zeitpunkt ("geloescht"), damit sie nicht zurückkommen.
  // Artikel und Sperrliste: die neuere Fassung als Ganzes (artikelAt / sperrAt).
  const isDemo = (id) => /^demo\d+$/.test(String(id));
  const stamp = (x) => (x && x.geaendert) || '';
  const sortId = (a) => a.slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
  const same = (a, b) => JSON.stringify(sortId(a || [])) === JSON.stringify(sortId(b || []));

  function pickSet(l, lAt, r, rAt) {
    l = Array.isArray(l) ? l : [];
    const hasR = Array.isArray(r) && r.length > 0;
    if (!hasR) return { items: l, at: lAt || null, upload: l.length > 0 };
    if (!l.length) return { items: r, at: rAt || null, upload: false };
    if ((rAt || '') > (lAt || '')) return { items: r, at: rAt || null, upload: false };
    return { items: l, at: lAt || null, upload: !same(l, r) };
  }

  function merge(L, R) {
    L = L || {}; R = R || {};
    const lt = L.geloescht || {}, rt = R.geloescht || {};
    const lb = new Map((L.buchungen || []).filter((b) => !isDemo(b.id)).map((b) => [String(b.id), b]));
    const rb = new Map((R.buchungen || []).filter((b) => !isDemo(b.id)).map((b) => [String(b.id), b]));
    const ids = new Set([...lb.keys(), ...rb.keys()]);
    const out = [], tomb = {};
    const stat = { neu: 0, aktualisiert: 0, geloescht: 0 };
    let upload = (R.version || 0) < 2;
    ids.forEach((id) => {
      const l = lb.get(id), r = rb.get(id);
      const c = l && r ? (stamp(r) > stamp(l) ? r : l) : (l || r);
      const t = [lt[id], rt[id]].filter(Boolean).sort().pop();
      if (t && t >= stamp(c)) {
        tomb[id] = t;
        if (l) stat.geloescht++;
        if (r || rt[id] !== t) upload = true;
        return;
      }
      out.push(c);
      if (c === r && !l) stat.neu++;
      else if (c === r && l && stamp(r) !== stamp(l)) stat.aktualisiert++;
      if (c === l && (!r || stamp(r) !== stamp(l))) upload = true;
    });
    // alte Löschmarken ohne passende Buchung behalten (90 Tage), damit sie auch andere Geräte erreichen
    const cut = new Date(Date.now() - 90 * 864e5).toISOString();
    [lt, rt].forEach((m) => Object.keys(m).forEach((id) => {
      if (!tomb[id] && !ids.has(id) && m[id] > cut) { tomb[id] = m[id]; if (rt[id] !== m[id]) upload = true; }
    }));
    const art = pickSet(L.artikel, L.artikelAt, R.artikel, R.artikelAt);
    const sp = pickSet(L.sperrliste, L.sperrAt, R.sperrliste, R.sperrAt);
    if (art.upload || sp.upload) upload = true;
    return { buchungen: out, artikel: art.items, sperrliste: sp.items, geloescht: tomb,
      artikelAt: art.at, sperrAt: sp.at, stat, upload };
  }

  return { NAME, find, listInbox, download, create, update, merge };

})();
