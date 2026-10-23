/* MietXpress Offline-App – Etappe 1: lokale Daten, Monat / Liste / Bestand, Import & Backup */
(function () {
  'use strict';

  // ===== Konstanten =====
  const STATUS = { angefragt: 'Angefragt', bestaetigt: 'Bestätigt', abgeholt: 'Abgeholt', zurueck: 'Zurück', storniert: 'Storniert' };
  const CATS = { 'Hüpfburgen': '#2fa66a', 'Küche & Snack': '#e0a800', 'Technik & Licht': '#46A1D8', 'Möbel & Kühlung': '#a855f7' };
  const KAUT = { keine: 'Keine', offen: 'Offen', erhalten: 'Erhalten', zurueck: 'Zurückgegeben' };
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const state = {
    bookings: [], arts: [], sperre: [],
    view: 'monat', filter: 'anstehend', q: '',
    cursor: null, sel: null, open: {},
    von: '', bis: '',
    menu: false, online: navigator.onLine, importAt: null, ready: false,
    cal: { cals: [], sel: [], events: [], at: null, connected: false, busy: false, err: null },
    drive: { id: null, at: null, busy: false, err: null, msg: null },
    dirty: 0, tomb: {}, artikelAt: null, sperrAt: null, edit: null, paste: null, priceQ: '', pvon: '', pbis: '', pickup: null, info: null, chk: {}, revealUntil: 0, sperrOpen: false, sperrPre: null, sperrDelArm: null, bestandOpen: false, logo: null, delArm: null,
    calWrite: false, calDel: [], synced: false, autoAt: 0
  };

  // ===== Hilfsfunktionen =====
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const today0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmtD = (s) => { const d = parse(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; };
  const fmtFull = (s) => parse(s).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const wd = (s) => parse(s).toLocaleDateString('de-DE', { weekday: 'short' });
  const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  state.cursor = new Date(today0().getFullYear(), today0().getMonth(), 1);
  state.sel = iso(today0());
  state.von = iso(today0());

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.append(k.nodeType ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }

  // ===== Datenmodell (kompatibel zum Artefakt) =====
  function norm(b) {
    const start = b.start || b.ende || iso(new Date());
    const pos = Array.isArray(b.positionen) ? b.positionen.filter((p) => p && p.artikel) : null;
    const artText = b.artikel || (pos && pos.length
      ? pos.map((p) => (Number(p.anzahl) > 1 ? p.anzahl + '× ' : '') + p.artikel).join(', ') : '');
    return Object.assign({}, b, {
      id: String(b.id), name: b.name || '', adresse: b.adresse || '', telefon: b.telefon || '',
      plattform: b.plattform || '', artikel: artText, positionen: pos,
      start: start, ende: b.ende || start, zeit: b.zeit || '',
      abholzeit: b.abholzeit || '', rueckzeit: b.rueckzeit || '', erstellt: b.erstellt || '',
      preis: Number(b.preis) || 0, anzahlung: Number(b.anzahlung) || 0, kaution: Number(b.kaution) || 0,
      kautionStatus: b.kautionStatus || (Number(b.kaution) > 0 ? 'offen' : 'keine'),
      status: b.status || 'bestaetigt', notiz: b.notiz || '',
      rechnung: b.rechnung || '', rechnungNr: b.rechnungNr || '',
      gcalEventId: b.gcalEventId || null, gcalSig: b.gcalSig || ''
    });
  }
  function normArt(a, i) {
    return {
      id: String(a.id || a.name), name: a.name || String(a.id), kategorie: a.kategorie || 'Sonstiges',
      menge: a.menge == null ? null : Number(a.menge), sort: Number(a.sort) || i,
      enthaelt: Array.isArray(a.enthaelt) ? a.enthaelt : null
    };
  }
  const isActive = (b) => b.status !== 'storniert';
  const isOpenBooking = (b) => b.status !== 'storniert' && b.status !== 'zurueck';

  function bookCatColor(b) {
    const cats = {};
    let cnt = 0;
    Avail.positionsOf(b, state.arts).forEach((p) => {
      const a = Avail.artByName(state.arts, p.artikel);
      if (a && !cats[a.kategorie]) { cats[a.kategorie] = 1; cnt++; }
    });
    if (cnt === 1) return CATS[Object.keys(cats)[0]] || '#8b93a5';
    return cnt > 1 ? '#64748b' : '#8b93a5';
  }

  // ===== Sperrliste (nur Anzeige) =====
  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').trim();
  const normPhone = (s) => String(s || '').replace(/[^0-9]+/g, '').replace(/^0+/, '');
  function sperrMatch(b) {
    const bn = normName(b.name), bp = normPhone(b.telefon);
    for (const e of state.sperre) {
      const en = normName(e.name), ep = normPhone(e.telefon);
      if (en && bn && (bn === en || bn.indexOf(en) > -1 || en.indexOf(bn) > -1)) return e;
      if (ep && bp && ep.length >= 6 && bp.indexOf(ep) > -1) return e;
    }
    return null;
  }

  // ===== Laden / Speichern =====
  async function load() {
    const [b, a, s, imp] = await Promise.all([
      DB.getAll('buchungen'), DB.getAll('artikel'), DB.getAll('sperrliste'), DB.getMeta('importAt')
    ]);
    state.bookings = b.map(norm);
    state.arts = a.map(normArt).sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name));
    state.sperre = s;
    state.importAt = imp;
    const [gc, gs, ge, ga, gcon] = await Promise.all([
      DB.getMeta('gcalCals'), DB.getMeta('gcalSel'), DB.getMeta('gcalEvents'), DB.getMeta('gcalAt'), DB.getMeta('gcalConnected')
    ]);
    state.cal.cals = gc || [];
    state.cal.sel = gs || [];
    state.cal.events = ge || [];
    state.cal.at = ga || null;
    state.cal.connected = !!gcon;
    const [did, dat] = await Promise.all([DB.getMeta('driveFileId'), DB.getMeta('driveAt')]);
    state.drive.id = did || null;
    state.drive.at = dat || null;
    const [dirty, tomb, aAt, sAt] = await Promise.all([DB.getMeta('dirty'), DB.getMeta('tomb'), DB.getMeta('artikelAt'), DB.getMeta('sperrAt')]);
    state.dirty = Number(dirty) || 0;
    state.tomb = tomb || {};
    state.artikelAt = aAt || null;
    state.sperrAt = sAt || null;
    const [cw, cd] = await Promise.all([DB.getMeta('calWrite'), DB.getMeta('calDel')]);
    state.logo = (await DB.getMeta('logo')) || null;
    state.calWrite = !!cw;
    state.calDel = Array.isArray(cd) ? cd : [];
    state.ready = true;
  }

  // ===== Google-Kalender (nur lesen, offline zwischengespeichert) =====
  async function fetchEvents() {
    const t = today0();
    const from = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1));
    const to = iso(new Date(t.getFullYear(), t.getMonth() + 10, 1));
    let all = [];
    for (const id of state.cal.sel) all = all.concat(await GCAL.listEvents(id, from, to));
    state.cal.events = all;
    state.cal.at = new Date().toISOString();
    await DB.setMeta('gcalEvents', all);
    await DB.setMeta('gcalAt', state.cal.at);
  }

  async function connectGoogle() {
    state.cal.busy = true;
    state.cal.err = null;
    render();
    try {
      await GCAL.signIn();
      const cals = await GCAL.listCalendars();
      const keep = state.cal.sel.filter((id) => cals.some((c) => c.id === id));
      state.cal.sel = keep.length ? keep : cals.map((c) => c.id); // alle Kalender, auch private
      state.cal.cals = cals;
      state.cal.connected = true;
      await DB.setMeta('gcalCals', cals);
      await DB.setMeta('gcalSel', state.cal.sel);
      await DB.setMeta('gcalConnected', true);
      await fetchEvents();
    } catch (e) {
      state.cal.err = e.message || 'Fehler beim Verbinden';
    }
    state.cal.busy = false;
    render();
  }

  async function toggleCal(id) {
    const i = state.cal.sel.indexOf(id);
    if (i > -1) state.cal.sel.splice(i, 1); else state.cal.sel.push(id);
    await DB.setMeta('gcalSel', state.cal.sel);
    state.cal.events = state.cal.events.filter((ev) => state.cal.sel.indexOf(ev.cal) > -1);
    await DB.setMeta('gcalEvents', state.cal.events);
    if (GCAL.isSignedIn()) {
      try { await fetchEvents(); } catch (e) { state.cal.err = e.message; }
    }
    render();
  }

  async function disconnectGoogle() {
    GCAL.signOut();
    state.cal = { cals: [], sel: [], events: [], at: null, connected: false, busy: false, err: null };
    await DB.setMeta('gcalCals', []);
    await DB.setMeta('gcalSel', []);
    await DB.setMeta('gcalEvents', []);
    await DB.setMeta('gcalAt', null);
    await DB.setMeta('gcalConnected', false);
    state.drive.err = null; state.drive.msg = null;
    render();
  }

  function evMap() {
    const m = {};
    const linked = new Set(state.bookings.filter((b) => b.gcalEventId).map((b) => b.gcalEventId));
    state.cal.events.forEach((ev) => {
      if (state.cal.sel.indexOf(ev.cal) < 0) return;
      if (linked.has(ev.id.slice(ev.cal.length + 1))) return; // gehört zu einer Buchung, die schon als Buchung zu sehen ist
      let d = parse(ev.start);
      const end = parse(ev.ende);
      for (let n = 0; d <= end && n < 62; n++) {
        const k = iso(d);
        (m[k] = m[k] || []).push(ev);
        d = addDays(d, 1);
      }
    });
    return m;
  }
  const calColor = (id) => { const c = state.cal.cals.find((x) => x.id === id); return c ? c.color : '#6d28d9'; };


  // ===== Google Drive: Hauptdaten abgleichen =====
  const isDemoId = (id) => /^demo\d+$/.test(String(id));
  function payload() {
    return {
      version: 2, gespeichert: new Date().toISOString(),
      buchungen: state.bookings.filter((b) => !isDemoId(b.id)), artikel: state.arts, sperrliste: state.sperre,
      geloescht: state.tomb, artikelAt: state.artikelAt, sperrAt: state.sperrAt
    };
  }
  async function setDrive(id, at) {
    state.drive.id = id; state.drive.at = at;
    await DB.setMeta('driveFileId', id);
    await DB.setMeta('driveAt', at);
  }
  async function applyMerged(m) {
    await DB.replaceAll('buchungen', m.buchungen.map(norm));
    await DB.replaceAll('artikel', m.artikel.map(normArt));
    await DB.replaceAll('sperrliste', m.sperrliste);
    await DB.setMeta('tomb', m.geloescht);
    await DB.setMeta('artikelAt', m.artikelAt);
    await DB.setMeta('sperrAt', m.sperrAt);
    await load();
  }
  // ===== Buchungen in den Google-Kalender eintragen =====
  async function setCalDel(list) { state.calDel = list; await DB.setMeta('calDel', list); }
  async function calendarPush() {
    if (!state.calWrite) return null;
    const cals = await GCAL.listCalendars();
    state.cal.cals = state.cal.cals.map((c) => Object.assign({}, c, { access: (cals.find((x) => x.id === c.id) || {}).access || c.access }));
    await DB.setMeta('gcalCals', state.cal.cals);
    const miet = cals.find((c) => /mietxpress/i.test(c.name) && (c.access === 'owner' || c.access === 'writer'));
    if (!miet) throw new Error('Kalender "Müllers MietXpress" nicht gefunden oder nicht beschreibbar.');
    const pl = CALSYNC.plan(state.bookings, state.calDel);
    if (!pl.actions.length && !pl.dels.length) return { neu: 0, geaendert: 0, geloescht: 0 };
    const stat = await CALSYNC.run(pl, miet.id, GCAL,
      async (id, patch) => {
        const all = await DB.getAll('buchungen');
        const cur = all.find((x) => x.id === id);
        if (cur) await DB.put('buchungen', Object.assign({}, cur, patch, { geaendert: nowIso() }));
      },
      async (eventId) => { await setCalDel(state.calDel.filter((x) => x !== eventId)); });
    await load();
    return stat;
  }

  // Abgleichen: Drive und dieses Gerät werden zusammengeführt, nichts wird blind überschrieben
  // auto = stiller Versuch beim Öffnen: klappt nur, wenn iOS das Anmeldefenster ohne Fingertipp zulässt; sonst bleibt der Knopf oben
  async function driveSync(auto) {
    const d = state.drive;
    if (d.busy) return;
    d.busy = true; d.err = null; d.msg = null; render();
    try {
      if (auto === true) {
        await Promise.race([GCAL.signIn(), new Promise((_, rej) => setTimeout(() => rej(new Error('auto')), 8000))]);
      } else await GCAL.signIn();
      let inboxMsg = '';
      try {
        const ib = await processInbox();
        if (ib.dateien) inboxMsg = ' Eingang: ' + ib.neu + ' neu, ' + ib.geaendert + ' geändert' + (ib.weg ? ', ' + ib.weg + ' gelöscht' : '') + '.' + (ib.warn.length ? ' Hinweise: ' + ib.warn.join('; ') : '');
      } catch (e) { inboxMsg = ' Eingang nicht gelesen (' + (e.message || 'Fehler') + ').'; }
      const remote = await GDRIVE.find();
      let rdata = null;
      if (remote) {
        rdata = await GDRIVE.download(remote.id);
        if (!rdata || !Array.isArray(rdata.buchungen)) throw new Error('Die Drive-Datei hat ein unbekanntes Format.');
      }
      const m = GDRIVE.merge({
        buchungen: state.bookings, artikel: state.arts, sperrliste: state.sperre,
        geloescht: state.tomb, artikelAt: state.artikelAt, sperrAt: state.sperrAt
      }, rdata);
      // Buchungen, die durch den Abgleich verschwinden (auf anderem Gerät gelöscht), nehmen ihren Kalender-Termin mit
      const gone = state.bookings.filter((b) => b.gcalEventId && !m.buchungen.some((x) => String(x.id) === b.id)).map((b) => b.gcalEventId);
      if (gone.length) await setCalDel(state.calDel.concat(gone.filter((id) => state.calDel.indexOf(id) < 0)));
      await applyMerged(m);
      let res = remote;
      if (!remote) res = await GDRIVE.create(payload());
      else if (m.upload) res = await GDRIVE.update(remote.id, payload());
      await setDrive(res.id, res.modified || new Date().toISOString());
      state.dirty = 0;
      await DB.setMeta('dirty', 0);
      const st = m.stat;
      let calMsg = '';
      try {
        const cs = await calendarPush();
        if (cs) {
          calMsg = ' Kalender: ' + cs.neu + ' angelegt, ' + cs.geaendert + ' geändert, ' + cs.geloescht + ' gelöscht.';
          if (cs.neu || cs.geaendert || cs.geloescht) {
            const r2 = await GDRIVE.update(res.id, payload()); // Termin-IDs auch in Drive sichern
            await setDrive(res.id, r2.modified || new Date().toISOString());
            try { await fetchEvents(); } catch (e) { /* Anzeige aktualisiert sich beim nächsten Mal */ }
          }
        }
      } catch (e) { d.err = 'Kalender: ' + (e.message || 'Fehler'); }
      d.msg = 'Abgeglichen: ' + state.bookings.length + ' Buchungen (' + st.neu + ' neu aus Drive, ' + st.aktualisiert + ' aktualisiert, ' + st.geloescht + ' gelöscht). ' +
        (!remote ? 'Drive-Datei angelegt.' : (m.upload ? 'Drive ist aktuell.' : 'Drive war schon aktuell.')) + inboxMsg + calMsg;
      state.synced = true;
    } catch (e) { d.err = auto === true ? null : (e.message || 'Fehler beim Abgleichen'); }
    d.busy = false; render();
  }
  // Wiederherstellen: lokale Daten komplett durch Drive ersetzen (z. B. neues iPhone)
  async function driveLoad() {
    const d = state.drive;
    if (d.busy) return;
    d.busy = true; d.err = null; d.msg = null; render();
    try {
      await GCAL.signIn();
      const remote = await GDRIVE.find();
      if (!remote) throw new Error('In Drive gibt es noch keine Daten. Erst "Mit Drive abgleichen".');
      if ((state.bookings.length || state.arts.length) && !confirm('Lokale Daten (auch nicht abgeglichene Änderungen) werden durch die Daten aus Drive ersetzt. Fortfahren?')) {
        d.busy = false; render(); return;
      }
      const data = await GDRIVE.download(remote.id);
      if (!data || !Array.isArray(data.buchungen)) throw new Error('Die Drive-Datei hat ein unbekanntes Format.');
      await replaceData(data, { fromDrive: true });
      await setDrive(remote.id, remote.modified);
      d.msg = 'Aus Drive geladen: ' + state.bookings.length + ' Buchungen';
    } catch (e) { d.err = e.message || 'Fehler beim Laden'; }
    d.busy = false; render();
  }

  async function replaceData(data, opts) {
    opts = opts || {};
    const now = new Date().toISOString();
    const oldIds = state.bookings.map((b) => b.id);
    const bookings = (data.buchungen || []).map((b, i) => {
      const n = norm(Object.assign({ id: 'b' + i }, b));
      if (opts.stamp && !n.geaendert) n.geaendert = now;
      return n;
    });
    const arts = (data.artikel || []).map(normArt);
    const sperre = (data.sperrliste || []).map((e, i) => ({
      id: String(e.id || 's' + i), name: e.name || '', telefon: e.telefon || '', grund: e.grund || '', erstellt: e.erstellt || ''
    }));
    await DB.replaceAll('buchungen', bookings);
    await DB.replaceAll('artikel', arts);
    await DB.replaceAll('sperrliste', sperre);
    if (opts.stamp) {
      // Datei-Import = bewusster Neustart: bisherige, nicht mehr enthaltene Buchungen bleiben gelöscht
      const keep = new Set(bookings.map((b) => b.id));
      const tomb = Object.assign({}, state.tomb);
      keep.forEach((id) => { delete tomb[id]; });
      oldIds.forEach((id) => { if (!keep.has(id) && !isDemoId(id)) tomb[id] = now; });
      await DB.setMeta('tomb', tomb);
      await DB.setMeta('artikelAt', now);
      await DB.setMeta('sperrAt', now);
      await DB.setMeta('dirty', 1);
    } else if (opts.fromDrive) {
      await DB.setMeta('tomb', data.geloescht || {});
      await DB.setMeta('artikelAt', data.artikelAt || null);
      await DB.setMeta('sperrAt', data.sperrAt || null);
      await DB.setMeta('dirty', 0);
    }
    await DB.setMeta('importAt', now);
    await load();
  }

  function parseImport(text) {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return { buchungen: j };
    if (!j || typeof j !== 'object' || !Array.isArray(j.buchungen)) throw new Error('Keine Buchungen in der Datei gefunden.');
    return j;
  }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function demoData() {
    const t = today0();
    const d = (n) => iso(addDays(t, n));
    const arts = [
      { name: 'Hüpfburg Schloss', kategorie: 'Hüpfburgen', menge: 1, sort: 1 },
      { name: 'Hüpfburg Slide', kategorie: 'Hüpfburgen', menge: 1, sort: 2 },
      { name: 'Popcornmaschine Star', kategorie: 'Küche & Snack', menge: 2, sort: 3 },
      { name: 'PartyBox JBL 520', kategorie: 'Technik & Licht', menge: 1, sort: 4 },
      { name: 'Bierzeltgarnitur', kategorie: 'Möbel & Kühlung', menge: 10, sort: 5 }
    ];
    const bookings = [
      { id: 'demo1', name: 'Beispiel Familie A', telefon: '0151 0000001', adresse: 'Musterstraße 1, 44575 Castrop-Rauxel', plattform: 'whatsapp', start: d(1), ende: d(2), zeit: '10:00', status: 'bestaetigt', preis: 120, anzahlung: 40, positionen: [{ artikel: 'Hüpfburg Schloss', anzahl: 1 }, { artikel: 'PartyBox JBL 520', anzahl: 1 }], notiz: 'Beispieldaten' },
      { id: 'demo2', name: 'Beispiel Verein B', telefon: '0151 0000002', plattform: 'telefon', start: d(3), ende: d(3), status: 'angefragt', preis: 80, anzahlung: 0, positionen: [{ artikel: 'Bierzeltgarnitur', anzahl: 6 }, { artikel: 'Popcornmaschine Star', anzahl: 1 }] },
      { id: 'demo3', name: 'Beispiel Firma C', telefon: '0151 0000003', plattform: 'kleinanzeigen', start: d(-2), ende: d(-1), status: 'zurueck', preis: 95, anzahlung: 95, positionen: [{ artikel: 'Hüpfburg Slide', anzahl: 1 }] }
    ];
    return { buchungen: bookings, artikel: arts, sperrliste: [] };
  }

  // ===== Kalender-Hilfen =====
  function dayMap() {
    const m = {};
    state.bookings.forEach((b) => {
      if (!isActive(b)) return;
      let d = parse(b.start);
      const end = parse(b.ende);
      for (let n = 0; d <= end && n < 62; n++) {
        const k = iso(d);
        (m[k] = m[k] || []).push(b);
        d = addDays(d, 1);
      }
    });
    return m;
  }
  function fmtRange(b) {
    if (b.start === b.ende) return wd(b.start) + ' ' + fmtD(b.start) + (b.zeit ? ' · ' + b.zeit : '');
    return wd(b.start) + ' ' + fmtD(b.start) + ' – ' + wd(b.ende) + ' ' + fmtD(b.ende);
  }

  // ===== Bausteine =====
  function money(label, val) { return h('div', {}, h('small', {}, label), h('b', {}, val)); }
  function row(label, val) { return val ? h('div', {}, h('span', {}, label + ': '), val) : null; }

  function detail(b) {
    const stop = (e) => e.stopPropagation();
    const sp = sperrMatch(b);
    return h('div', { class: 'det' },
      sp ? h('div', {}, '🚫 Gesperrter Kunde' + (sp.grund ? ': ' + sp.grund : '')) : null,
      b.telefon ? h('div', {}, h('span', {}, 'Telefon: '), h('a', { href: 'tel:' + b.telefon.replace(/\s+/g, ''), onclick: stop }, b.telefon)) : null,
      b.adresse ? h('div', {}, h('span', {}, 'Adresse: '),
        h('a', { href: 'https://maps.apple.com/?q=' + encodeURIComponent(b.adresse), onclick: stop }, b.adresse)) : null,
      row('Abholung', b.abholzeit), row('Rückgabe', b.rueckzeit),
      row('Quelle', b.plattform),
      b.kaution > 0 ? row('Kaution', eur(b.kaution) + ' (' + (KAUT[b.kautionStatus] || b.kautionStatus) + ')') : null,
      row('Notiz', b.notiz),
      b.status !== 'storniert' ? h('div', {}, h('span', {}, 'Kalender: '), b.gcalEventId || b.kalender === 'ja' ? '✓ eingetragen' : (b.kalender === 'abweichend' ? '⚠ Kalender abweichend' : (state.calWrite ? 'wird beim Abgleichen eingetragen' : 'nicht eingetragen'))) : null,
      actions(b)
    );
  }

  function card(b) {
    const open = !!state.open[b.id];
    const rest = Math.max(0, b.preis - b.anzahlung);
    return h('div', {
      class: 'card' + (b.status === 'storniert' ? ' cancel' : ''), style: '--pc:' + bookCatColor(b),
      onclick: () => { state.open[b.id] = !open; render(); }
    },
      h('div', { class: 'stripe' }),
      h('div', { class: 'body' },
        h('div', { class: 'top' }, h('span', { class: 'when' }, fmtRange(b)),
          h('span', { class: 'chip st-' + b.status }, STATUS[b.status] || b.status)),
        h('div', { class: 'name' }, b.name || '(ohne Name)', sperrMatch(b) ? ' 🚫' : ''),
        h('div', { class: 'art' }, b.artikel),
        b.preis > 0 ? h('div', { class: 'money' }, money('Preis', eur(b.preis)), money('Anzahlung', eur(b.anzahlung)), money('Offen', eur(rest))) : null,
        open ? detail(b) : null));
  }

  const sortByStart = (a, b) => (a.start + (a.zeit || '')).localeCompare(b.start + (b.zeit || ''));

  // ===== Ansichten =====
  function gotoMonth(y, mo) {
    state.cursor = new Date(y, mo, 1);
    const t = today0();
    state.sel = (state.cursor.getFullYear() === t.getFullYear() && state.cursor.getMonth() === t.getMonth()) ? iso(t) : iso(state.cursor);
    render();
  }
  // Ereignis-Art: MietXpress-Kalender, Privat, Geburtstag, Feiertage/Kalenderwochen
  function evKind(ev) {
    const cal = state.cal.cals.find((c) => c.id === ev.cal);
    const nm = cal ? cal.name : '';
    if (ev.typ === 'birthday' || /geburtstag|🎂/i.test(ev.title) || /geburtstag|birthday/i.test(nm)) return 'bday';
    if (/mietxpress/i.test(nm)) return 'mx';
    if (/feiertag|kalenderwoche/i.test(nm)) return 'info';
    return 'priv';
  }
  const KIND_ORDER = { mx: 0, bday: 1, priv: 2, info: 3 };
  const KIND_LABEL = { mx: 'MietXpress-Kalender', bday: 'Geburtstage 🎂', priv: 'Privat', info: 'Feiertage & Wochen' };
  const byKind = (a, b) => (KIND_ORDER[evKind(a)] - KIND_ORDER[evKind(b)]) || (a.zeit || '').localeCompare(b.zeit || '');
  function evChip(ev) {
    const k = evKind(ev), col = calColor(ev.cal);
    const style = k === 'mx' ? 'border:2px dashed ' + col + ';background:' + col + '33' : (k === 'priv' ? 'background:' + col + '66;border-left:4px dotted ' + col : null);
    return h('span', { class: 'pc ev ev-' + k, style }, h('span', { class: 'pn' }, (k === 'bday' ? '🎂 ' : '') + ev.title.replace(/^🎂\s*/, '')));
  }

  function viewMonat(main) {
    const c = state.cursor, y = c.getFullYear(), mo = c.getMonth();
    main.append(h('div', { class: 'mnav' },
      h('button', { 'aria-label': 'Vorheriger Monat', onclick: () => gotoMonth(y, mo - 1) }, '‹'),
      h('b', {}, MONTHS[mo] + ' ' + y),
      h('button', { 'aria-label': 'Nächster Monat', onclick: () => gotoMonth(y, mo + 1) }, '›')));
    // Wischen: nach links = nächster Monat, nach rechts = vorheriger
    let sx = null, sy = null;
    main.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) gotoMonth(y, mo + (dx < 0 ? 1 : -1));
    }, { passive: true });

    const grid = h('div', { class: 'grid' });
    DOW.forEach((d) => grid.append(h('div', { class: 'dow' }, d)));
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const rows = Math.ceil((lead + days) / 7);
    const start = new Date(y, mo, 1 - lead);
    const map = dayMap();
    const ems = evMap();
    const ts = iso(today0());
    for (let i = 0; i < rows * 7; i++) {
      const d = addDays(start, i), ds = iso(d), list = map[ds] || [], evs = (ems[ds] || []).slice().sort(byKind);
      const bShown = Math.min(list.length, 2);
      const eShown = Math.min(evs.length, 3 - bShown);
      const more = list.length + evs.length - bShown - eShown;
      grid.append(h('button', {
        class: 'day' + (d.getMonth() !== mo ? ' out' : '') + (ds === ts ? ' today' : '') + (ds === state.sel ? ' sel' : ''),
        onclick: () => { state.sel = ds; render(); }
      },
        h('div', { class: 'dn' }, d.getDate()),
        list.slice(0, bShown).map((b) => {
          const col = bookCatColor(b);
          return h('span', { class: 'pc' + (b.status === 'zurueck' ? ' done' : ''), style: 'border-left:4px solid ' + col + ';background:' + col + '55' },
            h('span', { class: 'pn' }, b.name || '—'));
        }),
        evs.slice(0, eShown).map(evChip),
        more > 0 ? h('div', { class: 'more' }, '+' + more) : null));
    }
    main.append(grid);

    const sel = (map[state.sel] || []).slice().sort(sortByStart);
    main.append(h('h3', {}, fmtFull(state.sel)));
    main.append(h('div', { class: 'grp grp-mx' }, 'MietXpress · Buchungen'));
    if (sel.length) sel.forEach((b) => main.append(card(b)));
    else main.append(h('div', { class: 'empty' }, 'Keine Buchungen an diesem Tag.'));

    const dayEv = (ems[state.sel] || []).slice().sort(byKind);
    let lastK = null;
    dayEv.forEach((ev) => {
      const k = evKind(ev);
      if (k !== lastK) { main.append(h('div', { class: 'grp grp-' + k }, KIND_LABEL[k])); lastK = k; }
      main.append(h('div', { class: 'evrow ev-' + k, style: '--pc:' + calColor(ev.cal) },
        h('b', {}, (k === 'bday' ? '🎂 ' : '') + ev.title.replace(/^🎂\s*/, '')),
        h('div', { class: 'art' }, [ev.zeit || 'ganztägig', ev.start !== ev.ende ? fmtD(ev.start) + ' – ' + fmtD(ev.ende) : '', ev.ort].filter(Boolean).join(' · '))));
    });
  }

  function viewListe(main) {
    const chips = h('div', { class: 'chips' }, [['anstehend', 'Anstehend'], ['alle', 'Alle'], ['erledigt', 'Erledigt']].map((f) =>
      h('button', { class: state.filter === f[0] ? 'on' : '', onclick: () => { state.filter = f[0]; render(); } }, f[1])));
    const out = h('div');
    const paint = () => {
      const ts = iso(today0());
      const q = state.q.trim().toLowerCase();
      const list = state.bookings.filter((b) => {
        if (state.filter === 'anstehend' && !(isOpenBooking(b) && (b.ende >= ts || b.status === 'abgeholt'))) return false;
        if (state.filter === 'erledigt' && isOpenBooking(b)) return false;
        if (q && (b.name + ' ' + b.artikel + ' ' + b.telefon + ' ' + b.adresse + ' ' + b.notiz).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      list.sort(state.filter === 'anstehend' ? sortByStart : (a, b) => sortByStart(b, a));
      out.replaceChildren(...(list.length ? list.map(card) : [h('div', { class: 'empty' }, 'Keine Buchungen gefunden.')]));
    };
    const search = h('input', {
      class: 'inp', type: 'search', placeholder: 'Suchen: Name, Artikel, Telefon …', value: state.q, style: 'margin-bottom:10px',
      oninput: (e) => { state.q = e.target.value; paint(); }
    });
    main.append(chips, search, out);
    paint();
  }

  function viewBestand(main) {
    const vs = state.von || iso(today0());
    const bs = state.bis && state.bis >= vs ? state.bis : vs;
    main.append(h('div', { class: 'pdates' },
      h('label', {}, h('small', {}, 'Von'), h('input', { class: 'inp', type: 'date', value: vs, onchange: (e) => { state.von = e.target.value; render(); } })),
      h('label', {}, h('small', {}, 'Bis (optional)'), h('input', { class: 'inp', type: 'date', value: state.bis, onchange: (e) => { state.bis = e.target.value; render(); } }))));
    if (!state.arts.length) { main.append(h('div', { class: 'empty' }, 'Noch keine Artikel gespeichert.')); return; }

    let lastCat = null;
    state.arts.forEach((a) => {
      if (a.kategorie !== lastCat) { main.append(h('div', { class: 'pcat' }, a.kategorie)); lastCat = a.kategorie; }
      const st = Avail.status(state.bookings, state.arts, a, vs, bs);
      let cls = 'ok', txt = 'frei';
      if (st.state === 'vergeben') { cls = 'no'; txt = 'vergeben'; }
      else if (st.state === 'teils') { cls = 'mid'; txt = st.menge != null ? st.frei + ' von ' + st.menge + ' frei' : st.vergeben + ' vergeben'; }
      else if (st.menge != null && st.menge > 1) txt = st.menge + ' frei';
      const who = {};
      st.hits.forEach((x) => { who[x.b.id] = x.b; });
      const names = Object.keys(who).map((k) => who[k].name || '(ohne Name)');
      main.append(h('div', { class: 'pcard' },
        h('div', { class: 'ptop' }, h('div', { class: 'pname' }, a.name), h('span', { class: 'pav ' + cls }, txt)),
        names.length ? h('div', { class: 'pextra' }, 'Gebucht: ' + names.join(', ')) : null));
    });
  }

  // ===== Menü / Daten =====
  function googleBox() {
    const c = state.cal;
    const kids = [h('div', { class: 'ct' }, 'Google-Kalender')];
    if (!c.connected) {
      kids.push(h('p', { class: 'hint' }, 'Verbinde dein Google-Konto, um deine Kalendertermine zu sehen. Sie werden für den Offline-Betrieb gespeichert. Die App darf den Kalender nur lesen.'));
    } else {
      kids.push(h('div', { class: 'row' }, h('span', {}, 'Stand'), h('b', {}, c.at ? new Date(c.at).toLocaleString('de-DE') : 'noch nie')));
      c.cals.forEach((cal) => kids.push(h('label', { class: 'calrow' },
        h('input', { type: 'checkbox', checked: c.sel.indexOf(cal.id) > -1 ? '' : null, onchange: () => toggleCal(cal.id) }),
        h('i', { style: 'background:' + cal.color }), cal.name)));
    }
    if (c.connected) {
      kids.push(h('label', { class: 'calrow' },
        h('input', { type: 'checkbox', checked: state.calWrite ? '' : null, onchange: async (e) => { state.calWrite = e.target.checked; await DB.setMeta('calWrite', state.calWrite); render(); } }),
        h('span', {}, 'Buchungen automatisch in den Kalender "Müllers MietXpress" eintragen (beim Abgleichen)')));
      if (state.calWrite) kids.push(h('p', { class: 'hint' }, 'Neue und geänderte Buchungen werden beim nächsten "Mit Drive abgleichen" eingetragen. Stornierte und gelöschte Buchungen nehmen ihren Termin mit. Beim ersten Mal fragt Google nach der Erlaubnis, Termine zu schreiben.'));
    }
    if (c.err) kids.push(h('p', { class: 'err' }, c.err));
    kids.push(h('div', { class: 'stack' },
      h('button', { class: 'btn', disabled: c.busy ? '' : null, onclick: connectGoogle },
        c.busy ? 'Bitte warten …' : (c.connected ? 'Kalender aktualisieren' : 'Mit Google verbinden')),
      c.connected ? h('button', { class: 'btn sec', onclick: disconnectGoogle }, 'Verbindung trennen') : null));
    return h('div', { class: 'box' }, kids);
  }

  function driveBox() {
    const d = state.drive;
    const kids = [h('div', { class: 'ct' }, 'Google Drive (Hauptdaten)')];
    kids.push(h('p', { class: 'hint' }, 'Deine Buchungen liegen als Datei in deinem eigenen Google Drive. Beim Abgleichen werden Drive und dieses Gerät zusammengeführt: Neueres gewinnt pro Buchung, nichts wird blind überschrieben.'));
    kids.push(h('div', { class: 'row' }, h('span', {}, 'Zuletzt abgeglichen'), h('b', {}, d.at ? new Date(d.at).toLocaleString('de-DE') : 'noch nie')));
    kids.push(h('div', { class: 'row' }, h('span', {}, 'Nicht abgeglichene Änderungen'), h('b', {}, state.dirty)));
    if (d.msg) kids.push(h('p', { class: 'hint' }, d.msg));
    if (d.err) kids.push(h('p', { class: 'err' }, d.err));
    kids.push(h('div', { class: 'stack' },
      h('button', { class: 'btn', disabled: d.busy ? '' : null, onclick: () => driveSync() }, d.busy ? 'Bitte warten …' : 'Mit Drive abgleichen'),
      h('button', { class: 'btn sec', disabled: d.busy ? '' : null, onclick: () => driveLoad() }, 'Aus Drive laden (ersetzt lokal)')));
    return h('div', { class: 'box' }, kids);
  }

  function viewMenu() {
    const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        if (state.bookings.length && !confirm('Vorhandene lokale Daten werden durch die Datei ersetzt. Fortfahren?')) return;
        await replaceData(data, { stamp: true });
        state.menu = false;
        render();
        alert(state.bookings.length + ' Buchungen und ' + state.arts.length + ' Artikel geladen.');
        if (GCAL.isSignedIn()) driveSync();
      } catch (err) {
        alert('Import fehlgeschlagen: ' + err.message);
      }
    });
    const imp = state.importAt ? new Date(state.importAt).toLocaleString('de-DE') : 'noch nie';
    return h('div', { class: 'ov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Daten'), h('button', { class: 'btn', onclick: () => { state.menu = false; render(); } }, 'Fertig')),
      h('div', { class: 'box' },
        h('div', { class: 'row' }, h('span', {}, 'Buchungen'), h('b', {}, state.bookings.length)),
        h('div', { class: 'row' }, h('span', {}, 'Artikel'), h('b', {}, state.arts.length)),
        h('div', { class: 'row' }, h('span', {}, 'Sperrliste'), h('b', {}, state.sperre.length)),
        h('div', { class: 'row' }, h('span', {}, 'Letzter Import'), h('b', {}, imp))),
      googleBox(),
      driveBox(),
      h('div', { class: 'stack' },
        h('button', { class: 'btn', onclick: openPaste }, 'Buchungen einfügen (von Claude)'),
        h('button', { class: 'btn sec', onclick: () => openSperr() }, 'Sperrliste (' + state.sperre.length + ') bearbeiten'),
        h('button', { class: 'btn sec', onclick: () => { state.menu = false; state.bestandOpen = true; render(); window.scrollTo(0, 0); } }, 'Bestand bearbeiten'),
        h('button', { class: 'btn sec', onclick: pickLogo }, 'Logo ändern (dieses Gerät)'),
        state.logo ? h('button', { class: 'btn sec', onclick: resetLogo }, 'Logo zurücksetzen') : null,
        h('button', { class: 'btn sec', onclick: () => file.click() }, 'Alle Daten aus Datei laden (ersetzt alles)'),
        h('button', { class: 'btn sec', onclick: () => download('mietxpress-daten-' + iso(new Date()) + '.json',
          JSON.stringify({ version: 2, exportiert: new Date().toISOString(), buchungen: state.bookings, artikel: state.arts, sperrliste: state.sperre, geloescht: state.tomb }, null, 1)) }, 'Backup speichern'),
        h('button', { class: 'btn sec', onclick: async () => {
          if (state.bookings.length && !confirm('Lokale Daten durch Beispieldaten ersetzen?')) return;
          await replaceData(demoData()); state.menu = false; render();
        } }, 'Beispieldaten laden (zum Ausprobieren)'),
        h('button', { class: 'btn warn', onclick: async () => {
          if (!confirm('Wirklich alle Daten auf diesem Gerät löschen?')) return;
          await DB.clearAll(); await load(); state.menu = false; render();
        } }, 'Alle lokalen Daten löschen'),
        file),
      h('p', { class: 'stand' }, 'Alle Daten liegen auch lokal auf diesem Gerät und funktionieren ohne Internet. · App-Version 12')));
  }

  // ===== Bearbeiten (anlegen, ändern, löschen – alles lokal, Abgleich später) =====
  const PLAT_LIST = ['Kleinanzeigen', 'WhatsApp', 'SMS', 'Mail', 'Telefon', 'Sonstige'];
  const toNum = (v) => Number(String(v == null ? '' : v).replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0;
  const nowIso = () => new Date().toISOString();
  const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function markDirty() { state.dirty++; await DB.setMeta('dirty', state.dirty); }

  async function saveBooking(b) {
    const n = norm(Object.assign({}, b, { geaendert: nowIso() }));
    await DB.put('buchungen', n);
    if (n.gcalEventId && state.calDel.indexOf(n.gcalEventId) > -1) await setCalDel(state.calDel.filter((x) => x !== n.gcalEventId));
    if (state.tomb[n.id]) { delete state.tomb[n.id]; await DB.setMeta('tomb', state.tomb); }
    await markDirty();
    await load();
    return n;
  }
  async function patchBooking(b, p) {
    const extra = {};
    if (p.status === 'storniert' && b.status !== 'storniert') extra.statusVorher = b.status;
    await saveBooking(Object.assign({}, b, p, extra));
    render();
  }
  async function removeBooking(b) {
    await DB.remove('buchungen', b.id);
    if (b.gcalEventId && state.calDel.indexOf(b.gcalEventId) < 0) await setCalDel(state.calDel.concat([b.gcalEventId]));
    state.tomb[b.id] = nowIso();
    await DB.setMeta('tomb', state.tomb);
    await markDirty();
    await load();
    render();
    toast('Gelöscht: ' + (b.name || b.artikel || 'Buchung'), async () => { await saveBooking(b); render(); });
  }
  function toast(msg, undoFn) {
    const t = h('div', { class: 'toast' }, h('span', {}, msg));
    if (undoFn) t.append(h('button', { onclick: () => { t.remove(); undoFn(); } }, 'Rückgängig'));
    document.body.append(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, undoFn ? 10000 : 2600);
  }

  function actions(b) {
    const stop = (e) => e.stopPropagation();
    const rest = Math.max(0, b.preis - b.anzahlung);
    const delClick = (ev) => {
      const btn = ev.currentTarget;
      if (state.delArm !== b.id) {
        state.delArm = b.id;
        btn.textContent = 'Wirklich löschen? Nochmal tippen';
        btn.classList.add('armed');
        setTimeout(() => { if (state.delArm === b.id) { state.delArm = null; if (btn.isConnected) { btn.textContent = 'Buchung löschen'; btn.classList.remove('armed'); } } }, 4000);
        return;
      }
      state.delArm = null;
      removeBooking(b);
    };
    return h('div', { class: 'acts', onclick: stop },
      h('div', { class: 'arow' }, Object.keys(STATUS).map((k) =>
        h('button', { class: b.status === k ? 'on' : '', onclick: () => patchBooking(b, { status: k }) }, STATUS[k]))),
      rest > 0 ? h('div', { class: 'arow' }, h('button', { onclick: () => patchBooking(b, { anzahlung: b.preis }) }, 'Restbetrag ' + eur(rest) + ' erhalten')) : null,
      b.kaution > 0 ? h('div', { class: 'arow' }, ['offen', 'erhalten', 'zurueck'].map((k) =>
        h('button', { class: b.kautionStatus === k ? 'on' : '', onclick: () => patchBooking(b, { kautionStatus: k }) }, 'Kaution ' + KAUT[k].toLowerCase()))) : null,
      h('div', { class: 'arow' },
        h('button', { onclick: () => openPickup(b) }, '📦 Abholung'),
        h('button', { onclick: () => openMsgs(b) }, '💬 Nachricht'),
        rechBtn(b),
        h('button', { onclick: () => openEdit(b) }, 'Bearbeiten'),
        h('button', { class: 'del', onclick: delClick }, 'Buchung löschen')));
  }

  function openEdit(b) {
    const base = iso(today0());
    const d = b ? JSON.parse(JSON.stringify(b)) : {
      id: null, name: '', telefon: '', adresse: '', plattform: 'Sonstige',
      start: state.sel || base, ende: state.sel || base, abholzeit: '', rueckzeit: '',
      positionen: [], preis: 0, anzahlung: 0, kaution: 0, kautionStatus: 'keine',
      status: 'bestaetigt', notiz: '', erstellt: base
    };
    if (!d.positionen || !d.positionen.length) {
      d.positionen = d.id ? Avail.positionsOf(d, state.arts).map((p) => ({ artikel: p.artikel, anzahl: p.anzahl })) : [];
    }
    if (d.abholzeit == null) d.abholzeit = '';
    state.edit = { d, orig: b ? b.status : null, err: null, warnEl: null };
    render();
  }
  function closeEdit() { state.edit = null; render(); }

  // Hinweise (blockieren nicht): Bestand reicht nicht, Paket gesperrt, gesperrter Kunde
  function editWarnings(d) {
    const w = [];
    if (d.status === 'storniert' || !d.start || !d.ende || d.ende < d.start) return w;
    const others = state.bookings.filter((b) => b.id !== d.id);
    const names = (hits) => hits.map((x) => x.b.name || '?').filter((v, i, a) => a.indexOf(v) === i).join(', ');
    d.positionen.forEach((p) => {
      const a = Avail.artByName(state.arts, p.artikel);
      if (!a) return;
      const need = Number(p.anzahl) || 1;
      const st = Avail.status(others, state.arts, a, d.start, d.ende);
      if (st.blocked) w.push(p.artikel + ': gesperrt, weil ein Bestandteil gebucht ist (' + names(st.hits) + ')');
      else if (a.menge != null && st.vergeben + need > a.menge) {
        w.push(p.artikel + ': nur ' + Math.max(0, a.menge - st.vergeben) + ' frei, ' + need + ' gewünscht' + (st.hits.length ? ' (belegt von ' + names(st.hits) + ')' : ''));
      }
      (a.enthaelt || []).forEach((c) => {
        const ca = Avail.artByName(state.arts, c.artikel);
        if (!ca || ca.menge == null) return;
        const cs = Avail.status(others, state.arts, ca, d.start, d.ende);
        const cn = (Number(c.anzahl) || 1) * need;
        if (cs.vergeben + cn > ca.menge) w.push(p.artikel + ' enthält ' + c.artikel + ': nur ' + Math.max(0, ca.menge - cs.vergeben) + ' frei, ' + cn + ' nötig');
      });
    });
    const sp = sperrMatch(d);
    if (sp) w.push('🚫 Gesperrter Kunde' + (sp.grund ? ': ' + sp.grund : ''));
    return w;
  }
  function paintWarn() {
    const e = state.edit;
    if (!e || !e.warnEl) return;
    const w = editWarnings(e.d);
    e.warnEl.replaceChildren(...w.map((t) => h('div', {}, '⚠ ' + t)));
    e.warnEl.style.display = w.length ? '' : 'none';
  }
  function paintEdit() {
    const old = document.getElementById('editov');
    const y = old ? old.scrollTop : 0;
    const nu = viewEdit();
    if (old) old.replaceWith(nu);
    nu.scrollTop = y;
  }

  async function saveEdit() {
    const e = state.edit, d = e.d;
    d.positionen = d.positionen.filter((p) => p.artikel);
    e.err = null;
    if (!d.start) e.err = 'Bitte ein Startdatum wählen.';
    else if (!d.ende || d.ende < d.start) e.err = 'Die Rückgabe liegt vor der Abholung.';
    else if (!String(d.name).trim() && !String(d.telefon).trim()) e.err = 'Bitte Name oder Telefon eintragen.';
    else if (!d.positionen.length && !String(d.artikel || '').trim()) e.err = 'Bitte mindestens einen Artikel wählen.';
    if (e.err) { paintEdit(); return; }
    const w = editWarnings(d);
    if (w.length && !confirm('Achtung:\n' + w.join('\n') + '\n\nTrotzdem speichern?')) return;
    const b = Object.assign({}, d, {
      id: d.id || newId(), name: String(d.name).trim(), telefon: String(d.telefon).trim(), adresse: String(d.adresse || '').trim(),
      preis: toNum(d.preis), anzahlung: toNum(d.anzahlung), kaution: toNum(d.kaution),
      artikel: d.positionen.length ? '' : String(d.artikel || '').trim(),
      positionen: d.positionen.length ? d.positionen.map((p) => ({ artikel: p.artikel, anzahl: Number(p.anzahl) || 1 })) : null,
      erstellt: d.erstellt || iso(today0())
    });
    if (b.kaution > 0 && (!b.kautionStatus || b.kautionStatus === 'keine')) b.kautionStatus = 'offen';
    if (!(b.kaution > 0)) b.kautionStatus = 'keine';
    if (b.status === 'storniert' && e.orig && e.orig !== 'storniert') b.statusVorher = e.orig;
    const saved = await saveBooking(b);
    state.edit = null;
    state.sel = saved.start;
    state.cursor = new Date(parse(saved.start).getFullYear(), parse(saved.start).getMonth(), 1);
    state.open[saved.id] = true;
    render();
    toast('Gespeichert');
  }

  function viewEdit() {
    const e = state.edit, d = e.d;
    const fld = (label, el, cls) => h('label', { class: 'fld' + (cls ? ' ' + cls : '') }, h('small', {}, label), el);
    const txt = (key, extra) => h('input', Object.assign({
      class: 'inp', type: 'text', value: d[key] == null ? '' : String(d[key]),
      oninput: (ev) => { d[key] = ev.target.value; if (key === 'name' || key === 'telefon') paintWarn(); }
    }, extra || {}));
    const date = (key) => h('input', { class: 'inp', type: 'date', value: d[key] || '', onchange: (ev) => { d[key] = ev.target.value; if (key === 'start' && (!d.ende || d.ende < d.start)) { d.ende = d.start; paintEdit(); return; } paintWarn(); } });
    const time = (key) => h('input', { class: 'inp', type: 'time', value: d[key] || '', onchange: (ev) => { d[key] = ev.target.value; } });
    const sel = (key, opts, onch) => h('select', { class: 'inp', onchange: (ev) => { d[key] = ev.target.value; if (onch) onch(); } },
      opts.map((o) => h('option', { value: o[0], selected: String(d[key]) === o[0] ? '' : null }, o[1])));
    const plats = PLAT_LIST.slice();
    if (d.plattform && plats.indexOf(d.plattform) < 0) plats.push(d.plattform);

    const warnEl = h('div', { class: 'warnbox', style: 'display:none' });
    e.warnEl = warnEl;

    const prow = d.positionen.map((p, i) => {
      const names = state.arts.map((a) => a.name);
      if (p.artikel && names.indexOf(p.artikel) < 0) names.push(p.artikel);
      return h('div', { class: 'prow' },
        h('select', { class: 'inp', onchange: (ev) => { p.artikel = ev.target.value; paintWarn(); } },
          [h('option', { value: '' }, 'Artikel wählen …')].concat(names.map((n) => h('option', { value: n, selected: n === p.artikel ? '' : null }, n)))),
        h('input', { class: 'inp num', type: 'number', min: '1', inputmode: 'numeric', value: String(p.anzahl || 1),
          oninput: (ev) => { p.anzahl = Math.max(1, parseInt(ev.target.value, 10) || 1); paintWarn(); } }),
        h('button', { class: 'x', 'aria-label': 'Artikel entfernen', onclick: () => { d.positionen.splice(i, 1); paintEdit(); } }, '✕'));
    });

    const root = h('div', { class: 'ov', id: 'editov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' },
        h('h2', {}, d.id ? 'Buchung ändern' : 'Neue Buchung'),
        h('div', { class: 'two' },
          h('button', { class: 'btn sec', onclick: closeEdit }, 'Abbrechen'),
          h('button', { class: 'btn', onclick: saveEdit }, 'Speichern'))),
      e.err ? h('div', { class: 'warnbox err2' }, e.err) : null,
      h('div', { class: 'box' },
        fld('Name', txt('name', { autocomplete: 'off' })),
        fld('Telefon', txt('telefon', { type: 'tel', inputmode: 'tel' })),
        fld('Adresse', txt('adresse')),
        fld('Quelle', sel('plattform', plats.map((x) => [x, x])))),
      h('div', { class: 'box' },
        h('div', { class: 'pdates' }, fld('Abholung (Datum)', date('start')), fld('Rückgabe (Datum)', date('ende'))),
        h('div', { class: 'pdates' }, fld('Abholzeit', time('abholzeit')), fld('Rückgabezeit', time('rueckzeit')))),
      h('div', { class: 'box' },
        h('div', { class: 'ct' }, 'Artikel'),
        prow,
        h('button', { class: 'btn sec', onclick: () => { d.positionen.push({ artikel: '', anzahl: 1 }); paintEdit(); } }, '+ Artikel hinzufügen'),
        warnEl),
      h('div', { class: 'box' },
        h('div', { class: 'pdates' }, fld('Preis (€)', txt('preis', { inputmode: 'decimal' })), fld('Anzahlung (€)', txt('anzahlung', { inputmode: 'decimal' }))),
        h('div', { class: 'pdates' }, fld('Kaution (€)', txt('kaution', { inputmode: 'decimal' })),
          fld('Kaution-Status', sel('kautionStatus', [['keine', 'Keine'], ['offen', 'Offen'], ['erhalten', 'Erhalten'], ['zurueck', 'Zurückgegeben']]))),
        fld('Status', sel('status', Object.keys(STATUS).map((k) => [k, STATUS[k]]), paintWarn))),
      h('div', { class: 'box' }, fld('Notiz', h('textarea', { class: 'inp', rows: '3', oninput: (ev) => { d.notiz = ev.target.value; } }, d.notiz || ''))),
      h('div', { class: 'stack' },
        h('button', { class: 'btn', onclick: saveEdit }, 'Speichern'),
        h('button', { class: 'btn sec', onclick: closeEdit }, 'Abbrechen'))));
    setTimeout(paintWarn, 0);
    return root;
  }

  // ===== Abholung, Mietvertrag, Rechnung, Statistik, Sperrliste, Bestand =====
  const ACCS = {
    'Hüpfburg Schloss': 'Lüfter und Unterlegplane', 'Hüpfburg Slide': 'Lüfter und Unterlegplane', 'Hüpfburg Space': 'Lüfter und Unterlegplane', 'Hüpfburg Kleines Schloss': 'Lüfter und Unterlegplane',
    'Popcornmaschine Star': 'Schaufel', 'PartyBox JBL 520': 'Hülle und Akku', 'Nebelmaschine Fog Beamz': 'Fernbedienung', 'LED Lichtanlage': 'Ständer',
    'Zuckerwattenmaschine Sweet': 'Zuckerlöffel', 'Schneemaschine/Schaumkanone Snow': 'Fernbedienung (Funk und Kabel)', 'Crepes Maschine Paris': 'Wender und Verteiler',
    'Party-Kühlschrank/Akku-Kühlbox': 'Akku', 'DJ & Party Paket': '2x Mikro, 2x JBL 520, 2x Ständer, Nebelmaschine, Partylicht'
  };
  const fmtDE = (s) => { const d = parse(s); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); };
  const fmtShort = (s) => parse(s).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const nDays = (b) => diffDays(parse(b.ende), parse(b.start)) + 1;
  const sortAsc = (a, b) => (a.start + (a.abholzeit || '')).localeCompare(b.start + (b.abholzeit || ''));

  function openPickup(b) { state.pickup = b.id; state.info = null; render(); window.scrollTo(0, 0); }
  function closePickup() { state.pickup = null; render(); }
  function rechBtn(b) {
    if (b.status === 'storniert') return null;
    if (b.rechnung === 'erstellt') return h('span', { class: 'rech done' }, '🧾 Rechnung ' + (b.rechnungNr || '') + ' erstellt');
    if (b.rechnung === 'angefordert') return h('button', { class: 'rech req', onclick: (ev) => { ev.stopPropagation(); patchBooking(b, { rechnung: '' }); toast('Rechnungsauftrag zurückgenommen'); } }, '🧾 Rechnung angefordert ✕');
    return h('button', { class: 'rech', onclick: (ev) => { ev.stopPropagation(); patchBooking(b, { rechnung: 'angefordert', rechnungAm: iso(new Date()) }); toast('Vorgemerkt – im Chat „Rechnungen schreiben" sagen'); } }, '🧾 Rechnung schreiben');
  }
  function viewPickup() {
    const b = state.bookings.find((x) => x.id === state.pickup);
    if (!b) return h('div');
    const n = nDays(b), s = parse(b.start);
    const offen = Math.max(0, b.preis - b.anzahlung);
    const kOff = (b.kaution > 0 && b.kautionStatus === 'offen') ? b.kaution : 0;
    const total = offen + kOff, ps = Avail.positionsOf(b, state.arts);
    const row = (l, v, cls) => h('div', { class: 'r' + (cls ? ' ' + cls : '') }, h('span', {}, l), h('b', {}, v));
    const sm = sperrMatch(b);
    const slip = h('div', { class: 'slip' },
      row('Mietgegenstand', b.artikel || '–'),
      row('Mietdatum', fmtDE(b.start) + (n > 1 ? ' – ' + fmtDE(b.ende) : '')),
      row('Uhrzeit', b.abholzeit ? b.abholzeit + ' Uhr' : 'Zeit offen'),
      row('Wochentag', s.toLocaleDateString('de-DE', { weekday: 'long' })),
      row('Name', b.name || '–'),
      row('Kaution', b.kaution > 0 ? eur(b.kaution) + (b.kautionStatus === 'erhalten' ? ' ✓ erhalten' : (b.kautionStatus === 'zurueck' ? ' (zurück)' : '')) : 'keine'),
      row('Schon bezahlt', eur(b.anzahlung)),
      row('Noch zu zahlen', offen > 0 ? eur(offen) : '0 € ✓', 'big'));
    const due = total > 0
      ? h('div', { class: 'pay' }, h('span', {}, h('small', {}, 'Jetzt kassieren (bar)'), h('br'), h('small', {}, [offen > 0 ? 'Rest ' + eur(offen) : null, kOff > 0 ? 'Kaution ' + eur(kOff) : null].filter(Boolean).join(' + '))), h('b', {}, eur(total)))
      : h('div', { class: 'pay ok' }, h('span', {}, 'Alles bezahlt ✓'));
    const info = h('div', { class: 'slip' },
      row('Rückgabe', fmtShort(b.ende) + ' · ' + (b.rueckzeit ? b.rueckzeit + ' Uhr' : 'Zeit offen') + ' (' + n + (n === 1 ? ' Tag' : ' Tage') + ')'),
      b.telefon ? row('Telefon', b.telefon) : null,
      b.adresse ? row('Adresse', b.adresse) : null,
      b.notiz ? row('Notiz', b.notiz) : null);
    const chk = (key, label) => {
      const k = b.id + '|' + key;
      return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: state.chk[k] ? '' : null, onchange: (ev) => { state.chk[k] = ev.target.checked; } }), h('span', {}, label));
    };
    const list = h('div', { class: 'slip pad' }, h('div', { class: 'ct' }, 'Vor der Übergabe'),
      chk('id', 'Lichtbildausweis geprüft'), chk('vertrag', 'Mietvertrag unterschrieben'),
      ps.filter((p) => ACCS[p.artikel]).map((p) => chk('acc-' + p.artikel, p.artikel + ': inkl. ' + ACCS[p.artikel])),
      chk('zustand', 'Zustand gemeinsam geprüft'));
    const setSt = (st) => async () => { await patchBooking(b, { status: st, statusVorher: b.status }); };
    const acts = h('div', { class: 'ovacts' },
      h('button', { class: 'cb mv full', onclick: (ev) => makeContract(b, ev.currentTarget) }, 'Mietvertrag erstellen (PDF)'),
      b.status !== 'abgeholt' && b.status !== 'zurueck' && b.status !== 'storniert' ? h('button', { class: 'cb abh', onclick: setSt('abgeholt') }, 'Als abgeholt markieren') : null,
      b.status === 'abgeholt' ? h('button', { class: 'cb undo', onclick: () => patchBooking(b, { status: (b.statusVorher && b.statusVorher !== 'abgeholt' && b.statusVorher !== 'zurueck') ? b.statusVorher : 'bestaetigt' }) }, 'Rückgängig: nicht abgeholt') : null,
      b.status !== 'zurueck' && b.status !== 'storniert' ? h('button', { class: 'cb ret', onclick: setSt('zurueck') }, 'Als zurückgebracht markieren') : null,
      b.status === 'zurueck' ? h('button', { class: 'cb undo', onclick: () => patchBooking(b, { status: 'abgeholt', statusVorher: 'bestaetigt' }) }, 'Rückgängig: nicht zurück') : null,
      b.status === 'abgeholt' ? h('span', { class: 'chip st-abgeholt', style: 'align-self:center' }, 'Abgeholt ✓') : null,
      b.status === 'zurueck' ? h('span', { class: 'chip st-zurueck', style: 'align-self:center' }, 'Zurück ✓') : null,
      rechBtn(b),
      h('button', { class: 'cb msg', onclick: () => openMsgs(b) }, '💬 Nachricht'),
      sm ? null : h('button', { class: 'cb sperr', onclick: () => { state.pickup = null; openSperr({ name: b.name || '', telefon: b.telefon || '' }); } }, '🚫 Kunde sperren'));
    return h('div', { class: 'ov', id: 'pickupov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Abholung'), h('button', { class: 'btn sec', onclick: closePickup }, 'Schließen')),
      sm ? h('div', { class: 'warnbox err2' }, '🚫 Gesperrter Kunde' + (sm.grund ? ' – ' + sm.grund : '')) : null,
      slip, due, acts, h('div', { style: 'height:10px' }), list, info));
  }

  // --- Mietvertrag (PDF-Vorlage im Browser ausfüllen, funktioniert offline) ---
  const BOXROWS = [437.5, 468.9, 500.4, 531.8, 563.3, 594.7, 626.2, 657.6, 698.3, 729.7];
  const BOXCOLX = { L: 52.6, R: 293.6 };
  const BOXMAP = {
    'Hüpfburg Schloss': ['L', 0], 'Hüpfburg Slide': ['L', 1], 'Hüpfburg Space': ['L', 2], 'Hüpfburg Kleines Schloss': ['L', 3],
    'Popcornmaschine Star': ['L', 4], 'Slush Eis Maschine Ninja': ['L', 5], 'PartyBox JBL 520': ['L', 6],
    'Nebelmaschine Fog Beamz': ['L', 7], 'LED Lichtanlage': ['L', 8],
    'Zuckerwattenmaschine Sweet': ['R', 0], 'Schneemaschine/Schaumkanone Snow': ['R', 1], 'Speisewärmer Eat': ['R', 2],
    'Crepes Maschine Paris': ['R', 3], 'Stehtisch': ['R', 4], 'Bierzeltgarnitur': ['R', 5],
    'Party-Kühlschrank/Akku-Kühlbox': ['R', 6], 'DJ & Party Paket': ['R', 7], 'Glühweinkocher/Wasserkocher': ['R', 8],
    'kukki Cocktail-Toaster': ['L', 9], 'Aperol Spritz Maschine': ['R', 9]
  };
  const safeTxt = (s) => String(s == null ? '' : s).replace(/[^\x20-\x7E -ÿ–—€]/g, '?');
  function splitName(n) {
    n = String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (n.indexOf(',') > -1) return n;
    const p = n.split(/\s+/); if (p.length < 2) return n;
    const last = p.pop(); return last + ', ' + p.join(' ');
  }
  function splitAddr(a) {
    a = String(a || '').trim(); const i = a.lastIndexOf(',');
    if (i < 0) return { strasse: a, plz: '' };
    return { strasse: a.slice(0, i).trim(), plz: a.slice(i + 1).trim() };
  }
  const deMoney = (v) => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function contractFilename(b) {
    const last = splitName(b.name).split(',')[0].replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, '') || 'Kunde';
    const d = parse(b.start);
    return 'Mietvertrag_' + last + '_' + pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + '.pdf';
  }
  function loadPdfLib() {
    return new Promise((resolve, reject) => {
      if (window.PDFLib) return resolve(window.PDFLib);
      const sc = document.createElement('script');
      sc.src = 'pdf-lib.min.js';
      sc.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('lib')));
      sc.onerror = () => reject(new Error('lib'));
      document.head.append(sc);
    });
  }
  async function buildContract(b, positions) {
    const PL = await loadPdfLib();
    const res = await fetch('mietvertrag-vorlage.pdf');
    if (!res.ok) throw new Error('tpl');
    const doc = await PL.PDFDocument.load(await res.arrayBuffer());
    const font = await doc.embedFont(PL.StandardFonts.Helvetica);
    const pages = doc.getPages(), p1 = pages[0], p2 = pages[1], H = p1.getHeight(), ink = PL.rgb(0.07, 0.07, 0.07);
    const T = (page, x, top, s, size) => { s = safeTxt(s); if (!s) return; page.drawText(s, { x, y: H - top, size: size || 10, font, color: ink }); };
    const ad = splitAddr(b.adresse);
    const uhr = b.abholzeit && b.rueckzeit ? b.abholzeit + ' – ' + b.rueckzeit + ' Uhr' : (b.abholzeit ? b.abholzeit + ' Uhr' : '');
    T(p1, 142, 261.0, splitName(b.name));
    T(p1, 142, 285.2, ad.strasse);
    T(p1, 142, 309.4, ad.plz);
    T(p1, 142, 333.6, b.telefon);
    T(p1, 47, 395.6, fmtDE(b.start));
    T(p1, 166, 395.6, fmtDE(b.ende));
    T(p1, 286, 395.6, uhr, 9);
    T(p1, 401, 395.6, 'Selbstabholung', 9);
    positions.forEach((pos) => {
      const m = BOXMAP[pos.artikel]; if (!m) return;
      const n = Number(pos.anzahl) || 1, cx = BOXCOLX[m[0]] + 6.8, cy = BOXROWS[m[1]] + 5.3, sz = 4.2;
      p1.drawLine({ start: { x: cx - sz, y: H - (cy - sz) }, end: { x: cx + sz, y: H - (cy + sz) }, thickness: 1.6, color: ink });
      p1.drawLine({ start: { x: cx - sz, y: H - (cy + sz) }, end: { x: cx + sz, y: H - (cy - sz) }, thickness: 1.6, color: ink });
      if (pos.artikel === 'Stehtisch') T(p1, 343, 587.0, n, 9);
      if (pos.artikel === 'Speisewärmer Eat') T(p1, 343, 524.0, n, 9);
      if (pos.artikel === 'Bierzeltgarnitur') { T(p1, 369, 618.4, n, 9); T(p1, 442, 618.4, n * 2, 9); }
    });
    T(p2, 47, 116.5, deMoney(b.preis));
    T(p2, 171, 116.5, deMoney(b.kaution));
    T(p2, 286, 116.5, deMoney(0));
    T(p2, 406, 116.5, deMoney(b.anzahlung));
    const od = 'C-R, ' + fmtDE(b.start);
    T(p2, 47, 600.0, od);
    T(p2, 299, 600.0, od);
    return await doc.save();
  }
  async function deliverPdf(bytes, name) {
    const file = new File([bytes], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'geteilt'; }
      catch (e) { if (e && e.name === 'AbortError') return 'abbruch'; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'download';
  }
  async function makeContract(b, btn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Erstelle …';
    try {
      const pos = Avail.positionsOf(b, state.arts);
      if (!pos.length) { toast('Keine Artikel zugeordnet'); return; }
      const bytes = await buildContract(b, pos);
      const r = await deliverPdf(bytes, contractFilename(b));
      if (r !== 'abbruch') toast('Mietvertrag erstellt');
    } catch (e) {
      console.error('Mietvertrag:', e);
      toast(e && e.message === 'lib' ? 'PDF-Baustein nicht geladen (einmal online öffnen)' : 'Mietvertrag konnte nicht erstellt werden');
    } finally { btn.disabled = false; btn.textContent = old; }
  }

  // --- Statistik ---
  function stats() {
    const t = today0(), ts = iso(t), in7 = iso(addDays(t, 7));
    const list = state.bookings;
    const soonL = list.filter((b) => isOpenBooking(b) && b.start >= ts && b.start <= in7).sort(sortAsc);
    const mk = state.cursor.getFullYear() + '-' + pad(state.cursor.getMonth() + 1);
    const monL = list.filter((b) => isActive(b) && b.start.indexOf(mk) === 0).sort(sortAsc);
    const rev = monL.reduce((s2, b) => s2 + b.preis, 0);
    const paid = monL.reduce((s2, b) => s2 + Math.min(b.anzahlung, b.preis), 0);
    const outL = list.filter((b) => b.status === 'abgeholt').sort((a, b) => a.ende.localeCompare(b.ende));
    const rq = list.filter((b) => b.rechnung === 'angefordert' && b.status !== 'storniert').sort(sortAsc);
    return { soonL, rev, paid, monL, outL, rq };
  }
  function openInfo(title, intro, groups) { state.info = { title, intro, groups }; render(); window.scrollTo(0, 0); }
  function closeInfo() { state.info = null; render(); }
  function viewInfo() {
    const I = state.info;
    const bookRow = (b, g) => {
      const offen = Math.max(0, b.preis - b.anzahlung);
      const money = g.mode === 'kaut' ? 'Kaution ' + eur(b.kaution) : 'Preis ' + eur(b.preis) + ' · bezahlt ' + eur(Math.min(b.anzahlung, b.preis)) + ' · offen ' + eur(offen);
      const row = h('div', { class: 'brow' + (g.pickup ? ' clickable' : ''), style: '--pc:' + bookCatColor(b), onclick: g.pickup ? () => { state.info = null; openPickup(b); } : null }, h('i'), h('div', { class: 'bcol' },
        h('div', {}, h('b', {}, b.artikel || 'Ohne Artikel'), ' – ' + (b.name || 'Ohne Name'), sperrMatch(b) ? ' 🚫' : ''),
        h('div', { class: 'bt' }, h('b', {}, fmtShort(b.start)), b.ende !== b.start ? ' – ' + fmtShort(b.ende) : '', b.abholzeit ? ' · ab ' + b.abholzeit : ''),
        h('div', { class: 'bt' }, money),
        g.retBtn ? h('button', { class: 'cb ret', style: 'margin-top:6px', onclick: async (ev) => { ev.stopPropagation(); await patchBooking(b, { status: 'zurueck', statusVorher: b.status }); I.groups.forEach((x) => { x.rows = x.rows.filter((r) => r.id !== b.id); }); render(); toast('Als zurückgebracht markiert'); } }, 'Als zurückgebracht markieren') : null),
        g.pickup ? h('span', { class: 'pickupTag' }, 'Abholung ›') : null);
      return row;
    };
    return h('div', { class: 'ov', id: 'infoov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, I.title), h('button', { class: 'btn sec', onclick: closeInfo }, 'Schließen')),
      h('div', { class: 'pextra', style: 'margin:0 0 10px;font-size:13.5px' }, I.intro),
      I.groups.map((g) => h('div', { class: 'slip pad' }, h('div', { class: 'ct' }, g.title),
        g.rows.length ? g.rows.map((b) => bookRow(b, g)) : h('div', { class: 'pextra' }, 'Keine Einträge.')))));
  }
  function statsBox() {
    const s = stats(), box = h('div', { class: 'stats' });
    const mname = state.cursor.toLocaleDateString('de-DE', { month: 'long' });
    const reveal = Date.now() < state.revealUntil;
    box.append(
      h('div', { class: 'stat tap', onclick: () => openInfo('Abholung', 'Buchungen, die in den nächsten 7 Tagen beginnen (ohne stornierte und zurückgegebene). Antippen öffnet die Abholung.', [{ title: 'In den nächsten 7 Tagen', rows: s.soonL, mode: 'preis', pickup: true }]) },
        h('b', {}, s.soonL.length), h('span', {}, 'Abholung in den nächsten 7 Tagen'), h('em', {}, 'Details ›')),
      h('div', { class: 'stat tap', onclick: () => {
        if (reveal) openInfo('Gebucht im ' + mname, 'Summe der Gesamtpreise aller Buchungen, die im ' + mname + ' beginnen. Bezahlt sind bisher ' + eur(s.paid) + ' (Anzahlungen), offen sind ' + eur(s.rev - s.paid) + '. Der Monat folgt dem Kalender in der Monatsansicht.', [{ title: 'Buchungen im ' + mname, rows: s.monL, mode: 'preis', pickup: true }]);
        else { state.revealUntil = Date.now() + 10000; render(); setTimeout(() => { if (Date.now() >= state.revealUntil) render(); }, 10200); }
      } }, h('b', {}, reveal ? eur(s.rev) : '•••• €'), h('span', {}, 'Gebucht im ' + mname), h('em', {}, reveal ? 'Details ›' : 'Antippen zum Anzeigen')));
    if (s.outL.length) box.append(h('div', { class: 'stat tap wide', onclick: () => openInfo('Noch nicht zurückgebracht', 'Diese Artikel sind abgeholt und noch offen – hier siehst du, was du noch zurückerwartest.', [{ title: 'Noch offen', rows: s.outL, mode: 'preis', retBtn: true, pickup: true }]) },
      h('b', {}, s.outL.length), h('span', {}, 'Noch nicht zurückgebracht'), h('em', {}, 'Details ›')));
    if (s.rq.length) box.append(h('div', { class: 'stat tap wide rq', onclick: () => openInfo('Rechnungen offen', 'Diese Buchungen sind zum Rechnungschreiben vorgemerkt. Sag Claude im Chat „Rechnungen schreiben".', [{ title: 'Vorgemerkt', rows: s.rq, mode: 'preis', pickup: true }]) },
      h('b', {}, s.rq.length + (s.rq.length === 1 ? ' Rechnung' : ' Rechnungen') + ' vorgemerkt'), h('span', {}, 'Im Chat „Rechnungen schreiben" sagen'), h('em', {}, 'Details ›')));
    return box;
  }

  // --- Sperrliste und Bestand bearbeiten ---
  async function saveSperre(list) {
    await DB.replaceAll('sperrliste', list);
    state.sperrAt = nowIso(); await DB.setMeta('sperrAt', state.sperrAt);
    await markDirty(); await load(); render();
  }
  async function saveArts(list) {
    await DB.replaceAll('artikel', list);
    state.artikelAt = nowIso(); await DB.setMeta('artikelAt', state.artikelAt);
    await markDirty(); await load(); render();
  }
  function openSperr(pre) { state.menu = false; state.sperrOpen = true; state.sperrPre = pre || null; state.sperrDelArm = null; render(); window.scrollTo(0, 0); }
  function viewSperr() {
    const pre = state.sperrPre || {}; state.sperrPre = null;
    const nameI = h('input', { class: 'inp', type: 'text', placeholder: 'Name', value: pre.name || '' });
    const telI = h('input', { class: 'inp', type: 'text', placeholder: 'Telefon (optional)', value: pre.telefon || '' });
    const grundI = h('input', { class: 'inp', type: 'text', placeholder: 'Grund (optional)' });
    const add = async () => {
      const name = nameI.value.trim(), telefon = telI.value.trim(), grund = grundI.value.trim();
      if (!name && !telefon) { toast('Name oder Telefon angeben'); return; }
      const slug = (name || telefon).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-+|-+$/g, '') || 'kunde';
      await saveSperre(state.sperre.concat([{ id: slug + '-' + Date.now().toString(36), name, telefon, grund, erstellt: iso(new Date()) }]));
      toast('Zur Sperrliste hinzugefügt');
    };
    const list = h('div', { class: 'slip pad' },
      state.sperre.length ? state.sperre.map((e) => h('div', { class: 'r' },
        h('span', { style: 'flex:1;min-width:0' }, h('b', { style: 'font-size:15px;text-align:left' }, e.name || '(ohne Namen)'), e.telefon ? ' · ' + e.telefon : '', e.grund ? h('div', { class: 'pextra', style: 'margin:2px 0 0' }, e.grund) : null),
        h('button', { class: 'cb sperr', style: 'flex:none', onclick: async () => {
          if (state.sperrDelArm !== e.id) { state.sperrDelArm = e.id; render(); return; }
          state.sperrDelArm = null; await saveSperre(state.sperre.filter((x) => x.id !== e.id)); toast('Entfernt');
        } }, state.sperrDelArm === e.id ? 'Wirklich entfernen?' : 'Entfernen')))
        : h('div', { class: 'empty' }, 'Noch keine gesperrten Kunden.'));
    return h('div', { class: 'ov', id: 'sperrov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Sperrliste'), h('button', { class: 'btn', onclick: () => { state.sperrOpen = false; render(); } }, 'Fertig')),
      h('div', { class: 'pextra', style: 'margin:0 0 10px;font-size:13.5px' }, 'Buchungen von Kunden auf dieser Liste werden mit 🚫 markiert und beim Eintragen gemeldet.'),
      h('div', { class: 'slip pad' }, h('div', { class: 'ct' }, 'Kunde sperren'),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, nameI, telI, grundI, h('button', { class: 'btn', onclick: add }, 'Hinzufügen'))),
      list));
  }
  function viewBestandEdit() {
    const byCat = {};
    state.arts.forEach((a) => { (byCat[a.kategorie] = byCat[a.kategorie] || []).push(a); });
    const cats = Object.keys(byCat).sort((x, y) => byCat[x][0].sort - byCat[y][0].sort);
    const groups = cats.map((c) => h('div', { class: 'slip pad' }, h('div', { class: 'ct' }, c),
      byCat[c].map((a) => h('div', { class: 'r' },
        h('span', { style: 'flex:1;min-width:0;word-break:break-word' }, a.name),
        h('input', { type: 'number', min: '0', value: a.menge == null ? 0 : a.menge, class: 'inp bestandN', onchange: async (ev) => {
          const n = parseInt(ev.target.value, 10); if (isNaN(n) || n < 0) return;
          await saveArts(state.arts.map((x) => (x.id === a.id ? Object.assign({}, x, { menge: n }) : x))); toast('Gespeichert');
        } })))));
    const nameI = h('input', { class: 'inp', type: 'text', placeholder: 'Neuer Artikel (Name)' });
    const catS = document.createElement('select'); catS.className = 'inp';
    cats.concat(['Sonstiges']).filter((v, i, a2) => a2.indexOf(v) === i).forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; catS.append(o); });
    const mI = h('input', { class: 'inp', type: 'number', min: '0', value: '1', placeholder: 'Menge' });
    return h('div', { class: 'ov', id: 'bestandov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Bestand bearbeiten'), h('button', { class: 'btn', onclick: () => { state.bestandOpen = false; render(); } }, 'Fertig')),
      h('div', { class: 'pextra', style: 'margin:0 0 10px;font-size:13.5px' }, 'Anzahl je Artikel ändern, wird direkt gespeichert und beim Abgleichen nach Drive übertragen.'),
      groups.length ? groups : h('div', { class: 'empty' }, 'Keine Artikel hinterlegt.'),
      h('div', { class: 'slip pad' }, h('div', { class: 'ct' }, 'Artikel hinzufügen'),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, nameI, catS, mI, h('button', { class: 'btn', onclick: async () => {
          const name = nameI.value.trim(); if (!name) { toast('Name fehlt'); return; }
          if (state.arts.some((a) => a.name.toLowerCase() === name.toLowerCase())) { toast('Gibt es schon'); return; }
          const mx = state.arts.reduce((m, a) => Math.max(m, a.sort || 0), 0);
          await saveArts(state.arts.concat([{ id: name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-+|-+$/g, '') || 'artikel-' + Date.now(), name, kategorie: catS.value, menge: Math.max(0, parseInt(mI.value, 10) || 0), sort: mx + 1, enthaelt: null }]));
          toast('Artikel hinzugefügt');
        } }, 'Hinzufügen')))));
  }

  // --- Logo ändern (nur auf diesem Gerät) ---
  function pickLogo() {
    const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*';
    f.addEventListener('change', () => {
      const file = f.files && f.files[0]; if (!file) return;
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = async () => {
        const c = document.createElement('canvas'), S = 256, r = Math.min(img.width, img.height);
        c.width = S; c.height = S;
        c.getContext('2d').drawImage(img, (img.width - r) / 2, (img.height - r) / 2, r, r, 0, 0, S, S);
        URL.revokeObjectURL(url);
        state.logo = c.toDataURL('image/jpeg', 0.85); await DB.setMeta('logo', state.logo); render(); toast('Logo geändert');
      };
      img.onerror = () => toast('Bild nicht lesbar');
      img.src = url;
    });
    f.click();
  }
  async function resetLogo() { state.logo = null; await DB.setMeta('logo', null); render(); toast('Logo zurückgesetzt'); }

  // ===== Preisliste 2026 (Stand 10/2026) =====
  const TIERS = [['Mo–Do', '1 Tag Mo–Do'], ['Fr–So / Feiertag', '1 Tag Fr–So / Feiertag'], ['Fr–Sa / Sa–So', 'Wochenendpaket Fr–Sa / Sa–So'], ['Fr–So ganzes WE', 'Wochenendpaket Fr–So']];
  const PRICES = [
    { cat: 'Kombi-Angebote', short: 'Kombi', items: [
      { n: 'Hüpfburg + JBL PartyBox 520', inv: null, p: [60, 80, 130, 160], k: 200,
        note: 'Hüpfburg frei wählbar: Schloss, Kleines Schloss, Slide oder Space. Bei Buchung: gewählte Hüpfburg + PartyBox JBL 520 als zwei Positionen eintragen, damit beides blockiert wird.' }
    ] },
    { cat: 'Hüpfburgen', short: 'Hüpfburgen', items: [
      { n: 'Hüpfburg Schloss', inv: 'Hüpfburg Schloss', p: [40, 50, 80, 100], k: 100 },
      { n: 'Hüpfburg Slide', inv: 'Hüpfburg Slide', p: [40, 50, 80, 100], k: 100 },
      { n: 'Hüpfburg Space', inv: 'Hüpfburg Space', p: [40, 50, 80, 100], k: 100 },
      { n: 'Hüpfburg Kleines Schloss', inv: 'Hüpfburg Kleines Schloss', p: [40, 50, 80, 100], k: 100 }
    ] },
    { cat: 'Partytechnik · Sound · Licht', short: 'Technik', items: [
      { n: 'PartyBox JBL 520', inv: 'PartyBox JBL 520', p: [30, 40, 60, 80], k: 100, x: ['+ Licht Paket 1: 10 €', '+ Mikrofon Paket: 10 €'] },
      { n: 'DJ & Party Paket', inv: 'DJ & Party Paket', p: [90, 110, 175, 220], k: 150, note: 'inkl. 2x Mikro, 2x JBL 520, 2x Ständer, Nebelmaschine, Partylicht' },
      { n: 'LED Lichtanlage', inv: 'LED Lichtanlage', p: [30, 35, 60, 80], k: 50 }
    ] },
    { cat: 'Catering-Maschinen', short: 'Catering', items: [
      { n: 'Popcornmaschine Star', inv: 'Popcornmaschine Star', p: [40, 50, 80, 100], k: 50, x: ['+ Popcorn Paket 1: 25 €', '+ Reinigung: 30 €'] },
      { n: 'Slush Eis Maschine Ninja', inv: 'Slush Eis Maschine Ninja', p: [35, 40, 70, 85], k: 50, x: ['+ Slush Paket 1: 15 €', '+ Reinigung: 15 €'] },
      { n: 'Zuckerwattenmaschine Sweet', inv: 'Zuckerwattenmaschine Sweet', p: [30, 40, 60, 80], k: 50, x: ['+ Zucker Paket (Zucker & Stäbe): 7 €', '+ Reinigung: 15 €'] },
      { n: 'Crêpes Maker Paris', inv: 'Crepes Maschine Paris', p: [20, 30, 50, 70], k: 50, x: ['+ Langzeitangebot 10 Tage: 150 €'] },
      { n: 'Speisewärmer / Wärmebehälter', inv: 'Speisewärmer Eat', p: [8, 10, 13, 18], k: 15, x: ['+ 2x Wärmepaste: 5 €'] },
      { n: 'Party-Kühlschrank / Akku-Kühlbox', inv: 'Party-Kühlschrank/Akku-Kühlbox', p: [30, 40, 60, 80], k: 100, x: ['Langzeit: 4–6 Tage = 22 €/Tag', '7–13 Tage = 18 €/Tag · ab 14 Tage = 15 €/Tag'] },
      { n: 'Glühweinkocher / Wasserkocher', inv: 'Glühweinkocher/Wasserkocher', p: [10, 15, 20, 25], k: 20 },
      { n: 'kukki Cocktail-Toaster', inv: 'kukki Cocktail-Toaster', p: [25, 25, 40, 50], k: 50, note: 'Tiefgefrorene Cocktails in 20–30 Sek. servierfertig. Cocktails selbst nicht im Mietpreis enthalten, Abgabe nur ab 18 Jahren.', x: ['Cocktails auf Anfrage dazu erhältlich'] },
      { n: 'Aperol Spritz Maschine', inv: 'Aperol Spritz Maschine', p: [25, 25, 40, 50], k: 50, note: 'Sprizzer mit 3 Kammern (Prosecco/Aperol/Soda), mischt automatisch 3:2:1, reicht für ca. 18–20 Gläser pro Füllung. Getränke & Eis nicht im Mietpreis enthalten.', x: ['Vorlage Lichtbildausweis erforderlich'] }
    ] },
    { cat: 'Mobiliar & Stehtische', short: 'Mobiliar', items: [
      { n: 'Stehtisch (pro Tisch)', inv: 'Stehtisch', p: [8, 10, 12, 15], k: 20, kp: 'pro Stück', x: ['+ Hussen Paket (inkl. Reinigung): 7 €'] },
      { n: 'Bierzeltgarnitur (1 Tisch & 2 Bänke)', inv: 'Bierzeltgarnitur', p: [8, 10, 12, 15], k: 20, kp: 'pro Stück' }
    ] },
    { cat: 'Spezialmaschinen', short: 'Maschinen', items: [
      { n: 'Schneemaschine Snow', inv: 'Schneemaschine/Schaumkanone Snow', p: [40, 50, 70, 90], k: 50, x: ['+ Schnee Paket 1: 22 €'] },
      { n: 'Nebelmaschine Fog / Fog Beamz', inv: 'Nebelmaschine Fog Beamz', p: [15, 20, 30, 40], k: 50, x: ['+ Nebel Paket 1: 10 €'] }
    ] }
  ];
  const diffDays = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  function matchTier(vs, bs) {
    if (!vs) return -1; bs = bs || vs; if (bs < vs) bs = vs;
    const d0 = parse(vs), n = diffDays(parse(bs), d0) + 1, dow = (d0.getDay() + 6) % 7;
    if (n === 1) return dow <= 3 ? 0 : 1;
    if (n === 2 && (dow === 4 || dow === 5)) return 2;
    if (n === 3 && dow === 4) return 3;
    return -1;
  }
  function availOf(it, vs, bs) {
    if (!vs || !it.inv) return null;
    const a = Avail.artByName(state.arts, it.inv);
    if (!a) return null;
    bs = bs || vs; if (bs < vs) { const t = vs; vs = bs; bs = t; }
    const st = Avail.status(state.bookings, state.arts, a, vs, bs);
    if (st.state === 'vergeben') return { c: 'no', t: 'vergeben' };
    if (st.state === 'teils') return { c: 'mid', t: st.menge != null ? st.frei + ' von ' + st.menge + ' frei' : st.vergeben + ' vergeben' };
    return { c: 'ok', t: 'frei' };
  }
  function priceCard(it, tier, av) {
    return h('div', { class: 'pcard' },
      h('div', { class: 'ptop' }, h('div', { class: 'pname' }, it.n), av ? h('span', { class: 'pav ' + av.c }, av.t) : null),
      it.note ? h('div', { class: 'pextra' }, it.note) : null,
      h('div', { class: 'ptiers' }, it.p.map((v, i) => h('div', { class: 'tier' + (i === tier ? ' hit' : '') }, h('small', {}, TIERS[i][0]), h('b', {}, v + ' €')))),
      (it.x || []).map((x) => h('div', { class: 'pextra' }, x)),
      h('span', { class: 'pk' }, 'Kaution ' + it.k + ' €' + (it.kp ? ' ' + it.kp : '')));
  }
  let priceEls = null;
  function paintPrices() {
    if (!priceEls) return;
    const box = priceEls.pres, info = priceEls.pinfo;
    box.textContent = ''; info.textContent = '';
    const q = String(state.priceQ || '').trim().toLowerCase();
    const vs = state.pvon, bs = state.pbis || state.pvon, tier = matchTier(vs, bs);
    if (vs) {
      const last = bs < vs ? vs : bs, n = diffDays(parse(last), parse(vs)) + 1;
      info.append(h('div', { class: 'pinfo' }, h('b', {}, fmtD(vs) + (last !== vs ? ' – ' + fmtD(last) : '')),
        ' · ' + n + (n === 1 ? ' Tag' : ' Tage') + ' · ', tier >= 0 ? TIERS[tier][1] : 'kein Standardpaket, Preis pro Tag bzw. nach Absprache'));
    }
    PRICES.forEach((g, gi) => {
      const items = g.items.filter((it) => !q || (it.n + ' ' + g.cat + ' ' + (it.x || []).join(' ') + ' ' + (it.note || '')).toLowerCase().indexOf(q) > -1);
      if (!items.length) return;
      box.append(h('div', { class: 'pcat', id: 'pc-' + gi }, g.cat));
      items.forEach((it) => box.append(priceCard(it, tier, availOf(it, vs, bs))));
    });
    if (!box.childNodes.length) box.append(h('div', { class: 'empty' }, 'Nichts gefunden.'));
    box.append(h('div', { class: 'pcat' }, 'Allgemeine Hinweise'),
      h('div', { class: 'phints' },
        h('div', {}, h('b', {}, 'Mietzeit: '), '1 Tag = i. d. R. 9:00 – 21:00 Uhr'),
        h('div', {}, h('b', {}, 'Pakete: '), 'Fr–Sa / Sa–So und Fr–So sind Wochenendpakete (Pauschalpreis)'),
        h('div', {}, h('b', {}, 'Lieferung: '), 'Ruhrgebiet & Umgebung. Stehtische und Bierzeltgarnituren ab 6 Stück: 1 €/km · 4 Fahrten'),
        h('div', {}, h('b', {}, 'Kaution: '), 'wird bei Rückgabe vollständig erstattet'),
        h('div', {}, h('b', {}, 'Steuer: '), '§19 Abs. 1 UStG, keine Mehrwertsteuer'),
        h('div', {}, h('b', {}, 'Kontakt: '), '0163 3865144 · info@muellers-mietxpress.de'),
        h('div', { class: 'pextra' }, 'Preisliste 2026, Stand 10/2026')));
  }
  function viewPreise(main) {
    priceEls = { pinfo: h('div', { id: 'pinfo' }), pres: h('div', { id: 'pres' }) };
    const qi = h('input', { class: 'inp', type: 'search', placeholder: 'Produkt suchen …', value: state.priceQ || '', autocomplete: 'off',
      oninput: (e) => { state.priceQ = e.target.value; paintPrices(); } });
    const bis = h('input', { class: 'inp', type: 'date', value: state.pbis || '', onchange: (e) => { state.pbis = e.target.value; paintPrices(); } });
    const von = h('input', { class: 'inp', type: 'date', value: state.pvon || '',
      onchange: (e) => { state.pvon = e.target.value; if (state.pbis && state.pbis < state.pvon) { state.pbis = ''; bis.value = ''; } paintPrices(); } });
    main.append(
      h('div', { class: 'pfilter' }, qi,
        h('div', { class: 'pdates3' },
          h('label', {}, h('small', {}, 'Wunschtermin von'), von),
          h('label', {}, h('small', {}, 'bis (optional)'), bis),
          h('button', { class: 'btn sec', style: 'width:auto;padding:0 12px', onclick: () => { state.pvon = ''; state.pbis = ''; state.priceQ = ''; von.value = ''; bis.value = ''; qi.value = ''; paintPrices(); } }, 'Leeren'))),
      h('div', { class: 'chips' }, PRICES.map((g, gi) => h('button', { onclick: () => { const e = document.getElementById('pc-' + gi); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, g.short))),
      priceEls.pinfo, priceEls.pres);
    paintPrices();
  }

  // ===== Nachrichten-Bausteine (WhatsApp / Kleinanzeigen) =====
  const IBAN_TXT = 'DE85 1001 1001 2519 5253 66';
  function timeDe(t) {
    if (!t) return ''; const m = String(t).match(/^(\d{1,2}):(\d{2})$/); if (!m) return t;
    const h0 = String(parseInt(m[1], 10));
    return m[2] === '00' ? h0 + ' Uhr' : h0 + ':' + m[2] + ' Uhr';
  }
  const GEN = { 'Hüpfburg Schloss': 'die', 'Hüpfburg Kleines Schloss': 'die', 'Hüpfburg Slide': 'die', 'Hüpfburg Space': 'die', 'Popcornmaschine Star': 'die', 'Zuckerwattenmaschine Sweet': 'die', 'Slush Eis Maschine Ninja': 'die', 'Crepes Maschine Paris': 'die', 'Speisewärmer Eat': 'der', 'Glühweinkocher/Wasserkocher': 'der', 'PartyBox JBL 520': 'die', 'Nebelmaschine Fog Beamz': 'die', 'Schneemaschine/Schaumkanone Snow': 'die', 'LED Lichtanlage': 'die', 'DJ & Party Paket': 'das', 'Stehtisch': 'der', 'Bierzeltgarnitur': 'die', 'Party-Kühlschrank/Akku-Kühlbox': 'der', 'Aperol Spritz Maschine': 'die', 'kukki Cocktail-Toaster': 'der' };
  const DISP = { 'Crepes Maschine Paris': 'Crêpes Maschine Paris', 'Schneemaschine/Schaumkanone Snow': 'Schneemaschine', 'Party-Kühlschrank/Akku-Kühlbox': 'Party-Kühlschrank', 'Glühweinkocher/Wasserkocher': 'Glühweinkocher', 'Speisewärmer Eat': 'Speisewärmer' };
  function msgTexts(o) {
    const sig = 'Thorsten Müller';
    const dat = o.d ? pad(o.d.getDate()) + '.' + pad(o.d.getMonth() + 1) : '[DATUM]';
    return {
      avail: 'Hallo,\nja, ' + (o.art && GEN[o.art] ? GEN[o.art] + ' ' + (DISP[o.art] || o.art) + ' wäre' : 'das wäre') + ' da noch verfügbar.\n\nMit freundlichen Grüßen\n' + sig,
      res: 'Hallo lieber Kunde,\nfür deine Reservierung überweise bitte 10 € per PayPal an info@muellers-mietxpress.de\nName und Mietdatum einfach im Betreff angeben.\nDanke! 😊\n\nMit freundlichen Grüßen\n' + sig,
      best: 'Hallo lieber Kunde,\nvielen Dank für deine Buchung! ' +
        (o.hasData ? '' : 'Für den Mietvertrag benötige ich noch deinen vollständigen Namen und deine Adresse. ') +
        'Hier nochmal alle Infos auf einen Blick:\n' +
        '📍 Abholadresse: Leveringhauser Str. 80, 44581 Castrop-Rauxel\n' +
        '🕐 Abholzeit: ' + (o.ab ? timeDe(o.ab) : '[UHRZEIT]') + '\n' +
        '📅 Datum: ' + dat + '\n' +
        '🪪 Bitte mitbringen: Lichtbildausweis + Kaution (bar)\n\nBis dann! 😊\n' + sig,
      bank: 'Hallo lieber Kunde,\nkein Problem, du kannst die 10 € für deine Reservierung auch per Überweisung senden:\nIBAN: ' + IBAN_TXT + '\nName und Mietdatum einfach im Verwendungszweck angeben.\nDanke! 😊\n\nMit freundlichen Grüßen\n' + sig
    };
  }
  function buildMsgs(b) {
    const hasData = !!(b.name && b.name.indexOf('(Name fehlt)') < 0 && b.adresse);
    const m = msgTexts({ d: parse(b.start), ab: b.abholzeit, hasData });
    return [
      { t: '1. Reservierung (PayPal)', x: m.res },
      { t: '2. Bestätigung mit Infos', x: m.best, hint: hasData ? 'Name und Adresse sind schon da, deshalb ohne Nachfrage.' : 'Name oder Adresse fehlen noch, deshalb mit Nachfrage.' },
      { t: '3. Nur wenn kein PayPal: Überweisung', x: m.bank }
    ];
  }
  function copyText(txt, ta) {
    const ok = () => toast('Kopiert');
    const fb = () => {
      try { ta.focus(); ta.select(); ta.setSelectionRange(0, 99999); if (document.execCommand('copy')) ok(); else toast('Bitte Text markieren und kopieren'); }
      catch (e) { toast('Bitte Text markieren und kopieren'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  }
  function closeMsgs() { const ov = document.getElementById('msgs'); if (ov) ov.remove(); }
  function msgBlock(title, hint, ta) {
    return h('div', { class: 'box' },
      h('div', { class: 'ct' }, title),
      hint ? h('div', { class: 'pextra', style: 'margin:0 0 6px' }, hint) : null,
      ta,
      h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => copyText(ta.value, ta) }, 'Kopieren'));
  }
  function mkTa(text) {
    const ta = document.createElement('textarea'); ta.className = 'inp mta'; ta.value = text; ta.rows = Math.min(14, text.split('\n').length + 2);
    return ta;
  }
  function openMsgs(b) {
    closeMsgs();
    const blocks = buildMsgs(b).map((m) => msgBlock(m.t, m.hint, mkTa(m.x)));
    document.body.append(h('div', { class: 'ov', id: 'msgs' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Nachricht'), h('button', { class: 'btn sec', onclick: closeMsgs }, 'Schließen')),
      h('div', { class: 'pextra', style: 'margin:0 0 10px' }, (b.artikel || '') + ' · ' + (b.name && b.name.indexOf('(Name fehlt)') < 0 ? b.name : 'Name noch offen')),
      blocks)));
  }
  function openMsgsGeneric() {
    closeMsgs(); state.menu = false;
    const tas = {};
    const mk = (key, title, hint) => { tas[key] = mkTa(''); return msgBlock(title, hint, tas[key]); };
    const dIn = h('input', { class: 'inp', type: 'date' });
    const hSel = document.createElement('select'), mSel = document.createElement('select'); hSel.className = 'inp'; mSel.className = 'inp';
    const o1 = document.createElement('option'); o1.value = ''; o1.textContent = 'Std.'; hSel.append(o1);
    for (let hh = 0; hh < 24; hh++) { const o = document.createElement('option'); o.value = String(hh); o.textContent = pad(hh); hSel.append(o); }
    const o2 = document.createElement('option'); o2.value = ''; o2.textContent = 'Min.'; mSel.append(o2);
    ['00', '15', '30', '45'].forEach((mm) => { const o = document.createElement('option'); o.value = mm; o.textContent = mm; mSel.append(o); });
    const tval = () => (hSel.value !== '' ? pad(parseInt(hSel.value, 10)) + ':' + (mSel.value || '00') : '');
    const known = h('input', { type: 'checkbox' });
    const sel = document.createElement('select'); sel.className = 'inp';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Produkt (optional)'; sel.append(o0);
    Object.keys(GEN).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = DISP[k] || k; sel.append(o); });
    function fill() {
      const ds = dIn.value, m = msgTexts({ d: ds ? parse(ds) : null, ab: tval(), hasData: known.checked, art: sel.value });
      Object.keys(m).forEach((k) => { if (tas[k]) { tas[k].value = m[k]; tas[k].rows = Math.min(14, m[k].split('\n').length + 2); } });
    }
    [sel, dIn, hSel, mSel, known].forEach((e) => e.addEventListener('change', fill));
    document.body.append(h('div', { class: 'ov', id: 'msgs' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Nachricht'), h('button', { class: 'btn sec', onclick: closeMsgs }, 'Schließen')),
      h('div', { class: 'box' }, h('div', { class: 'ct' }, 'Produkt, Datum und Uhrzeit (optional)'),
        h('div', { style: 'margin-bottom:8px' }, sel),
        h('div', { class: 'pdates' }, h('label', {}, h('small', {}, 'Datum'), dIn),
          h('label', {}, h('small', {}, 'Abholzeit'), h('div', { style: 'display:flex;gap:6px' }, hSel, mSel))),
        h('label', { class: 'calrow' }, known, h('span', {}, 'Name und Adresse sind schon bekannt'))),
      mk('avail', '0. Anfrage: noch verfügbar'),
      mk('res', '1. Reservierung (PayPal)'),
      mk('best', '2. Bestätigung mit Infos', 'Ohne Datum und Zeit bleiben [DATUM] und [UHRZEIT] stehen.'),
      mk('bank', '3. Nur wenn kein PayPal: Überweisung'))));
    fill();
  }

  // ===== Buchungen einfügen (z. B. von Claude vorbereitet: Text kopieren, hier einfügen) =====
  function openPaste() { state.menu = false; state.paste = { text: '', err: null }; render(); }
  function closePaste() { state.paste = null; render(); }
  function parsePasted(text) {
    let t = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    if (!t) throw new Error('Bitte den Text einfügen.');
    let j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('Der Text ist kein gültiges Buchungs-Format (JSON). Bitte genau den kopierten Text einfügen.'); }
    const list = Array.isArray(j) ? j : (j && Array.isArray(j.buchungen) ? j.buchungen : (j && typeof j === 'object' ? [j] : []));
    if (!list.length) throw new Error('Keine Buchungen im Text gefunden.');
    return prepItems(list);
  }
  function prepItems(list) {
    return list.map((o, i) => {
      if (!o || typeof o !== 'object') throw new Error('Eintrag ' + (i + 1) + ' ist keine Buchung.');
      const old = o.id ? state.bookings.find((b) => b.id === String(o.id)) : null;
      const merged = Object.assign({}, old || { erstellt: iso(today0()), status: 'bestaetigt' }, o);
      if (!old && !o.id) merged.id = newId();
      if (!merged.start) throw new Error('Eintrag ' + (i + 1) + ' (' + (merged.name || '?') + '): Startdatum fehlt.');
      if (!merged.ende) merged.ende = merged.start;
      if (merged.ende < merged.start) throw new Error('Eintrag ' + (i + 1) + ' (' + (merged.name || '?') + '): Rückgabe liegt vor der Abholung.');
      if (o.positionen && !o.artikel) merged.artikel = '';
      return { b: merged, isNew: !old };
    });
  }
  async function savePaste() {
    const e = state.paste;
    e.err = null;
    let items;
    try { items = parsePasted(e.text); } catch (err) { e.err = err.message; paintPaste(); return; }
    const warn = [];
    items.forEach((it) => {
      const d = Object.assign({}, it.b, { positionen: (it.b.positionen || Avail.positionsOf(it.b, state.arts)).map((p) => ({ artikel: p.artikel, anzahl: p.anzahl })) });
      editWarnings(d).forEach((w) => warn.push((it.b.name || 'Buchung') + ': ' + w));
    });
    if (warn.length && !confirm('Achtung:\n' + warn.join('\n') + '\n\nTrotzdem übernehmen?')) return;
    let first = null;
    for (const it of items) { const n = await saveBooking(it.b); if (!first) first = n; }
    state.paste = null;
    if (first) { state.sel = first.start; state.cursor = new Date(parse(first.start).getFullYear(), parse(first.start).getMonth(), 1); state.view = 'monat'; }
    render();
    toast(items.filter((x) => x.isNew).length + ' neu, ' + items.filter((x) => !x.isNew).length + ' geändert');
  }
  function paintPaste() {
    const old = document.getElementById('pasteov');
    if (old) old.replaceWith(viewPaste());
  }
  function viewPaste() {
    const e = state.paste;
    return h('div', { class: 'ov', id: 'pasteov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Buchungen einfügen'),
        h('button', { class: 'btn sec', onclick: closePaste }, 'Abbrechen')),
      h('p', { class: 'hint' }, 'Hier den Text einfügen, den Claude dir zum Kopieren gegeben hat. Neue Buchungen werden angelegt, vorhandene (gleiche ID) werden aktualisiert. Bestand und Sperrliste werden geprüft.'),
      e.err ? h('div', { class: 'warnbox err2' }, e.err) : null,
      h('textarea', { class: 'inp', rows: '12', placeholder: 'Text hier einfügen …', oninput: (ev) => { e.text = ev.target.value; } }, e.text),
      h('div', { class: 'stack', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: savePaste }, 'Hinzufügen'))));
  }

  // ===== Eingang: Claude legt Dateien "mietxpress-eingang-….json" in Drive, die App übernimmt sie beim Abgleich =====
  async function processInbox() {
    const done = (await DB.getMeta('eingangDone')) || [];
    const files = await GDRIVE.listInbox();
    const fresh = files.filter((f) => done.indexOf(f.id) < 0).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    let neu = 0, geaendert = 0, weg = 0; const warn = [];
    for (const f of fresh) {
      let j;
      try { j = await GDRIVE.download(f.id); } catch (e) { warn.push(f.name + ': nicht lesbar'); continue; }
      const list = Array.isArray(j) ? j : (j && Array.isArray(j.buchungen) ? j.buchungen : []);
      const del = j && Array.isArray(j.loeschen) ? j.loeschen.map(String) : [];
      try {
        for (const it of prepItems(list)) {
          const d = Object.assign({}, it.b, { positionen: (it.b.positionen || Avail.positionsOf(it.b, state.arts)).map((p) => ({ artikel: p.artikel, anzahl: p.anzahl })) });
          editWarnings(d).forEach((w) => warn.push((it.b.name || 'Buchung') + ': ' + w));
          await saveBooking(it.b);
          if (it.isNew) neu++; else geaendert++;
        }
        for (const id of del) { const b = state.bookings.find((x) => x.id === id); if (b) { await removeBooking(b); weg++; } }
      } catch (e) { warn.push(f.name + ': ' + e.message); continue; }
      done.push(f.id);
    }
    await DB.setMeta('eingangDone', done.slice(-200));
    return { neu, geaendert, weg, warn, dateien: fresh.length };
  }

  function syncBanner() {
    const d = state.drive;
    const txt = state.dirty > 0
      ? state.dirty + (state.dirty === 1 ? ' Änderung' : ' Änderungen') + ' noch nicht in Drive'
      : 'Noch nicht abgeglichen – holt Neues von Claude und aus Drive';
    return h('div', { class: 'sync' },
      h('span', {}, txt + (d.err ? ' – ' + d.err : '')),
      h('button', { class: 'btn', disabled: (d.busy || !state.online) ? '' : null, onclick: () => driveSync() },
        d.busy ? '…' : (state.online ? 'Abgleichen' : 'Offline')));
  }

  // ===== Rendern =====
  function render() {
    const app = document.getElementById('app');
    const y = window.scrollY;
    app.replaceChildren();
    const wrap = h('div', { class: 'wrap' });
    wrap.append(h('header', {},
      h('img', { class: 'logoimg', src: state.logo || 'logo.jpg', alt: 'müllers-MietXpress' }),
      h('h1', {}, 'MietXpress'),
      h('span', { class: 'net ' + (state.online ? 'on' : 'off') }, state.online ? 'Online' : 'Offline'),
      h('button', { class: 'iconbtn', 'aria-label': 'Nachricht', onclick: openMsgsGeneric }, '💬'),
      h('button', { class: 'iconbtn', 'aria-label': 'Neue Buchung', onclick: () => openEdit(null) }, '+'),
      h('button', { class: 'iconbtn', 'aria-label': 'Daten und Einstellungen', onclick: () => { state.menu = true; render(); } }, '⋯')));
    if (state.ready && state.view !== 'preise' && state.bookings.length) wrap.append(statsBox());
    wrap.append(h('div', { class: 'tabs' }, [['monat', 'Monat'], ['liste', 'Liste'], ['bestand', 'Bestand'], ['preise', 'Preise']].map((t) =>
      h('button', { class: state.view === t[0] ? 'on' : '', onclick: () => { state.view = t[0]; render(); } }, t[1]))));

    if (state.ready && (state.dirty > 0 || (state.drive.id && !state.synced))) wrap.append(syncBanner());
    const main = h('main');
    if (!state.ready) main.append(h('div', { class: 'empty' }, 'Lade …'));
    else if (!state.bookings.length && !state.arts.length) {
      main.append(h('div', { class: 'empty' },
        h('b', {}, 'Noch keine Daten auf diesem Gerät'),
        h('div', { class: 'btns' },
          h('button', { class: 'btn', onclick: () => { state.menu = true; render(); } }, 'Daten laden'),
          h('button', { class: 'btn sec', onclick: async () => { await replaceData(demoData()); render(); } }, 'Mit Beispieldaten ausprobieren'))));
    } else if (state.view === 'monat') viewMonat(main);
    else if (state.view === 'liste') viewListe(main);
    else if (state.view === 'preise') viewPreise(main);
    else viewBestand(main);
    wrap.append(main);
    if (state.ready && state.importAt) wrap.append(h('div', { class: 'stand' }, 'Datenstand: ' + new Date(state.importAt).toLocaleString('de-DE')));
    app.append(wrap);
    if (state.menu) app.append(viewMenu());
    if (state.edit) app.append(viewEdit());
    if (state.paste) app.append(viewPaste());
    if (state.pickup) app.append(viewPickup());
    if (state.info) app.append(viewInfo());
    if (state.sperrOpen) app.append(viewSperr());
    if (state.bestandOpen) app.append(viewBestandEdit());
    window.scrollTo(0, y);
  }

  // ===== Start =====
  window.addEventListener('online', () => { state.online = true; render(); });
  window.addEventListener('offline', () => { state.online = false; render(); });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  render();
  function autoSync() {
    if (!state.ready || !state.drive.id || !state.online || state.drive.busy || state.synced) return;
    if (Date.now() - state.autoAt < 5 * 60 * 1000) return;
    state.autoAt = Date.now();
    driveSync(true);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });
  load().then(() => { render(); setTimeout(autoSync, 600); }).catch((e) => {
    document.getElementById('app').replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'empty' }, 'Speicher nicht verfügbar: ' + e.message)));
  });
})();
