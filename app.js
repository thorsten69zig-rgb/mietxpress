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
    calWrite: false, calDel: [], synced: false, autoAt: 0,
    weekStart: null, selA: null, selB: null, gev: null
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
  const eur0 = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const isoWeek = (d) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
  const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  state.cursor = new Date(today0().getFullYear(), today0().getMonth(), 1);
  state.sel = iso(today0());
  try { state.breit = localStorage.getItem('mxBreit') === '1'; } catch (e) { state.breit = false; }
  try { if (/[?&]ansicht=schnell\b/.test(location.search)) localStorage.setItem('mxSchnell', '1'); if (/[?&]ansicht=normal\b/.test(location.search)) localStorage.setItem('mxSchnell', '0'); state.schnell = localStorage.getItem('mxSchnell') === '1'; } catch (e) { state.schnell = /[?&]ansicht=schnell\b/.test(location.search); }
  state.von = iso(today0());
  state.weekStart = iso(addDays(today0(), -((today0().getDay() + 6) % 7)));
  state.selA = state.selB = iso(today0());

  // ===== Feiertage NRW (fest eingebaut, berechnet) =====
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
    const mo = Math.floor((hh + l - 7 * m + 114) / 31), da = ((hh + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  function nrwHolidays(y) {
    const e = easterSunday(y), at = (n) => iso(addDays(e, n)), out = [];
    const add = (ds, t) => out.push({ id: 'nrw:' + ds, cal: 'nrw', title: t, start: ds, ende: ds, zeit: '', ort: '', typ: 'holiday' });
    add(y + '-01-01', 'Neujahr'); add(at(-2), 'Karfreitag'); add(at(0), 'Ostersonntag'); add(at(1), 'Ostermontag');
    add(y + '-05-01', 'Tag der Arbeit'); add(at(39), 'Christi Himmelfahrt'); add(at(49), 'Pfingstsonntag'); add(at(50), 'Pfingstmontag'); add(at(60), 'Fronleichnam');
    add(y + '-10-03', 'Tag der Deutschen Einheit'); add(y + '-10-31', 'Reformationstag / Halloween'); add(y + '-11-01', 'Allerheiligen');
    add(y + '-12-25', '1. Weihnachtstag'); add(y + '-12-26', '2. Weihnachtstag');
    return out;
  }

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
      id: String(b.id), name: b.name || '', adresse: b.adresse || '', telefon: b.telefon || '', email: b.email || '',
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
      enthaelt: Array.isArray(a.enthaelt) ? a.enthaelt : null,
      foto: a.foto == null ? null : !!a.foto
    };
  }
  const isActive = (b) => b.status !== 'storniert';
  const isOpenBooking = (b) => b.status !== 'storniert' && b.status !== 'zurueck';

  // Einheitliche Farben: Buchung = Rot, Privat = Grün, Geburtstag = Orange, Feiertage/Wochen = Gelb
  const KCOL = { mx: '#2f7de1', priv: '#5cc98a', bday: '#a855f7', info: '#f2c94c' };
  function bookCatColor() { return KCOL.mx; }

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
    const gInfo = new Set(state.cal.events.filter((e) => state.cal.sel.indexOf(e.cal) >= 0 && evKind(e) === 'info').map((e) => e.start));
    const ys = new Set([state.cursor.getFullYear(), parse(state.weekStart).getFullYear(), today0().getFullYear()]);
    let hol = [];
    ys.forEach((y) => { hol = hol.concat(nrwHolidays(y)); });
    hol = hol.filter((x) => !gInfo.has(x.start));
    state.cal.events.concat(hol).forEach((ev) => {
      if (ev.cal !== 'nrw' && state.cal.sel.indexOf(ev.cal) < 0) return;
      if (/^kalenderwoche\s*\d+/i.test(ev.title)) return; // KW steht jetzt links im Monatsraster
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
  const evColor = (ev) => KCOL[evKind(ev)];


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
        if (!ib.dateien) inboxMsg = ' Eingang: ' + ib.gesehen + ' Dateien in Drive, alle schon übernommen (neueste ' + ib.neuste + ').';
        else inboxMsg = ' Eingang (' + ib.dateien + ' von ' + ib.gesehen + ' Dateien neu): ' + ib.neu + ' neu, ' + ib.geaendert + ' geändert' + (ib.weg ? ', ' + ib.weg + ' gelöscht' : '') + (ib.bestand ? ', Bestand ' + ib.bestand + ' geändert' : '') + '.' + (ib.warn.length ? ' Hinweise: ' + ib.warn.join('; ') : '');
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
      try { const nf = await flushFotos(); if (nf) d.msg += ' ' + nf + (nf === 1 ? ' Foto' : ' Fotos') + ' in Drive abgelegt.'; } catch (e) { /* später nochmal */ }
      try { const n = await flushContracts(); if (n) d.msg += ' ' + n + (n === 1 ? ' Mietvertrag' : ' Mietverträge') + ' in Drive abgelegt.'; } catch (e) { /* später nochmal */ }
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

  function dueLabel(b) {
    const t = today0(), ds = Math.round((parse(b.start) - t) / 864e5), de = Math.round((parse(b.ende || b.start) - t) / 864e5);
    if (b.status === 'storniert') return { t: 'storniert', c: '' };
    if (ds > 1) return { t: 'in ' + ds + ' Tagen', c: '' };
    if (ds === 1) return { t: 'morgen', c: 'due' };
    if (ds === 0) return { t: 'heute', c: 'due' };
    if (de >= 0) return { t: 'läuft gerade', c: 'due' };
    if (de === -1) return { t: 'gestern', c: 'past' };
    return { t: 'vor ' + (-de) + ' Tagen', c: 'past' };
  }
  // Pakete aus der Notiz lesen: Wochenendpaket (Fr–So, Sa–So …) und Zusatzpakete ("+ Nebel Paket 1 (1 Liter …) 10 €")
  // Artikeltext mit Stückzahl: "2× Bierzeltgarnitur" (aus den Positionen; sonst aus der Notiz "2 Stück", wenn es nur einen Artikel gibt)
  function artLine(b) {
    const base = b.artikel || '';
    const pos = Array.isArray(b.positionen) ? b.positionen.filter((p) => p && p.artikel) : [];
    if (pos.some((p) => Number(p.anzahl) > 1)) return pos.map((p) => (Number(p.anzahl) > 1 ? p.anzahl + '× ' : '') + p.artikel).join(', ');
    if (/\d\s*[×x]\s/.test(base)) return base;
    if (pos.length <= 1 && base.indexOf(',') < 0) { const m = /(\d+)\s*(?:Stück|Stk)/i.exec(b.notiz || ''); if (m && Number(m[1]) > 1) return m[1] + '× ' + base; }
    return base;
  }
  function pkgInfo(b) {
    const t = String(b.notiz || ''), out = [];
    const w = t.match(/Wochenendpaket\s*(Fr\s*[–-]\s*So|Fr\s*[–-]\s*Sa|Sa\s*[–-]\s*So)?/i);
    if (w) out.push({ k: 'wk', t: 'Wochenendpaket' + (w[1] ? ' ' + w[1].replace(/\s*-\s*/, '–').replace(/\s+/g, '') : '') });
    const re = /\+\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß ]*?Paket(?:\s*\d+)?|Extra:\s*[^()€+\n]*?)\s*(?:\(([^)]*)\))?\s*(\d+(?:[.,]\d+)?)\s*€/g;
    let m;
    while ((m = re.exec(t))) out.push({ k: 'ex', t: '+ ' + m[1].replace(/^Extra:\s*/, '').trim() + ' · ' + m[3].replace('.', ',') + ' €', d: m[2] || '' });
    return out;
  }
  function isKombi(b) {
    const p = Avail.positionsOf(b, state.arts);
    if (p.length !== 2) return false;
    const n = p.map((x) => x.artikel);
    return (n[0].indexOf('Hüpfburg') === 0 && n[1] === 'PartyBox JBL 520') || (n[1].indexOf('Hüpfburg') === 0 && n[0] === 'PartyBox JBL 520');
  }
  const cap = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  const hhmm = (t) => t ? t + ' Uhr' : 'Zeit offen';

  // Bezugstag: im Monat der gewählte Tag, sonst heute
  const refDay = () => (state.view === 'monat' && state.sel) ? state.sel : iso(today0());
  // zugeklappt: zurückgebracht oder schon abgeholt und Rückgabe erst nach dem Bezugstag (an dem Tag nichts zu tun)
  const foldMode = (b) => b.status === 'zurueck' ? 'done' : (b.status === 'abgeholt' && (b.ende || b.start) > refDay() ? 'run' : null);
  const quickSt = (b, st) => async (ev) => { ev.stopPropagation(); await patchBooking(b, { status: st, statusVorher: b.status }); toast(st === 'abgeholt' ? 'Als abgeholt markiert' : 'Als zurückgebracht markiert'); };
  function doneRow(b, mode) {
    const run = mode === 'run';
    const warn = b.status === 'zurueck' && ((b.kaution > 0 && b.kautionStatus !== 'zurueck') || b.rechnung !== 'erstellt');
    return h('div', { class: 'donerow' + (run ? ' run' : ''), role: 'button', style: '--pc:' + bookCatColor(b), onclick: () => { state.open['z' + b.id] = true; render(); } },
      h('em', {}, run ? 'DRAUSSEN' : 'ZURÜCK ✓'),
      h('b', {}, abbrArt(b.artikel) || b.artikel || b.name),
      state.view === 'liste' ? h('small', {}, b.name || '') : null,
      run ? h('small', {}, 'bis ' + wd(b.ende || b.start) + ' ' + fmtD(b.ende || b.start)) : (warn ? h('small', { class: 'wn' }, '⚠ offen') : null),
      h('i', {}, '▾'));
  }
  function card(b) {
    const fm = foldMode(b);
    if (fm && !state.open['z' + b.id]) return doneRow(b, fm);
    const ref = refDay(), endD = b.ende || b.start;
    const todo = b.status === 'abgeholt' ? endD <= ref : ((b.status === 'bestaetigt' || b.status === 'angefragt') && b.start <= ref && endD >= ref);
    const stLabel = b.status === 'abgeholt' ? (endD < ref ? 'Rückgabe überfällig' : (endD === ref ? 'Heute zurückbringen' : 'Abgeholt · Rückgabe offen')) : (STATUS[b.status] || b.status);
    const stop = (e) => e.stopPropagation();
    const rest = Math.max(0, b.preis - b.anzahlung);
    const kautOpen = b.kaution > 0 && b.kautionStatus !== 'erhalten' && b.kautionStatus !== 'zurueck' ? b.kaution : 0;
    const total = rest + kautOpen;
    const due = dueLabel(b);
    const sp = sperrMatch(b);
    const days = Math.round((parse(b.ende || b.start) - parse(b.start)) / 864e5) + 1;
    const kLabel = b.kaution > 0 ? 'Kaution · ' + (b.kautionStatus === 'keine' ? 'Offen' : (KAUT[b.kautionStatus] || b.kautionStatus)) : 'Kaution';
    const calOk = b.gcalEventId || b.kalender === 'ja';
    const payParts = [rest > 0 ? 'Rest ' + eur0(rest) : null, kautOpen > 0 ? 'Kaution ' + eur0(kautOpen) : null].filter(Boolean).join(' + ');
    const payOpen = (b.status === 'angefragt' || b.status === 'bestaetigt');
    return h('div', { class: 'card' + (b.status === 'storniert' ? ' cancel' : '') + (todo ? ' todo' : ''), style: '--pc:' + bookCatColor(b) },
      h('div', { class: 'stripe' }),
      h('div', { class: 'body' },
        h('div', { class: 'top' }, h('span', { class: 'when ' + due.c }, due.t),
          h('span', { class: 'tr' }, isKombi(b) ? h('span', { class: 'kombi' }, 'KOMBI') : null, h('span', { class: 'chip st-' + b.status }, stLabel))),
        h('div', { class: 'name' }, artLine(b) || '(ohne Artikel)'),
        h('div', { class: 'art' }, (b.name || '(ohne Name)') + (sp ? ' 🚫' : '')),
        pkgInfo(b).length ? h('div', { class: 'pkgrow' }, pkgInfo(b).map((p) => h('span', { class: 'pkg ' + p.k, title: p.d }, (p.k === 'wk' ? '📦 ' : '') + p.t + (p.d ? ' (' + p.d + ')' : '')))) : null,
        h('div', { class: 'tl' }, h('b', {}, 'Abholung'), ' ' + wd(b.start) + ' ' + fmtD(b.start) + ' · ' + hhmm(b.abholzeit || b.zeit)),
        h('div', { class: 'tl' }, h('b', {}, 'Rückgabe'), ' ' + wd(b.ende || b.start) + ' ' + fmtD(b.ende || b.start) + ' · ' + hhmm(b.rueckzeit), h('span', { class: 'dayc' }, days + (days === 1 ? ' Tag' : ' Tage'))),
        h('div', { class: 'money' }, money('Gesamtpreis', eur0(b.preis)), money('Anzahlung', eur0(b.anzahlung)), money(kLabel, b.kaution > 0 ? eur0(b.kaution) : '—')),
        (() => { const lp = listDev(b); return lp != null ? h('div', { class: 'devi' }, '⚠ Preis weicht von der Preisliste ab (Liste: ' + eur0(lp) + ')') : null; })(),
        payOpen && total > 0 ? h('div', { class: 'pay' }, h('div', {}, h('div', {}, 'Bei Abholung zu zahlen'), h('small', {}, payParts)), h('b', {}, eur0(total))) : null,
        payOpen && total === 0 && b.preis > 0 ? h('div', { class: 'pay ok' }, '✓ Alles bezahlt') : null,
        (b.plattform || b.adresse) ? h('div', { class: 'srcrow' },
          b.plattform ? h('span', { class: 'plat' }, cap(b.plattform)) : null,
          b.adresse ? h('a', { href: 'https://maps.apple.com/?q=' + encodeURIComponent(b.adresse) }, b.adresse) : null) : null,
        (b.status === 'bestaetigt' || b.status === 'angefragt') && b.start <= ref ? h('button', { class: 'quick qa', onclick: quickSt(b, 'abgeholt') }, '✓ Abgeholt') : null,
        b.status === 'abgeholt' ? h('button', { class: 'quick qr', onclick: quickSt(b, 'zurueck') }, '✓ Zurückgebracht') : null,
        h('button', { class: 'cb abh bigabh', onclick: () => openPickup(b) }, 'Abholung'),
        h('div', { class: 'cbrow' },
          h('button', { class: 'cb mv', onclick: (ev) => makeContract(b, ev.currentTarget) }, 'Mietvertrag'),
        ),
        h('div', { class: 'rrow' }, rechBtn(b),
          b.status !== 'storniert' ? h('span', { class: 'calst ' + (calOk ? 'ok' : (b.kalender === 'abweichend' ? 'warn' : 'no')) },
            calOk ? '✓ im Kalender' : (b.kalender === 'abweichend' ? '⚠ Kalender abweichend' : '✕ noch nicht im Kalender')) : null),
        h('div', { class: 'since' }, h('span', {}, b.erstellt ? 'Eingetragen am ' + fmtDE(b.erstellt) : 'Eintragsdatum unbekannt'),
          h('button', { class: 'moretgl', onclick: () => { state.open['m' + b.id] = !state.open['m' + b.id]; render(); } }, state.open['m' + b.id] ? 'Weniger ▴' : 'Status · Notiz ▾')),
        state.open['m' + b.id] ? h('div', { class: 'det' },
          sp ? h('div', {}, '🚫 Gesperrter Kunde' + (sp.grund ? ': ' + sp.grund : '')) : null,
          b.telefon ? h('div', {}, h('span', {}, 'Telefon: '), h('a', { href: 'tel:' + b.telefon.replace(/\s+/g, '') }, b.telefon)) : null,
          b.vertragAt ? h('div', {}, '✍ Vertrag digital unterschrieben am ' + fmtD(b.vertragAt.slice(0, 10))) : null,
          b.email ? h('div', {}, h('span', {}, 'E-Mail: '), h('a', { href: 'mailto:' + b.email }, b.email)) : null,
          b.notiz ? h('div', { class: 'note' }, b.notiz) : null,
          h('button', { class: 'cb msg', style: 'margin:8px 0', onclick: () => openMsgs(b) }, '💬 Nachricht an Kunden'),
          actions(b)) : null,
        fm ? h('button', { class: 'runclose', style: 'margin-top:8px', onclick: () => { state.open['z' + b.id] = false; render(); } }, '▴ Einklappen') : null));
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
    if (ev.cal === 'nrw') return 'info';
    const nm = cal ? cal.name : '';
    if (ev.typ === 'birthday' || /geburtstag|🎂/i.test(ev.title) || /geburtstag|birthday/i.test(nm)) return 'bday';
    if (/mietxpress/i.test(nm)) return 'mx';
    if (/feiertag|kalenderwoche/i.test(nm)) return 'info';
    return 'priv';
  }
  const KIND_ORDER = { mx: 0, bday: 1, priv: 2, info: 3 };
  const KIND_LABEL = { mx: 'MietXpress-Kalender', bday: 'Geburtstage 🎂', priv: 'Privat', info: 'Feiertage & Wochen' };
  const byKind = (a, b) => (KIND_ORDER[evKind(a)] - KIND_ORDER[evKind(b)]) || (a.zeit || '').localeCompare(b.zeit || '');
  // Kurzform für Termine in den Kacheln: Klammern und Zusätze weg, nach ca. 22 Zeichen am Wortende kürzen
  function shortEv(t) {
    let s = String(t || '').replace(/^🎂\s*/, '').replace(/\s*\([^)]*\)/g, '').split(/\s+[–\/-]\s+|:\s/)[0].trim();
    if (s.length > 22) {
      const cut = s.slice(0, 23), sp = cut.lastIndexOf(' ');
      s = (sp >= 6 ? cut.slice(0, sp) : s.slice(0, 22)).replace(/[,;]$/, '') + '…';
    }
    return s || String(t || '');
  }
  function evChip(ev) {
    const k = evKind(ev), col = KCOL[k];
    const style = 'border-left:4px solid ' + col + ';background:' + col + '66';
    return h('span', { class: 'pc ev ev-' + k, style }, h('span', { class: 'pn' }, (k === 'bday' ? '🎂 ' : '') + shortEv(ev.title)));
  }

  // Monat auf einen Bildschirm einpassen: Kachelhöhe fest, Detailgrad je Tag so hoch wie möglich, Rest als „+n"
  function fitGrid(grid, rows) {
    const run = () => {
      if (!grid.isConnected) return;
      const top = grid.getBoundingClientRect().top + window.scrollY;
      const H = Math.max(rows * (grid.closest('.breit') ? 150 : 74) + 20, window.innerHeight - top - 8);
      grid.style.height = H + 'px';
      grid.style.gridTemplateRows = 'auto repeat(' + rows + ', minmax(0, 1fr))';
      grid.querySelectorAll('.day').forEach((cell) => {
        const over = () => cell.scrollHeight > cell.clientHeight + 1;
        const chips = [...cell.querySelectorAll('.pc')];
        cell.querySelectorAll('.more').forEach((m) => m.remove());
        chips.forEach((c) => { c.style.display = ''; });
        let lvl = 0;
        for (; lvl <= 3; lvl++) { cell.dataset.l = lvl; if (!over()) break; }
        if (lvl > 3) {
          cell.dataset.l = 3;
          const m = h('div', { class: 'more' }, '');
          cell.append(m);
          let hid = 0;
          for (let i = chips.length - 1; i > 0 && over(); i--) { chips[i].style.display = 'none'; hid++; m.textContent = '+' + hid; }
          if (!hid) m.remove();
        }
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    if (!state.fitBound) { state.fitBound = true; window.addEventListener('resize', () => { if (state.view === 'monat') render(); }); }
  }
  // Kurznamen für die Monatskacheln (Reihenfolge egal, längste Namen werden zuerst ersetzt)
  const ABBR = [['Hüpfburg Kleines Schloss', 'HB Kl. Schloss'], ['Hüpfburg Schloss', 'HB Schloss'], ['Hüpfburg Slide', 'HB Slide'], ['Hüpfburg Space', 'HB Space'],
    ['Popcornmaschine Star', 'Popcorn'], ['Zuckerwattenmaschine Sweet', 'Zuckerwatte'], ['Slush Eis Maschine Ninja', 'Slush'], ['Crepes Maschine Paris', 'Crepes'],
    ['Speisewärmer Eat', 'Speisewärmer'], ['Glühweinkocher/Wasserkocher', 'Glühwein'], ['kukki Cocktail-Toaster', 'Cocktail-Toaster'], ['Aperol Spritz Maschine', 'Aperol'],
    ['PartyBox JBL 520', 'PartyBox'], ['Nebelmaschine Fog Beamz', 'Nebel'], ['Schneemaschine/Schaumkanone Snow', 'Schnee'], ['LED Lichtanlage', 'LED-Licht'],
    ['DJ & Party Paket', 'DJ-Paket'], ['Party-Kühlschrank/Akku-Kühlbox', 'Kühlschrank'], ['Bierzeltgarnitur', 'Bierzelt']];
  function abbrArt(t) {
    let s = String(t || '');
    ABBR.slice().sort((x, y) => y[0].length - x[0].length).forEach((p) => {
      s = s.split(p[0]).join(p[1]);
    });
    return s;
  }
  function shortArt(t) {
    const p = String(t).split(/\s*[,+&]\s*|\s+und\s+/).filter(Boolean);
    return p.length > 1 ? p[0] + ' +' + (p.length - 1) : p[0] || '';
  }
  function viewMonat(main, noPanel, pHost) {
    const c = state.cursor, y = c.getFullYear(), mo = c.getMonth();
    main.append(h('div', { class: 'mnav' },
      h('button', { 'aria-label': 'Vorheriger Monat', onclick: () => gotoMonth(y, mo - 1) }, '‹'),
      h('b', {}, MONTHS[mo] + ' ' + y),
      h('button', { class: 'todaybtn', onclick: () => { const t = today0(); state.cursor = new Date(t.getFullYear(), t.getMonth(), 1); state.sel = iso(t); render(); window.scrollTo(0, 0); } }, 'Heute'),
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
    grid.append(h('div', { class: 'dow kw' }, 'KW'));
    DOW.forEach((d) => grid.append(h('div', { class: 'dow' }, d)));
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const rows = Math.ceil((lead + days) / 7);
    const start = new Date(y, mo, 1 - lead);
    const map = dayMap();
    const ems = evMap();
    const ts = iso(today0());
    for (let i = 0; i < rows * 7; i++) {
      if (i % 7 === 0) grid.append(h('div', { class: 'kwc' }, isoWeek(addDays(start, i + 3))));
      const d = addDays(start, i), ds = iso(d), list = map[ds] || [], evs = (ems[ds] || []).slice().sort(byKind);
      const bShown = list.length;
      const eShown = evs.length;
      const more = 0;
      grid.append(h('button', {
        class: 'day' + (d.getMonth() !== mo ? ' out' : '') + (ds === ts ? ' today' : '') + (ds === state.sel ? ' sel' : ''),
        onclick: () => { state.sel = ds; if (state.schnell) { state.pvon = ds; state.pbis = ''; } render(); }
      },
        h('div', { class: 'dn' }, d.getDate()),
        list.slice(0, bShown).map((b) => {
          const col = bookCatColor(b);
          return h('span', { class: 'pc' + (b.status === 'zurueck' ? ' done' : ''), style: 'border-left:4px solid ' + col + ';background:' + col + '66' },
            h('span', { class: 'pn' }, abbrArt(artLine(b)) || b.name || '—'),
            (b.start === ds ? (b.abholzeit || b.zeit || '') : (b.ende === ds ? (b.rueckzeit || '') : '')) ? h('span', { class: 'pt' }, (b.start === ds ? '↑ ' + (b.abholzeit || b.zeit) : '↓ ' + b.rueckzeit)) : null,
            b.start === ds && b.preis - b.anzahlung > 0 ? h('span', { class: 'po' }, 'Offen ' + eur(b.preis - b.anzahlung)) : null);
        }),
        evs.slice(0, eShown).map(evChip),
        more > 0 ? h('div', { class: 'more' }, '+' + more) : null));
    }
    main.append(grid);
    fitGrid(grid, rows);
    if (noPanel) return;
    const P = pHost || main;

    const rank = (x) => x.status === 'angefragt' ? 0 : (foldMode(x) && !state.open['z' + x.id] ? 1 : 2);
    const sel = (map[state.sel] || []).slice().sort((x, y) => (rank(x) - rank(y)) || sortByStart(x, y));
    P.append(h('h3', {}, fmtFull(state.sel)));
    P.append(h('div', { class: 'grp grp-mx' }, 'MietXpress · Buchungen'));
    if (sel.length) sel.forEach((b) => {
      const runs = b.start !== state.sel && (b.ende || b.start) !== state.sel; // läuft nur durch, weder Abholung noch Rückgabe an diesem Tag
      const total = Math.round((parse(b.ende || b.start) - parse(b.start)) / 864e5) + 1, nth = Math.round((parse(state.sel) - parse(b.start)) / 864e5) + 1;
      const toggle = () => { state.open['c' + b.id] = !state.open['c' + b.id]; render(); };
      if (runs && !state.open['c' + b.id]) {
        P.append(h('button', { class: 'runrow', style: '--pc:' + bookCatColor(b), onclick: toggle },
          h('em', {}, 'LÄUFT'),
          h('b', {}, abbrArt(b.artikel) || b.name),
          h('span', {}, (b.name || '') + ' · Tag ' + nth + '/' + total + ' · bis ' + wd(b.ende || b.start) + ' ' + fmtD(b.ende || b.start)),
          h('i', {}, '▾ aufklappen')));
      } else {
        if (runs) P.append(h('button', { class: 'runclose', onclick: toggle }, '▴ Einklappen · ' + (abbrArt(b.artikel) || b.name) + ' läuft nur durch'));
        P.append(card(b));
      }
    });
    else P.append(h('div', { class: 'empty' }, 'Keine Buchungen an diesem Tag.'));

    const dayEv = (ems[state.sel] || []).slice().sort(byKind);
    let lastK = null;
    dayEv.forEach((ev) => {
      const k = evKind(ev);
      if (k !== lastK) { P.append(h('div', { class: 'grp grp-' + k }, KIND_LABEL[k])); lastK = k; }
      P.append(evRow(ev));
    });
    if (state.cal.connected) P.append(h('button', { class: 'btn sec addev', onclick: () => openGev(null, state.sel) }, '+ Termin im Google Kalender'));
  }

  // ===== Google-Termine anlegen / ändern / löschen =====
  function writableCals() { return state.cal.cals.filter((c) => c.access === 'owner' || c.access === 'writer'); }
  function evEditable(ev) {
    if (ev.cal === 'nrw' || ev.typ === 'birthday' || ev.typ === 'holiday') return false;
    const k = evKind(ev);
    if (k === 'mx' || k === 'bday' || k === 'info') return false;
    return writableCals().some((c) => c.id === ev.cal);
  }
  function evRow(ev) {
    const k = evKind(ev), can = evEditable(ev);
    return h('div', Object.assign({ class: 'evrow ev-' + k + (can ? ' tap' : ''), style: '--pc:' + evColor(ev) }, can ? { onclick: () => openGev(ev) } : {}),
      h('b', {}, (k === 'bday' ? '🎂 ' : '') + ev.title.replace(/^🎂\s*/, '')),
      h('div', { class: 'art' }, [ev.zeit || 'ganztägig', ev.start !== ev.ende ? fmtD(ev.start) + ' – ' + fmtD(ev.ende) : '', ev.ort].filter(Boolean).join(' · ') + (can ? ' · ✎' : '')));
  }
  function openGev(ev, ds) {
    const wc = writableCals();
    if (!wc.length) { toast('Kein beschreibbarer Kalender verbunden'); return; }
    if (ev) {
      state.gev = { id: ev.id.slice(ev.cal.length + 1), cal: ev.cal, title: ev.title, start: ev.start, ende: ev.ende, zeit: ev.zeit || '', zeitEnde: '', ort: ev.ort || '', err: null, busy: false, arm: false };
    } else {
      const pref = wc.find((c) => !/mietxpress|geburtstag|feiertag|kalenderwoche/i.test(c.name) && c.primary) || wc.find((c) => !/mietxpress|geburtstag|feiertag|kalenderwoche/i.test(c.name)) || wc[0];
      state.gev = { id: null, cal: pref.id, title: '', start: ds || state.sel, ende: ds || state.sel, zeit: '', zeitEnde: '', ort: '', err: null, busy: false, arm: false };
    }
    render();
  }
  function closeGev() { state.gev = null; render(); }
  function gevBody(g) {
    const body = { summary: g.title.trim(), location: g.ort.trim() };
    if (g.zeit) {
      const ze = g.zeitEnde || (pad((parseInt(g.zeit.slice(0, 2), 10) + 1) % 24) + g.zeit.slice(2));
      body.start = { dateTime: g.start + 'T' + g.zeit + ':00', timeZone: 'Europe/Berlin' };
      body.end = { dateTime: g.ende + 'T' + ze + ':00', timeZone: 'Europe/Berlin' };
    } else {
      body.start = { date: g.start };
      body.end = { date: iso(addDays(parse(g.ende), 1)) };
    }
    return body;
  }
  async function gevRun(fn) {
    const g = state.gev;
    g.busy = true; g.err = null; render();
    try {
      await fn();
      await fetchEvents();
      state.gev = null;
    } catch (e) { g.err = e.message || 'Fehler'; g.busy = false; }
    render();
  }
  function gevSave() {
    const g = state.gev;
    if (!g.title.trim()) { g.err = 'Bitte einen Titel eingeben.'; render(); return; }
    if (!g.start) { g.err = 'Bitte ein Datum wählen.'; render(); return; }
    if (!g.ende || g.ende < g.start) g.ende = g.start;
    const sign = GCAL.signIn(); // muss direkt im Fingertipp starten
    gevRun(async () => {
      await sign;
      if (g.id) await GCAL.patchEvent(g.cal, g.id, gevBody(g)); else await GCAL.createEvent(g.cal, gevBody(g));
    });
  }
  function gevDelete() {
    const g = state.gev;
    if (!g.arm) { g.arm = true; render(); return; }
    const sign = GCAL.signIn();
    gevRun(async () => { await sign; await GCAL.deleteEvent(g.cal, g.id); });
  }
  function viewGev() {
    const g = state.gev;
    const fld = (label, el) => h('label', { class: 'fld' }, h('small', {}, label), el);
    const wc = writableCals();
    return h('div', { class: 'ov', id: 'gevov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, g.id ? 'Termin ändern' : 'Neuer Termin'),
        h('div', { class: 'two' }, h('button', { class: 'btn sec', onclick: closeGev }, 'Abbrechen'), h('button', { class: 'btn', disabled: g.busy ? '' : null, onclick: gevSave }, g.busy ? '…' : 'Speichern'))),
      g.err ? h('div', { class: 'warnbox err2' }, g.err) : null,
      h('div', { class: 'box' },
        fld('Titel', h('input', { class: 'inp', type: 'text', value: g.title, id: 'gevt', autocomplete: 'off', oninput: (e) => { g.title = e.target.value; } })),
        fld('Kalender', h('select', { class: 'inp', disabled: g.id ? '' : null, onchange: (e) => { g.cal = e.target.value; } },
          wc.map((c) => h('option', { value: c.id, selected: c.id === g.cal ? '' : null }, c.name)))),
        h('div', { class: 'two2' },
          fld('Von', h('input', { class: 'inp', type: 'date', value: g.start, onchange: (e) => { g.start = e.target.value; if (g.ende < g.start) { g.ende = g.start; render(); } } })),
          fld('Bis', h('input', { class: 'inp', type: 'date', value: g.ende, onchange: (e) => { g.ende = e.target.value; } }))),
        h('div', { class: 'two2' },
          fld('Uhrzeit (leer = ganztägig)', h('input', { class: 'inp', type: 'time', value: g.zeit, onchange: (e) => { g.zeit = e.target.value; } })),
          fld('Ende (optional)', h('input', { class: 'inp', type: 'time', value: g.zeitEnde, onchange: (e) => { g.zeitEnde = e.target.value; } }))),
        fld('Ort', h('input', { class: 'inp', type: 'text', value: g.ort, oninput: (e) => { g.ort = e.target.value; } }))),
      g.id ? h('button', { class: 'btn warn', style: 'width:100%;margin-top:12px', disabled: g.busy ? '' : null, onclick: gevDelete }, g.arm ? 'Wirklich löschen? Nochmal tippen' : 'Termin löschen') : null));
  }

  // ===== Woche =====
  function pickDay(ds) {
    if (state.selA === state.selB && ds !== state.selA) { const a = state.selA; state.selA = a < ds ? a : ds; state.selB = a < ds ? ds : a; }
    else { state.selA = state.selB = ds; }
    render();
  }
  function setWeek(ds) {
    const d = parse(ds);
    state.weekStart = iso(addDays(d, -((d.getDay() + 6) % 7)));
    state.cursor = new Date(parse(state.weekStart).getFullYear(), parse(state.weekStart).getMonth(), 1);
  }
  function viewWoche(main) {
    const ws = parse(state.weekStart), days = [...Array(7)].map((_, i) => iso(addDays(ws, i))), we = days[6];
    const shiftWeek = (n) => { setWeek(iso(addDays(ws, 7 * n))); state.selA = state.selB = iso(addDays(parse(state.weekStart), 0)); render(); };
    main.append(h('div', { class: 'mnav wnav' },
      h('button', { 'aria-label': 'Vorherige Woche', onclick: () => shiftWeek(-1) }, '‹'),
      h('b', {}, 'KW ' + isoWeek(addDays(ws, 3)) + ' · ' + fmtD(days[0]) + ' – ' + fmtD(we) + '' + we.slice(0, 4)),
      h('button', { class: 'todaybtn', onclick: () => { setWeek(iso(today0())); state.selA = state.selB = iso(today0()); render(); } }, 'Heute'),
      h('button', { 'aria-label': 'Nächste Woche', onclick: () => shiftWeek(1) }, '›')));
    let sx = null, sy = null;
    main.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftWeek(dx < 0 ? 1 : -1);
    }, { passive: true });
    const ems = evMap(), ts = iso(today0()), active = state.bookings.filter(isActive);
    const inSel = (ds) => ds >= state.selA && ds <= state.selB;
    const grid = h('div', { class: 'wgrid' });
    grid.append(h('div', { class: 'wh corner' }));
    days.forEach((ds, i) => {
      const evs = ems[ds] || [], kinds = [...new Set(evs.map(evKind))];
      grid.append(h('button', { class: 'wh' + (ds === ts ? ' today' : '') + (inSel(ds) ? ' sel' : ''), onclick: () => pickDay(ds) },
        h('small', {}, DOW[i]), h('b', {}, parse(ds).getDate()),
        h('span', { class: 'gdots' }, kinds.map((k) => h('i', { style: 'background:' + KCOL[k] })))));
    });
    let lastCat = null;
    state.arts.forEach((a) => {
      if (a.kategorie !== lastCat) { grid.append(h('div', { class: 'wcat', style: 'background:' + (CATS[a.kategorie] || '#555') }, a.kategorie)); lastCat = a.kategorie; }
      grid.append(h('div', { class: 'wname' }, a.name));
      days.forEach((ds) => {
        const hits = Avail.hitsFor(active, state.arts, a.name, ds, ds);
        const real = hits.filter((x) => !x.blocker).reduce((t, x) => t + x.anzahl, 0);
        const blk = hits.filter((x) => x.blocker).length;
        const clash = a.menge != null && (real > a.menge || (real > 0 && blk > 0));
        const col = CATS[a.kategorie] || '#555';
        grid.append(h('button', { class: 'wc' + (real > 0 ? ' busy' : '') + (real === 0 && blk > 0 ? ' blk' : '') + (clash ? ' clash' : '') + (inSel(ds) ? ' insel' : ''), style: '--cc:' + col, onclick: () => pickDay(ds) },
          real > 0 && (a.menge == null || a.menge > 1 || real > 1) ? String(real) : ''));
      });
    });
    main.append(grid);
    main.append(h('div', { class: 'tip' }, 'Tipp: Tag antippen, dann einen zweiten Tag für einen Zeitraum. Rote Umrandung = Doppelbuchung.'));

    // Panel
    const s = state.selA, e = state.selB, one = s === e;
    const bs = active.filter((b) => b.start <= e && (b.ende || b.start) >= s).sort(sortByStart);
    const evSeen = {}, evl = [];
    for (let d = parse(s); iso(d) <= e && evl.length < 60; d = addDays(d, 1)) (ems[iso(d)] || []).forEach((ev) => { if (!evSeen[ev.id]) { evSeen[ev.id] = 1; evl.push(ev); } });
    evl.sort(byKind);
    const free = [], part = [];
    state.arts.forEach((a) => {
      const st = Avail.status(active, state.arts, a, s, e);
      if (st.state === 'frei') free.push(a.name);
      else if (st.state === 'teils') part.push(a.name + (st.menge != null ? ' (' + st.frei + '/' + st.menge + ')' : ''));
    });
    const panel = h('div', { class: 'panel' },
      h('h3', {}, one ? fmtFull(s) : wd(s) + ' ' + fmtD(s) + ' – ' + wd(e) + ' ' + fmtD(e)),
      h('div', { class: 'psum' }, (free.length + part.length) + ' Artikel frei · ' + bs.length + ' Vermietung' + (bs.length === 1 ? '' : 'en') + ' · ' + evl.length + ' Termin' + (evl.length === 1 ? '' : 'e')));
    if (bs.length) {
      panel.append(h('div', { class: 'grp grp-mx' }, 'Vermietet'));
      bs.forEach((b) => {
        const nd = Math.round((parse(b.ende || b.start) - parse(b.start)) / 864e5) + 1;
        const tl = [];
        if (b.start >= s && b.start <= e) tl.push('↑ Abholung ' + fmtD(b.start) + ' ' + (b.abholzeit || b.zeit || '–'));
        if ((b.ende || b.start) >= s && (b.ende || b.start) <= e) tl.push('↓ Rückgabe ' + fmtD(b.ende || b.start) + ' ' + (b.rueckzeit || '–'));
        panel.append(h('div', { class: 'evrow ev-mx tap', style: '--pc:' + KCOL.mx, onclick: () => openEdit(b) },
          h('b', {}, b.name || '—'), h('span', { class: 'dayc' }, nd + (nd === 1 ? ' Tag' : ' Tage')),
          h('div', { class: 'art' }, b.artikel || ''), h('div', { class: 'art' }, tl.join(' · '))));
      });
    }
    if (evl.length) {
      panel.append(h('div', { class: 'grp grp-priv' }, 'Termine aus Google Kalender'));
      evl.forEach((ev) => panel.append(evRow(ev)));
    }
    if (state.cal.connected) panel.append(h('button', { class: 'btn sec addev', onclick: () => openGev(null, s) }, '+ Termin im Google Kalender'));
    panel.append(h('div', { class: 'grp grp-free' }, 'Frei'));
    panel.append(h('div', { class: 'fchips' }, free.map((n) => h('span', { class: 'fc' }, n)).concat(part.map((n) => h('span', { class: 'fc part' }, n))), (free.length + part.length) ? null : h('span', { class: 'art' }, 'Nichts frei')));
    main.append(panel);
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
        if (q && (b.name + ' ' + b.artikel + ' ' + b.telefon + ' ' + (b.email || '') + ' ' + b.adresse + ' ' + b.notiz).toLowerCase().indexOf(q) < 0) return false;
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
        fotoPending() ? h('div', { class: 'warnbox' }, '⏳ ' + fotoPending() + ' Zustandsfotos noch nicht in Drive (werden beim Abgleichen hochgeladen).') : null,
        h('button', { class: 'btn sec', onclick: async () => { const n = await cleanFotos(); toast(n ? n + ' Fotos vom Gerät entfernt (liegen in Drive, Vorschau bleibt)' : 'Nichts aufzuräumen'); } }, 'Fotos vom Gerät aufräumen (nur schon hochgeladene)'),
        h('button', { class: 'btn sec', onclick: async () => {
          await saveBooking({ id: 'muster-1211', name: 'Max Mustermann (Muster)', telefon: '0163 0000000', email: 'e-post-mueller@outlook.de', adresse: 'Musterweg 1, 44575 Castrop-Rauxel',
            start: '2026-12-11', ende: '2026-12-11', abholzeit: '10:00', rueckzeit: '21:00', status: 'bestaetigt', preis: 50, anzahlung: 10, kaution: 100, kautionStatus: 'offen',
            notiz: 'MUSTERBUCHUNG zum Üben – danach löschen', erstellt: iso(new Date()), positionen: [{ artikel: 'Hüpfburg Schloss', anzahl: 1 }] });
          state.menu = false; render(); toast('Musterbuchung am 11.12. angelegt');
        } }, 'Musterbuchung 11.12. anlegen (zum Üben)'),
        h('button', { class: 'btn sec', onclick: () => { state.menu = false; render(); openMySig(); } }, getMySig() ? 'Meine Unterschrift ändern / löschen' : 'Meine Unterschrift zeichnen'),
        h('button', { class: 'btn sec', onclick: () => { try { localStorage.setItem('mxHeute', heuteOn() ? '0' : '1'); } catch (e) {} render(); } }, heuteOn() ? 'Heute-Übersicht ausblenden' : 'Heute-Übersicht einblenden'),
        h('button', { class: 'btn', onclick: () => setSchnell(!state.schnell) }, state.schnell ? 'Zurück zur normalen Ansicht' : 'Schnellansicht (iPad) öffnen'),
        (() => { const st = h('div', { class: 'autohint' }); return h('div', {}, shotButton(() => 'allgemein', st), st); })(),
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
      h('p', { class: 'stand' }, 'Alle Daten liegen auch lokal auf diesem Gerät und funktionieren ohne Internet. · App-Version 81')));
  }

  // ===== Bearbeiten (anlegen, ändern, löschen – alles lokal, Abgleich später) =====
  const PLAT_LIST = ['Kleinanzeigen', 'WhatsApp', 'SMS', 'Mail', 'Telefon', 'Sonstige'];
  const toNum = (v) => Number(String(v == null ? '' : v).replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0;
  const nowIso = () => new Date().toISOString();
  const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function markDirty() { state.dirty++; await DB.setMeta('dirty', state.dirty); schedulePush(); }
  // Automatisch abgleichen (Drive + Kalender): Anmeldefenster nur beim Fingertipp, danach läuft es still
  function warmToken() {
    if (!state.drive.id || !state.online || GCAL.isSignedIn()) return;
    state.warm = GCAL.signIn(); state.warm.catch(() => {});
  }
  let pushTimer = null;
  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (!state.drive.id || !state.online || state.drive.busy) return;
      if (GCAL.isSignedIn()) driveSync(true);
      else if (state.warm) state.warm.then(() => driveSync(true)).catch(() => {});
    }, 1500);
  }

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
    warmToken();
    const extra = {};
    if (p.status === 'storniert' && b.status !== 'storniert') extra.statusVorher = b.status;
    await saveBooking(Object.assign({}, b, p, extra));
    render();
  }
  async function removeBooking(b) {
    warmToken();
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
        h('button', { onclick: () => openEdit(b) }, 'Bearbeiten'),
        h('button', { class: 'del', onclick: delClick }, 'Buchung löschen')));
  }

  function openEdit(b) {
    const base = iso(today0());
    const d = b ? JSON.parse(JSON.stringify(b)) : {
      id: null, name: '', telefon: '', email: '', adresse: '', plattform: 'Sonstige',
      start: state.sel || base, ende: state.sel || base, abholzeit: '10:00', rueckzeit: '21:00',
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
  function calcPrice(d) {
    if (!d.start) return null;
    const n = Math.max(1, diffDays(parse(d.ende && d.ende >= d.start ? d.ende : d.start), parse(d.start)) + 1);
    const all = []; PRICES.forEach((g) => g.items.forEach((it) => all.push(it)));
    const byInv = {}; all.forEach((it) => { if (it.inv) byInv[it.inv] = it; });
    const kombi = all.filter((it) => !it.inv)[0];
    const pos = (d.positionen || []).filter((p) => p.artikel && byInv[p.artikel]).map((p) => ({ it: byInv[p.artikel], q: Math.max(1, Number(p.anzahl) || 1) }));
    if (!pos.length) return null;
    let preis = 0, kaut = 0, ok = true;
    const isHuef = (x) => /^Hüpfburg/.test(x.it.inv), isBox = (x) => x.it.inv === 'PartyBox JBL 520';
    const hi = pos.findIndex(isHuef), bi = pos.findIndex(isBox);
    const used = {};
    if (kombi && hi > -1 && bi > -1) {
      used[hi] = used[bi] = 1;
      if (n <= 3) preis += kombi.p[n - 1]; else ok = false;
      kaut += kombi.k;
    }
    pos.forEach((x, i) => {
      const q = used[i] && (i === hi || i === bi) ? x.q - 1 : x.q;
      if (q <= 0) return;
      if (n <= 3) preis += x.it.p[n - 1] * q; else ok = false;
      kaut += x.it.k * q;
    });
    return { n, preis: ok ? preis : null, kaut };
  }
  function autoCalc(force) {
    const e = state.edit; if (!e || !e.preisEl) return;
    const d = e.d, c = calcPrice(d);
    const may = (k) => force || (!e[k + 'Man'] && (!d.id || !toNum(d[k])));
    if (!c) { if (e.hintEl) e.hintEl.textContent = ''; return; }
    if (c.preis != null && may('preis')) { d.preis = c.preis; e.preisEl.value = String(c.preis); }
    if (may('kaution')) { d.kaution = c.kaut; e.kautEl.value = String(c.kaut); if (c.kaut > 0 && d.kautionStatus === 'keine') { d.kautionStatus = 'offen'; if (e.kstEl) e.kstEl.value = 'offen'; } }
    if (e.hintEl) e.hintEl.textContent = c.preis == null ? c.n + ' Tage: Preis auf Anfrage, bitte von Hand eintragen. Kaution ' + c.kaut + ' € automatisch.' : 'Automatisch nach Preisliste: ' + c.n + (c.n === 1 ? ' Tag' : ' Tage') + ' = ' + c.preis + ' €, Kaution ' + c.kaut + ' €. Du kannst die Felder überschreiben.';
  }
  function paintWarn() {
    const e = state.edit;
    if (!e || !e.warnEl) return;
    autoCalc(false);
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
    warmToken();
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
      id: d.id || newId(), name: String(d.name).trim(), telefon: String(d.telefon).trim(), email: String(d.email || '').trim(), adresse: String(d.adresse || '').trim(),
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

  // ===== Screenshots hochladen (landen im Drive, Claude liest sie dort) =====
  async function shrinkImg(f) {
    try {
      if (!f.type || f.type.indexOf('image/') !== 0 || typeof createImageBitmap !== 'function') return f;
      const bmp = await createImageBitmap(f), sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const bl = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
      return bl || f;
    } catch (e) { return f; }
  }
  const slug = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'ohne-name';
  function shotButton(getTag, statusEl) {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: '', style: 'display:none' });
    inp.addEventListener('change', async () => {
      const fl = [...inp.files]; inp.value = '';
      if (!fl.length) return;
      if (!navigator.onLine) { statusEl.textContent = '⚠ Zum Hochladen online sein.'; return; }
      if (!GCAL.isSignedIn()) { try { await GCAL.signIn(); } catch (e) { statusEl.textContent = '⚠ Bitte zuerst im ⋯-Menü mit Google verbinden, dann nochmal.'; return; } }
      let okn = 0;
      for (let i = 0; i < fl.length; i++) {
        statusEl.textContent = 'Lade hoch ' + (i + 1) + ' von ' + fl.length + ' …';
        try {
          const bl = await shrinkImg(fl[i]), t = new Date(), ts = iso(t).replace(/-/g, '') + '-' + pad(t.getHours()) + pad(t.getMinutes()) + pad(t.getSeconds());
          await GDRIVE.uploadImage(bl, 'mietxpress-screenshot-' + getTag() + '-' + ts + '-' + (i + 1) + '.jpg');
          okn++;
        } catch (e) { statusEl.textContent = '⚠ ' + (e.message || 'Upload fehlgeschlagen'); return; }
      }
      statusEl.textContent = '✓ ' + okn + (okn === 1 ? ' Bild' : ' Bilder') + ' hochgeladen. Schreib Claude: „Screenshot da“.';
    });
    return h('div', {}, h('button', { class: 'btn sec', type: 'button', onclick: () => inp.click() }, '📷 Screenshot hochladen'), inp);
  }

  const iso8 = (x) => String(x || '').replace(/-/g, '') || 'ohne-datum';
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
        fld('E-Mail', txt('email', { type: 'email', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off' })),
        fld('Adresse', txt('adresse')),
        fld('Quelle', sel('plattform', plats.map((x) => [x, x]))),
        (() => { const st = h('div', { class: 'autohint' }); return h('div', {}, shotButton(() => iso8(d.start) + '-' + slug(d.name), st), st); })()),
      h('div', { class: 'box' },
        h('div', { class: 'chips qd dchips' }, [1, 2, 3].map((n) => {
          const cur = d.start && d.ende ? diffDays(parse(d.ende), parse(d.start)) + 1 : 0, on = cur === n;
          return h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: () => {
            if (!d.start) d.start = iso(today0());
            d.ende = iso(addDays(parse(d.start), n - 1)); paintEdit();
          } }, (on ? '✓ ' : '') + n + (n === 1 ? ' Tag' : ' Tage'));
        })),
        h('div', { class: 'pdates' }, fld('Abholung (Datum)', date('start')), fld('Rückgabe (Datum)', date('ende'))),
        h('div', { class: 'pdates' }, fld('Abholzeit', time('abholzeit')), fld('Rückgabezeit', time('rueckzeit')))),
      h('div', { class: 'box' },
        h('div', { class: 'ct' }, 'Artikel'),
        prow,
        h('button', { class: 'btn sec', onclick: () => { d.positionen.push({ artikel: '', anzahl: 1 }); paintEdit(); } }, '+ Artikel hinzufügen'),
        warnEl),
      h('div', { class: 'box' },
        h('div', { class: 'pdates' }, fld('Preis (€)', (e.preisEl = txt('preis', { inputmode: 'decimal', oninput: (ev) => { d.preis = ev.target.value; e.preisMan = true; const c = calcPrice(d); if (e.hintEl && c && c.preis != null) e.hintEl.textContent = toNum(d.preis) !== c.preis ? '⚠ Weicht von der Preisliste ab (Liste: ' + c.preis + ' €).' : 'Entspricht der Preisliste.'; } }))), fld('Anzahlung (€)', txt('anzahlung', { inputmode: 'decimal' }))),
        h('div', { class: 'pdates' }, fld('Kaution (€)', (e.kautEl = txt('kaution', { inputmode: 'decimal', oninput: (ev) => { d.kaution = ev.target.value; e.kautionMan = true; } }))),
          fld('Kaution-Status', (e.kstEl = sel('kautionStatus', [['keine', 'Keine'], ['offen', 'Offen'], ['erhalten', 'Erhalten'], ['zurueck', 'Zurückgegeben']])))),
        h('div', { class: 'autohint' }, (e.hintEl = h('span', {})), ' ', h('button', { class: 'btn sec sm', onclick: () => { e.preisMan = e.kautionMan = false; autoCalc(true); } }, 'Neu berechnen')),
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
      row('Mietgegenstand', artLine(b) || '–'),
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
      b.email ? row('E-Mail', b.email) : null,
      b.adresse ? row('Adresse', b.adresse) : null,
      b.notiz ? row('Notiz', b.notiz) : null);
    const setSt = (st) => async () => { await patchBooking(b, { status: st, statusVorher: b.status }); };
    const FOTOS_PLATZ = h('div', { class: 'fotoslot' }, fotoSection(b));
    const acts = h('div', { class: 'ovacts' },
      h('button', { class: 'cb sign full bigsign', onclick: () => openSign(b) }, '✍ Digital unterschreiben'),
      h('button', { class: 'cb mv full', onclick: (ev) => makeContract(b, ev.currentTarget) }, 'Mietvertrag erstellen (PDF)'),
      FOTOS_PLATZ,
      b.status !== 'abgeholt' && b.status !== 'zurueck' && b.status !== 'storniert' ? h('button', { class: 'cb abh', onclick: setSt('abgeholt') }, 'Als abgeholt markieren') : null,
      b.status === 'abgeholt' ? h('button', { class: 'cb undo', onclick: () => patchBooking(b, { status: (b.statusVorher && b.statusVorher !== 'abgeholt' && b.statusVorher !== 'zurueck') ? b.statusVorher : 'bestaetigt' }) }, 'Rückgängig: nicht abgeholt') : null,
      b.status !== 'zurueck' && b.status !== 'storniert' ? h('button', { class: 'cb ret', onclick: setSt('zurueck') }, 'Als zurückgebracht markieren') : null,
      b.status === 'zurueck' ? h('button', { class: 'cb undo', onclick: () => patchBooking(b, { status: 'abgeholt', statusVorher: 'bestaetigt' }) }, 'Rückgängig: nicht zurück') : null,
      b.status === 'abgeholt' ? h('span', { class: 'chip st-abgeholt', style: 'align-self:center' }, 'Abgeholt ✓') : null,
      b.status === 'zurueck' ? h('span', { class: 'chip st-zurueck', style: 'align-self:center' }, 'Zurück ✓') : null,
      rechBtn(b),
      sm ? null : h('button', { class: 'cb sperr', onclick: () => { state.pickup = null; openSperr({ name: b.name || '', telefon: b.telefon || '' }); } }, '🚫 Kunde sperren'));
    return h('div', { class: 'ov', id: 'pickupov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Abholung'), h('button', { class: 'btn sec', onclick: closePickup }, 'Schließen')),
      sm ? h('div', { class: 'warnbox err2' }, '🚫 Gesperrter Kunde' + (sm.grund ? ' – ' + sm.grund : '')) : null,
      slip, due, acts, h('div', { style: 'height:10px' }), info));
  }

  // --- Mietvertrag (PDF-Vorlage im Browser ausfüllen, funktioniert offline) ---
  const BOXROWS = [461.7, 493.1, 524.6, 556.0, 587.5, 618.9, 650.4, 681.8, 722.5, 753.9];
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
  async function buildContract(b, positions, sig) {
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
    T(p1, 142, 357.8, b.email);
    T(p1, 47, 419.8, fmtDE(b.start));
    T(p1, 166, 419.8, fmtDE(b.ende));
    T(p1, 286, 419.8, uhr, 9);
    T(p1, 401, 419.8, 'Selbstabholung', 9);
    positions.forEach((pos) => {
      const m = BOXMAP[pos.artikel]; if (!m) return;
      const n = Number(pos.anzahl) || 1, cx = BOXCOLX[m[0]] + 6.8, cy = BOXROWS[m[1]] + 5.3, sz = 4.2;
      p1.drawLine({ start: { x: cx - sz, y: H - (cy - sz) }, end: { x: cx + sz, y: H - (cy + sz) }, thickness: 1.6, color: ink });
      p1.drawLine({ start: { x: cx - sz, y: H - (cy + sz) }, end: { x: cx + sz, y: H - (cy - sz) }, thickness: 1.6, color: ink });
      if (pos.artikel === 'Stehtisch') T(p1, 343, 611.2, n, 9);
      if (pos.artikel === 'Speisewärmer Eat') T(p1, 343, 548.2, n, 9);
      if (pos.artikel === 'Bierzeltgarnitur') { T(p1, 369, 642.6, n, 9); T(p1, 442, 642.6, n * 2, 9); }
    });
    // Zusätzliche Leistungen / Pakete (Tabelle Seite 2, Zeilen ab 160 pt, Höhe 23,6 pt)
    const exRe = /\+\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß ]*?Paket(?:\s*\d+)?|Extra:\s*[^()€+\n]*?)\s*(?:\(([^)]*)\))?\s*(\d+(?:[.,]\d+)?)\s*€/g;
    let xm, xi = 0, exSum = 0; const ntxt = String(b.notiz || '');
    while ((xm = exRe.exec(ntxt)) && xi < 3) {
      const exVal = Number(xm[3].replace(',', '.')); exSum += exVal;
      const price = deMoney(exVal);
      const top = 160 + xi * 23.6 + 15.5;
      T(p2, 50, top, xm[1].replace(/^Extra:\s*/, '').trim() + (xm[2] ? ' (' + xm[2].trim() + ')' : ''), 9);
      T(p2, 392, top, '1', 9);
      T(p2, 522 - font.widthOfTextAtSize(price, 9), top, price, 9);
      xi++;
    }
    T(p2, 47, 116.5, deMoney(Math.max(0, (Number(b.preis) || 0) - exSum))); // Mietgebühr ohne die separat aufgeführten Zusatzpakete
    T(p2, 171, 116.5, deMoney(b.kaution));
    T(p2, 286, 116.5, deMoney(0));
    T(p2, 406, 116.5, deMoney(b.anzahlung));
    const od = 'C-R, ' + fmtDE(b.start);
    T(p2, 47, 600.0, od);
    T(p2, 299, 600.0, od);
    // Unterschriften (optional): über der Linie, rechts neben "C-R, Datum"
    const putSig = async (dataUrl, x0, w) => {
      if (!dataUrl) return;
      const img = await doc.embedPng(dataUrl);
      const maxH = 38, sc = Math.min(w / img.width, maxH / img.height), iw = img.width * sc, ih = img.height * sc;
      p2.drawImage(img, { x: x0, y: H - 598 + 1, width: iw, height: ih });
    };
    if (sig) { await putSig(sig.mieter, 128, 144); await putSig(sig.vermieter, 376, 149); }
    if (b.fotosPdf) { try { await appendPhotoPages(PL, doc, font, b); } catch (e) { console.error(e); } }
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

  // ===== Digital unterschreiben (iPad) =====
  const SIGKEY = 'mxSigV';
  const getMySig = () => { try { return localStorage.getItem(SIGKEY) || ''; } catch (e) { return ''; } };
  const toB64 = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  const fromB64 = (b64) => { const t = atob(b64), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };

  // Zeichenfläche für den Finger. Gibt { el, isEmpty, clear, setImage, toPng } zurück.
  function sigPad(height) {
    const cv = h('canvas', { class: 'sigcv' }), box = h('div', { class: 'sigbox', style: 'height:' + (height || 200) + 'px' }, cv);
    let ctx = null, drawing = false, dirty = false, last = null, dpr = 2;
    const fit = () => {
      const r = box.getBoundingClientRect(); if (!r.width) return;
      dpr = Math.max(2, window.devicePixelRatio || 2);
      if (cv.width === Math.round(r.width * dpr)) return;
      const keep = dirty ? cv.toDataURL() : null;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx = cv.getContext && cv.getContext('2d');
      if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213d'; ctx.lineWidth = 3.6 * dpr; }
      if (keep) { const im = new Image(); im.onload = () => ctx && ctx.drawImage(im, 0, 0, cv.width, cv.height); im.src = keep; }
    };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / (r.width || 1)), y: (e.clientY - r.top) * (cv.height / (r.height || 1)) }; };
    const down = (e) => { fit(); if (!ctx) { dirty = true; box.classList.add('has'); return; } e.preventDefault(); drawing = true; last = pt(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      ctx.beginPath(); ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, 6.3); ctx.fillStyle = '#14213d'; ctx.fill(); dirty = true; box.classList.add('has'); };
    const move = (e) => { if (!drawing || !ctx) return; e.preventDefault(); const p = pt(e), m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.quadraticCurveTo(last.x, last.y, m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; };
    const up = () => { drawing = false; };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', up);
    cv.style.touchAction = 'none';
    setTimeout(fit, 0); window.addEventListener('resize', fit);
    const api = {
      el: box,
      fit,
      isEmpty: () => !dirty,
      clear: () => { fit(); if (ctx) ctx.clearRect(0, 0, cv.width, cv.height); dirty = false; box.classList.remove('has'); },
      setImage: (url) => { fit(); api.clear(); if (!url) return; dirty = true; box.classList.add('has'); const im = new Image(); im.onload = () => { fit(); if (ctx) { const sc = Math.min(cv.width / im.width, cv.height / im.height) * 0.9, w = im.width * sc, hh = im.height * sc; ctx.drawImage(im, (cv.width - w) / 2, (cv.height - hh) / 2, w, hh); } }; im.src = url; },
      toPng: () => {
        if (!dirty) return null;
        try {
          if (!ctx) return cv.toDataURL('image/png');
          const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
          for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) { if (d[(y * cv.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          if (x1 <= x0 || y1 <= y0) return null;
          const pad = 6 * dpr, sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad), sw = Math.min(cv.width - sx, x1 - x0 + 2 * pad), sh = Math.min(cv.height - sy, y1 - y0 + 2 * pad);
          const out = document.createElement('canvas'); out.width = sw; out.height = sh; out.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
          return out.toDataURL('image/png');
        } catch (e) { return cv.toDataURL('image/png'); }
      }
    };
    return api;
  }

  // Eigene Unterschrift einmal zeichnen (nur auf diesem Gerät, nicht im Drive)
  function openMySig() {
    const old = document.getElementById('mysigov'); if (old) old.remove();
    const pad = sigPad(220), cur = getMySig();
    const close = () => { const o = document.getElementById('mysigov'); if (o) o.remove(); };
    const note = h('div', { class: 'tnone' }, 'Zeichne deine Unterschrift mit dem Finger. Sie wird nur auf diesem Gerät gespeichert, nicht im Drive.');
    const ov = h('div', { class: 'ov signov', id: 'mysigov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Meine Unterschrift'), h('button', { class: 'btn sec', onclick: close }, 'Abbrechen')),
      note, pad.el,
      h('div', { class: 'stack' },
        h('button', { class: 'btn sec', onclick: () => pad.clear() }, 'Löschen'),
        h('button', { class: 'btn', onclick: () => {
          const u = pad.toPng(); if (!u) { note.textContent = 'Bitte zuerst unterschreiben.'; return; }
          try { localStorage.setItem(SIGKEY, u); } catch (e) { note.textContent = 'Speichern auf diesem Gerät nicht möglich.'; return; }
          close(); toast('Unterschrift gespeichert'); render();
        } }, 'Speichern'),
        cur ? h('button', { class: 'btn sec', onclick: () => { try { localStorage.removeItem(SIGKEY); } catch (e) {} close(); toast('Unterschrift gelöscht'); render(); } }, 'Gespeicherte Unterschrift löschen') : null)));
    document.body.append(ov);
    if (cur) setTimeout(() => pad.setImage(cur), 30);
  }

  // PDF-Seiten als Bilder anzeigen (pdf.js wird erst bei Bedarf geladen)
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const sc = document.createElement('script'); sc.src = 'pdf.min.js';
      sc.onload = () => { if (!window.pdfjsLib) return reject(new Error('pdfjs')); window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
      sc.onerror = () => reject(new Error('pdfjs')); document.head.append(sc);
    });
  }
  async function renderPages(bytes, into, onlyPage) {
    into.replaceChildren();
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
      const w = Math.max(300, Math.min(into.clientWidth || 700, 1600)), dpr = Math.max(2, window.devicePixelRatio || 2);
      for (let i = 1; i <= doc.numPages; i++) {
        if (onlyPage && i !== onlyPage) continue;
        const pg = await doc.getPage(i), vp0 = pg.getViewport({ scale: 1 }), sc = (w * dpr) / vp0.width, vp = pg.getViewport({ scale: sc });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = 'spage';
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; into.append(c);
      }
    } catch (e) { into.replaceChildren(h('div', { class: 'tnone' }, 'Vorschau nicht verfügbar (einmal online öffnen). Der Vertrag wird trotzdem korrekt erstellt.')); }
  }

  // Ordner "Mietverträge/<Jahr>" im Drive, PDF hochladen; offline wird es gemerkt
  async function queueContract(name, year, bytes, folder) {
    const q = (await DB.getMeta('pdfQueue')) || [];
    q.push({ name, year, folder: folder || '', b64: toB64(bytes), at: nowIso() });
    await DB.setMeta('pdfQueue', q);
  }
  async function flushContracts() {
    const q = (await DB.getMeta('pdfQueue')) || [];
    if (!q.length || !navigator.onLine || !GCAL.isSignedIn()) return 0;
    let done = 0; const rest = [];
    for (const it of q) {
      try {
        const root = await GDRIVE.ensureFolder('Mietverträge', 'root'); let par = await GDRIVE.ensureFolder(String(it.year), root);
        if (it.folder) par = await GDRIVE.ensureFolder(it.folder, par);
        await GDRIVE.uploadPdf(new Blob([fromB64(it.b64)], { type: 'application/pdf' }), it.name, par); done++;
      } catch (e) { rest.push(it); }
    }
    await DB.setMeta('pdfQueue', rest);
    return done;
  }

  function printPdf(bytes) {
    try {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
      f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, '_blank'); } };
      f.src = url; document.body.append(f); setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120000);
    } catch (e) { toast('Drucken nicht möglich – bitte über Teilen drucken'); }
  }

  async function openSign(b0) {
    let b = b0;
    const old = document.getElementById('signov'); if (old) old.remove();
    const pos = Avail.positionsOf(b, state.arts);
    if (!pos.length) { toast('Keine Artikel zugeordnet'); return; }
    const mine = getMySig(), pM = sigPad(210), pV = sigPad(210);
    let useMine = !!mine;
    const pages = h('div', { class: 'spages' }, h('div', { class: 'tnone' }, 'Lade Vertrag …'));
    const status = h('div', { class: 'tnone' });
    const close = () => { const o = document.getElementById('signov'); if (o) o.remove(); };
    const mineRow = mine ? h('label', { class: 'calrow' }, h('input', { type: 'checkbox', checked: '', onchange: (e) => { useMine = e.target.checked; if (useMine) pV.setImage(mine); else pV.clear(); } }), h('span', {}, 'Meine Unterschrift einsetzen')) : h('div', { class: 'tnone' }, 'Keine eigene Unterschrift gespeichert (⋯-Menü → Meine Unterschrift). Du kannst hier auch direkt unterschreiben.');
    const payView = (bk) => {
      const offen = Math.max(0, (Number(bk.preis) || 0) - (Number(bk.anzahlung) || 0));
      const kOff = (bk.kaution > 0 && bk.kautionStatus === 'offen') ? bk.kaution : 0, total = offen + kOff;
      const row = (l, v, cls) => h('div', { class: 'r' + (cls ? ' ' + cls : '') }, h('span', {}, l), h('b', {}, v));
      return h('div', {},
        h('div', { class: 'slip' },
          row('Mietgegenstand', artLine(bk) || '–'),
          row('Mietpreis gesamt', eur(bk.preis)),
          row('Schon bezahlt', eur(bk.anzahlung)),
          row('Noch zu zahlen', offen > 0 ? eur(offen) : '0 € ✓'),
          row('Kaution', bk.kaution > 0 ? eur(bk.kaution) + (bk.kautionStatus === 'erhalten' ? ' ✓ erhalten' : '') : 'keine')),
        total > 0
          ? h('div', { class: 'pay' }, h('span', {}, h('small', {}, 'Jetzt kassieren (bar)'), h('br'), h('small', {}, [offen > 0 ? 'Rest ' + eur(offen) : null, kOff > 0 ? 'Kaution ' + eur(kOff) : null].filter(Boolean).join(' + '))), h('b', {}, eur(total)))
          : h('div', { class: 'pay ok' }, h('span', {}, 'Alles bezahlt ✓')));
    };
    const payBox = h('div', {}, payView(b));
    const exName = h('input', { type: 'text', placeholder: 'Was? z. B. Nebelflüssigkeit', maxlength: '40' });
    const exPrice = h('input', { type: 'text', inputmode: 'decimal', placeholder: '€' });
    const exMsg = h('div', { class: 'tnone' });
    const addExtra = async () => {
      const nm = exName.value.replace(/[()€+\n]/g, ' ').replace(/\s+/g, ' ').trim(), pr = Number(String(exPrice.value).replace(',', '.'));
      if (!nm || !(pr > 0)) { exMsg.textContent = 'Bitte Bezeichnung und Preis eintragen.'; return; }
      const cnt = (String(b.notiz || '').match(/\+\s*(?:[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß ]*?Paket(?:\s*\d+)?|Extra:)/g) || []).length;
      if (cnt >= 3) { exMsg.textContent = 'Im Vertrag ist Platz für 3 Zusatzzeilen.'; return; }
      const notiz = (b.notiz ? String(b.notiz).replace(/\s+$/, '') + '\n' : '') + '+ Extra: ' + nm + ' ' + String(pr).replace('.', ',') + ' €';
      const p = { preis: Math.round(((Number(b.preis) || 0) + pr) * 100) / 100, notiz };
      try { await patchBooking(b, p); } catch (e) { exMsg.textContent = 'Konnte nicht gespeichert werden.'; return; }
      b = Object.assign({}, b, p); exName.value = ''; exPrice.value = '';
      exMsg.textContent = '✓ ' + nm + ' ' + eur(pr) + ' dazugebucht. Vertrag unten ist aktualisiert.';
      refreshAll();
    };
    const exList = h('div', {});
    const refreshAll = async () => {
      payBox.replaceChildren(payView(b)); paintExtras();
      try { const base = await buildContract(b, pos, null); await renderPages(base, pages); } catch (e) { /* Vorschau egal */ }
    };
    const paintExtras = () => {
      const re = /\+\s*Extra:\s*([^()€+\n]*?)\s*(\d+(?:[.,]\d+)?)\s*€/g, rows = []; let m;
      while ((m = re.exec(String(b.notiz || '')))) {
        const full = m[0], val = Number(m[2].replace(',', '.')), nm = m[1].trim();
        rows.push(h('div', { class: 'exrow' }, h('span', {}, nm + ' · ' + eur(val)),
          h('button', { class: 'btn sec sm', onclick: async () => {
            const notiz = String(b.notiz || '').replace(full, '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/^\s+|\s+$/g, '');
            const p = { preis: Math.max(0, Math.round(((Number(b.preis) || 0) - val) * 100) / 100), notiz };
            try { await patchBooking(b, p); } catch (e) { exMsg.textContent = 'Konnte nicht gespeichert werden.'; return; }
            b = Object.assign({}, b, p); exMsg.textContent = '✓ ' + nm + ' entfernt.'; refreshAll();
          } }, '✕ Entfernen')));
      }
      exList.replaceChildren(...rows);
    };
    paintExtras();
    const extraBox = h('div', { class: 'sgroup' }, h('div', { class: 'slabel' }, 'Spontan etwas dazu? (vor der Unterschrift)'),
      exList, h('div', { class: 'row2' }, exName, exPrice), h('button', { class: 'btn sec sm', onclick: addExtra }, '＋ Dazubuchen'), exMsg);
    const doneBtn = h('button', { class: 'btn', onclick: async (ev) => {
      if (pM.isEmpty()) { status.textContent = 'Bitte zuerst den Mieter unterschreiben lassen.'; return; }
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Erstelle …';
      try { await finish(); } catch (e) { console.error(e); status.textContent = 'Fehler beim Erstellen des Vertrags.'; btn.disabled = false; btn.textContent = 'Fertig'; }
    } }, 'Fertig');
    const finish = async () => {
      const sig = { mieter: pM.toPng(), vermieter: pV.isEmpty() ? null : pV.toPng() };
      const bytes = await buildContract(b, pos, sig);
      const name = contractFilename(b).replace(/\.pdf$/, '') + '_unterschrieben.pdf', year = parse(b.start).getFullYear();
      let drive = 'wartet';
      try {
        if (navigator.onLine && GCAL.isSignedIn()) {
          const root = await GDRIVE.ensureFolder('Mietverträge', 'root'), yr = await GDRIVE.ensureFolder(String(year), root), bf = await GDRIVE.ensureFolder(fotoFolderName(b), yr);
          await GDRIVE.uploadPdf(new Blob([bytes], { type: 'application/pdf' }), name, bf); drive = 'ok';
        } else await queueContract(name, year, bytes, fotoFolderName(b));
      } catch (e) { try { await queueContract(name, year, bytes, fotoFolderName(b)); } catch (x) { drive = 'fehler'; } }
      try { const upd = { vertrag: 'unterschrieben', vertragAt: nowIso() }; if (b.status === 'bestaetigt' || b.status === 'angefragt') { upd.status = 'abgeholt'; upd.statusVorher = b.status; } await patchBooking(b, upd); b = Object.assign({}, b, upd); } catch (e) { /* Vertrag trotzdem gültig */ }
      const res = document.getElementById('signov'); if (!res) return;
      const pv = h('div', { class: 'spages' });
      res.replaceChildren(h('div', { class: 'ovin' },
        h('div', { class: 'ovtop' }, h('h2', {}, 'Vertrag unterschrieben ✓'), h('button', { class: 'btn sec', onclick: close }, 'Schließen')),
        h('div', { class: 'warnbox okbox' }, drive === 'ok' ? '✓ In Drive abgelegt: Mietverträge/' + year + '/' + fotoFolderName(b) + '/' + name : drive === 'wartet' ? 'Kein Netz oder nicht bei Google angemeldet: Der Vertrag ist auf diesem Gerät gemerkt und wird beim nächsten Abgleich hochgeladen.' : '⚠ Ablage im Drive nicht möglich. Bitte jetzt teilen und speichern.'),
        payView(b),
        h('div', { class: 'stack' },
          b.email ? h('button', { class: 'btn mail', onclick: async () => {
            try { if (navigator.clipboard) await navigator.clipboard.writeText(b.email); } catch (e) { /* egal */ }
            toast('Adresse kopiert – im Feld „An“ einfügen. Betreff: ' + MAILSUBJ);
            const file = new File([bytes], name, { type: 'application/pdf' });
            const text = 'Guten Tag' + (b.name ? ' ' + b.name : '') + ',\n\nanbei erhalten Sie Ihren unterschriebenen Mietvertrag für den ' + fmtDE(b.start) + (b.ende !== b.start ? ' – ' + fmtDE(b.ende) : '') + '.\n\nVielen Dank für Ihre Buchung!\n\nFreundliche Grüße\n\nMiet- & Eventservice\nThorsten Müller\n📞 0163 3865144\n✉️ info@muellers-mietxpress.de\n🌐 www.muellers-mietxpress.de';
            if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: MAILSUBJ, text }); } catch (e) { /* abgebrochen */ } }
            else await deliverPdf(bytes, name);
          } }, '📧 Per E-Mail senden an ' + b.email) : null,
          b.email ? h('button', { class: 'btn sec', onclick: async () => { try { await navigator.clipboard.writeText(MAILSUBJ); toast('Betreff kopiert – im Feld „Betreff“ einfügen'); } catch (e) { toast('Betreff: ' + MAILSUBJ); } } }, 'Betreff kopieren') : null,
          h('button', { class: b.email ? 'btn sec' : 'btn', onclick: async () => { const r = await deliverPdf(bytes, name); if (r === 'download') toast('PDF gespeichert'); } }, 'Teilen / Drucken (AirDrop, Nachrichten)'),
          h('button', { class: 'btn sec', onclick: close }, 'Fertig, ohne Kopie')),
        h('div', { class: 'tnone' }, 'Tipp: Fragt der Kunde nach einer Kopie, per E-Mail senden oder im Teilen-Menü AirDrop, Nachrichten oder Drucken wählen.'),
        pv));
      renderPages(bytes, pv, 2);
    };
    const ov = h('div', { class: 'ov signov', id: 'signov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Mietvertrag unterschreiben'), h('button', { class: 'btn sec', onclick: close }, 'Abbrechen')),
      h('div', { class: 'tnone' }, (b.name || '') + ' · ' + fmtShort(b.start) + (b.ende !== b.start ? ' – ' + fmtShort(b.ende) : '') + '. Bitte Vertrag lesen, dann unten unterschreiben.'),
      pages,
      extraBox, payBox,
      (b.fotos || []).some((f) => f.ph === 'ab') ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.fotosPdf ? '' : null, onchange: async (ev) => {
        const p = { fotosPdf: ev.target.checked }; try { await patchBooking(b, p); } catch (e) { /* egal */ } b = Object.assign({}, b, p);
        try { const base = await buildContract(b, pos, null); await renderPages(base, pages); } catch (e) { /* Vorschau egal */ }
      } }), h('span', {}, 'Fotos ins PDF (Abholungsfotos als Anhang)')) : null,
      h('div', { class: 'sgroup' }, h('div', { class: 'slabel' }, 'Unterschrift Mieter'), pM.el, h('button', { class: 'btn sec sm', onclick: () => pM.clear() }, 'Löschen')),
      h('div', { class: 'sgroup' }, h('div', { class: 'slabel' }, 'Unterschrift Vermieter'), mineRow, pV.el, h('button', { class: 'btn sec sm', onclick: () => { pV.clear(); useMine = false; const c = ov.querySelector('.calrow input'); if (c) c.checked = false; } }, 'Löschen')),
      status, h('div', { class: 'stack' }, doneBtn)));
    document.body.append(ov);
    if (mine) setTimeout(() => pV.setImage(mine), 40);
    try { const base = await buildContract(b, pos, null); await renderPages(base, pages); } catch (e) { pages.replaceChildren(h('div', { class: 'tnone' }, 'Vertrag konnte nicht angezeigt werden.')); }
  }

  const MAILSUBJ = 'Ihr Mietvertrag – Müllers MietXpress';

  // --- Zustandsfotos (Abholung / Rückgabe) ---
  const fotoOn = (a) => !!a && (a.foto == null ? true : !!a.foto);
  const fotoArts = (b) => Avail.positionsOf(b, state.arts).map((p) => p.artikel).filter((n, i, arr) => arr.indexOf(n) === i)
    .filter((n) => fotoOn(state.arts.find((a) => a.name === n)));
  const THC = {};
  const phName = (ph) => ph === 'ab' ? 'Abholung' : 'Rückgabe';
  const SLOTS = [['ges', 'Gesamtansicht'], ['zub', 'Zubehör'], ['zust', 'Zustand']];
  const slotName = (k) => { const x = SLOTS.find((q) => q[0] === k); return x ? x[1] : ''; };
  const stampOf = (ts) => { const d = new Date(ts); return fmtDE(iso(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const blobBytes = (bl) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(new Uint8Array(fr.result)); fr.onerror = rej; fr.readAsArrayBuffer(bl); });
  const fotoPending = () => state.bookings.reduce((n, b) => n + (b.fotos || []).filter((f) => !f.drive).length, 0);

  // Foto verkleinern (lange Kante 1600 px), Datum/Uhrzeit/Artikel einstempeln, kleine Vorschau erzeugen
  async function procPhoto(file, label) {
    let bmp;
    if (typeof createImageBitmap === 'function') bmp = await createImageBitmap(file);
    else bmp = await new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => res(im); im.onerror = rej; im.src = u; });
    const W = bmp.width || bmp.naturalWidth, Hh = bmp.height || bmp.naturalHeight, sc = Math.min(1, 1600 / Math.max(W, Hh));
    const cv = document.createElement('canvas'); cv.width = Math.round(W * sc); cv.height = Math.round(Hh * sc);
    const cx = cv.getContext('2d');
    if (cx) {
      cx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const fs = Math.max(14, Math.round(cv.width / 42)); cx.font = '600 ' + fs + 'px sans-serif';
      const tw = Math.min(cv.width, cx.measureText(label).width + fs);
      cx.fillStyle = 'rgba(0,0,0,0.62)'; cx.fillRect(0, cv.height - fs * 1.9, tw, fs * 1.9);
      cx.fillStyle = '#fff'; cx.textBaseline = 'middle'; cx.fillText(label, fs / 2, cv.height - fs * 0.95);
    }
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.72));
    const tc = document.createElement('canvas'), ts2 = Math.min(1, 240 / Math.max(cv.width, cv.height));
    tc.width = Math.max(1, Math.round(cv.width * ts2)); tc.height = Math.max(1, Math.round(cv.height * ts2));
    const tx = tc.getContext('2d'); if (tx) tx.drawImage(cv, 0, 0, tc.width, tc.height);
    return { blob, th: tc.toDataURL('image/jpeg', 0.6) };
  }
  async function addPhotos(b, art, ph, files, slot) {
    for (const f of files) {
      const ts = nowIso();
      const p = await procPhoto(f, stampOf(ts) + ' · ' + art + ' · ' + phName(ph) + (slot ? ' · ' + slotName(slot) : ''));
      if (!p.blob) throw new Error('foto');
      const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await DB.setMeta('foto:' + id, { b64: toB64(await blobBytes(p.blob)) });
      await DB.setMeta('fth:' + id, p.th); THC[id] = p.th;
      const cur = state.bookings.find((x) => x.id === b.id) || b;
      await patchBooking(cur, { fotos: (cur.fotos || []).concat([{ id, art, ph, slot: slot || '', ts, drive: '' }]) });
    }
    flushFotos().catch(() => {});
  }
  const fotoFolderName = (b) => {
    const last = splitName(b.name).split(',')[0].replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, '') || 'Kunde', d = parse(b.start);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + last;
  };
  const fotoFileName = (f) => {
    const d = new Date(f.ts);
    return String(f.art).replace(/[\/\\:*?"<>|]+/g, '-') + '_' + phName(f.ph) + (f.slot ? '_' + slotName(f.slot) : '') + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '_' + String(f.id).slice(-3) + '.jpg';
  };
  let fotoBusy = false;
  async function flushFotos() {
    if (fotoBusy || !navigator.onLine || !GCAL.isSignedIn()) return 0;
    fotoBusy = true; let n = 0; const fc = {};
    try {
      for (const b0 of state.bookings.slice()) {
        for (const f of (b0.fotos || [])) {
          if (f.drive) continue;
          const rec = await DB.getMeta('foto:' + f.id); if (!rec) continue;
          try {
            const key = b0.id;
            if (!fc[key]) {
              const root = await GDRIVE.ensureFolder('Mietverträge', 'root'), yr = await GDRIVE.ensureFolder(String(parse(b0.start).getFullYear()), root);
              fc[key] = await GDRIVE.ensureFolder('Zustandsfotos', await GDRIVE.ensureFolder(fotoFolderName(b0), yr));
            }
            const id = await GDRIVE.uploadFile(new Blob([fromB64(rec.b64)], { type: 'image/jpeg' }), fotoFileName(f), fc[key], 'image/jpeg');
            const cur = state.bookings.find((x) => x.id === b0.id);
            if (cur) await patchBooking(cur, { fotos: (cur.fotos || []).map((x) => x.id === f.id ? Object.assign({}, x, { drive: id }) : x) });
            n++;
          } catch (e) { /* beim nächsten Netz nochmal */ }
        }
      }
    } finally { fotoBusy = false; }
    return n;
  }
  // Vom Gerät entfernen: nur schon hochgeladene Originale (Vorschaubilder bleiben)
  async function cleanFotos() {
    let n = 0;
    for (const b of state.bookings) for (const f of (b.fotos || [])) {
      if (!f.drive) continue;
      if (await DB.getMeta('foto:' + f.id)) { await DB.delMeta('foto:' + f.id); n++; }
    }
    return n;
  }
  async function appendPhotoPages(PL, doc, font, b) {
    const items = [];
    for (const f of (b.fotos || []).filter((x) => x.ph === 'ab')) { const rec = await DB.getMeta('foto:' + f.id); if (rec) items.push({ f, bytes: fromB64(rec.b64) }); }
    if (!items.length) return;
    const W = 595.28, Hh = 841.89, cw = 240, ch = 190, gx = (W - 2 * cw) / 3; let page = null, pos = 0;
    for (const it of items) {
      if (!page || pos >= 6) {
        page = doc.addPage([W, Hh]); pos = 0;
        page.drawText(safeTxt('Zustandsfotos bei der Abholung – ' + (b.name || '') + ' · ' + fmtDE(b.start)), { x: 40, y: Hh - 44, size: 11, font });
      }
      const img = await doc.embedJpg(it.bytes), sc = Math.min(cw / img.width, ch / img.height), w = img.width * sc, h2 = img.height * sc;
      const x = gx + (pos % 2) * (cw + gx), yTop = Hh - 70 - Math.floor(pos / 2) * (ch + 60);
      page.drawImage(img, { x, y: yTop - h2, width: w, height: h2 });
      page.drawText(safeTxt(it.f.art + (it.f.slot ? ' · ' + slotName(it.f.slot) : '') + ' · ' + stampOf(it.f.ts)), { x, y: yTop - ch - 14, size: 8, font });
      pos++;
    }
  }
  function thumbImg(f) {
    const img = h('img', { alt: '' });
    if (THC[f.id]) img.src = THC[f.id];
    else DB.getMeta('fth:' + f.id).then((v) => { if (v) { THC[f.id] = v; img.src = v; } }).catch(() => {});
    return img;
  }
  async function deleteFoto(bid, fid) {
    const cur = state.bookings.find((x) => x.id === bid), f = cur && (cur.fotos || []).find((x) => x.id === fid); if (!f) return false;
    if (!window.confirm('Dieses Foto wirklich löschen?')) return false;
    await patchBooking(cur, { fotos: (cur.fotos || []).filter((x) => x.id !== fid) });
    try { await DB.delMeta('foto:' + fid); await DB.delMeta('fth:' + fid); } catch (e) { /* egal */ }
    if (f.drive && navigator.onLine && GCAL.isSignedIn()) { try { await GCAL.authFetch('https://www.googleapis.com/drive/v3/files/' + f.drive, { method: 'DELETE' }); } catch (e) { /* Drive-Datei bleibt */ } }
    return true;
  }
  async function openFoto(bid, fid) {
    const old = document.getElementById('fotoov'); if (old) old.remove();
    const b = state.bookings.find((x) => x.id === bid), f = b && (b.fotos || []).find((x) => x.id === fid); if (!f) return;
    let url = null;
    const close = () => { const o = document.getElementById('fotoov'); if (o) o.remove(); if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* egal */ } } };
    const img = h('img', { class: 'fbig', alt: '' });
    const info = h('div', { class: 'tnone' }, f.art + ' · ' + phName(f.ph) + (f.slot ? ' · ' + slotName(f.slot) : '') + ' · ' + stampOf(f.ts) + (f.drive ? ' · in Drive ✓' : ' · noch nicht in Drive'));
    const del = h('button', { class: 'btn sec', onclick: async () => { if (await deleteFoto(bid, fid)) { close(); toast('Foto gelöscht'); } } }, 'Foto löschen');
    document.body.append(h('div', { class: 'ov signov', id: 'fotoov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Zustandsfoto'), h('button', { class: 'btn sec', onclick: close }, 'Schließen')),
      info, img, h('div', { class: 'stack' }, del))));
    const rec = await DB.getMeta('foto:' + fid);
    if (rec) { url = URL.createObjectURL(new Blob([fromB64(rec.b64)], { type: 'image/jpeg' })); img.src = url; }
    else if (f.drive && navigator.onLine && GCAL.isSignedIn()) {
      info.append(' · lade aus Drive …');
      try { const r = await GCAL.authFetch('https://www.googleapis.com/drive/v3/files/' + f.drive + '?alt=media'); url = URL.createObjectURL(await r.blob()); img.src = url; }
      catch (e) { info.append(' (Laden nicht möglich)'); }
    } else info.append(' · Original liegt in Drive (zum Ansehen online sein)');
  }
  function fotoSection(b) {
    const arts = fotoArts(b); if (!arts.length) return null;
    const fl = b.fotos || [], pend = fl.filter((f) => !f.drive).length;
    const area = (art, ph) => {
      const mine = fl.filter((f) => f.art === art && f.ph === ph);
      const tile = (k, label) => {
        const f = mine.find((x) => x.slot === k);
        if (f) return h('div', { class: 'fslot' }, h('div', { class: 'fwrap' }, h('button', { class: 'fthumb big', onclick: () => openFoto(b.id, f.id) }, thumbImg(f), f.drive ? null : h('i', {}, '⏳')), h('button', { class: 'fdel', 'aria-label': 'Foto löschen', onclick: async (ev) => { ev.stopPropagation(); if (await deleteFoto(b.id, f.id)) toast('Foto gelöscht'); } }, '✕')), h('span', {}, label));
        const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
        inp.addEventListener('change', async () => {
          const files = [...inp.files].slice(0, 1); inp.value = ''; if (!files.length) return;
          toast('Foto wird gespeichert …');
          try { await addPhotos(b, art, ph, files, k); toast('Foto gespeichert'); } catch (e) { console.error(e); toast('Foto konnte nicht gespeichert werden'); }
        });
        return h('div', { class: 'fslot' }, inp, h('button', { class: 'fthumb big empty', onclick: () => inp.click() }, h('span', { class: 'cam' }, '📷')), h('span', {}, label));
      };
      const extra = mine.filter((f) => !SLOTS.some((q) => q[0] === f.slot));
      return h('div', { class: 'frow' }, h('span', { class: 'flab' }, phName(ph)),
        h('div', { class: 'fth' }, SLOTS.map((q) => tile(q[0], q[1])),
          extra.map((f) => h('div', { class: 'fslot' }, h('div', { class: 'fwrap' }, h('button', { class: 'fthumb big', onclick: () => openFoto(b.id, f.id) }, thumbImg(f), f.drive ? null : h('i', {}, '⏳')), h('button', { class: 'fdel', 'aria-label': 'Foto löschen', onclick: async (ev) => { ev.stopPropagation(); if (await deleteFoto(b.id, f.id)) toast('Foto gelöscht'); } }, '✕')), h('span', {}, 'weiteres')))));
    };
    return h('div', { class: 'slip pad fotobox' }, h('div', { class: 'ct' }, '📷 Zustandsfotos'),
      h('div', { class: 'tnone' }, 'Freiwillig, bis zu 3 Fotos je Abholung und Rückgabe: Gesamtansicht, Zubehör, Zustand. Nur die Mietgegenstände fotografieren, keine Personen und keine Ausweise.'),
      arts.map((a) => h('div', { class: 'fart' }, h('b', {}, a), area(a, 'ab'), area(a, 'rueck'))),
      pend ? h('div', { class: 'warnbox', style: 'margin-top:8px' }, '⏳ ' + pend + (pend === 1 ? ' Foto ist' : ' Fotos sind') + ' noch nicht in Drive und werden beim nächsten Netz hochgeladen.',
        h('button', { class: 'btn sec sm', style: 'margin-left:8px', onclick: async () => { const n = await flushFotos(); toast(n ? n + ' hochgeladen' : 'Noch nicht möglich (Netz / Google-Anmeldung)'); } }, 'Jetzt hochladen')) : null,
      fl.some((f) => f.ph === 'ab') ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: b.fotosPdf ? '' : null, onchange: (ev) => { patchBooking(b, { fotosPdf: ev.target.checked }); } }), h('span', {}, 'Abholungsfotos an den Mietvertrag (PDF) anhängen')) : null);
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
        h('label', { class: 'fotosw', title: 'Zustandsfoto bei Abholung/Rückgabe' }, h('input', { type: 'checkbox', checked: fotoOn(a) ? '' : null, onchange: async (ev) => {
          await saveArts(state.arts.map((x) => (x.id === a.id ? Object.assign({}, x, { foto: ev.target.checked }) : x))); toast(ev.target.checked ? 'Zustandsfoto an' : 'Zustandsfoto aus');
        } }), '📷'),
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
      h('div', { class: 'pextra', style: 'margin:0 0 10px;font-size:13.5px' }, 'Anzahl je Artikel ändern, wird direkt gespeichert und beim Abgleichen nach Drive übertragen. Haken 📷 = bei diesem Artikel gibt es Zustandsfotos (Abholung/Rückgabe); Haken entfernen = kein Foto-Bereich.'),
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
  const TIERS = [['1 Tag', 'Tagespreis (1 Tag)'], ['2 Tage', 'Preis für 2 Tage'], ['3 Tage', 'Preis für 3 Tage'], ['4 Tage', '4 Tage und mehr: auf Anfrage']];
  const PRICES = [
    { cat: 'Kombi-Angebote', short: 'Kombi', items: [
      { n: 'Hüpfburg + JBL PartyBox 520', inv: null, p: [80, 130, 160], k: 200,
        note: 'Hüpfburg frei wählbar: Schloss, Kleines Schloss, Slide oder Space. Bei Buchung: gewählte Hüpfburg + PartyBox JBL 520 als zwei Positionen eintragen, damit beides blockiert wird.' }
    ] },
    { cat: 'Hüpfburgen', short: 'Hüpfburgen', items: [
      { n: 'Hüpfburg Schloss', inv: 'Hüpfburg Schloss', p: [50, 80, 100], k: 100 },
      { n: 'Hüpfburg Slide', inv: 'Hüpfburg Slide', p: [50, 80, 100], k: 100 },
      { n: 'Hüpfburg Space', inv: 'Hüpfburg Space', p: [50, 80, 100], k: 100 },
      { n: 'Hüpfburg Kleines Schloss', inv: 'Hüpfburg Kleines Schloss', p: [50, 80, 100], k: 100 }
    ] },
    { cat: 'Partytechnik · Sound · Licht', short: 'Technik', items: [
      { n: 'PartyBox JBL 520', inv: 'PartyBox JBL 520', p: [40, 60, 80], k: 100, x: ['+ Licht Paket 1: 10 €', '+ Mikrofon Paket: 10 €'] },
      { n: 'DJ & Party Paket', inv: 'DJ & Party Paket', p: [110, 175, 220], k: 150, note: 'inkl. 2x Mikro, 2x JBL 520, 2x Ständer, Nebelmaschine, Partylicht' },
      { n: 'LED Lichtanlage', inv: 'LED Lichtanlage', p: [35, 60, 80], k: 50 }
    ] },
    { cat: 'Catering-Maschinen', short: 'Catering', items: [
      { n: 'Popcornmaschine Star', inv: 'Popcornmaschine Star', p: [50, 80, 100], k: 50, x: ['+ Popcorn Paket 1: 25 €', '+ Reinigung: 30 €'] },
      { n: 'Slush Eis Maschine Ninja', inv: 'Slush Eis Maschine Ninja', p: [40, 70, 85], k: 50, x: ['+ Slush Paket 1: 15 €', '+ Reinigung: 15 €'] },
      { n: 'Zuckerwattenmaschine Sweet', inv: 'Zuckerwattenmaschine Sweet', p: [40, 60, 80], k: 50, x: ['+ Zucker Paket (Zucker & Stäbe): 7 €', '+ Reinigung: 15 €'] },
      { n: 'Crêpes Maker Paris', inv: 'Crepes Maschine Paris', p: [30, 50, 70], k: 50, x: ['+ Langzeitangebot 10 Tage: 150 €'] },
      { n: 'Speisewärmer / Wärmebehälter', inv: 'Speisewärmer Eat', p: [10, 13, 18], k: 15, x: ['+ 2x Wärmepaste: 5 €'] },
      { n: 'Party-Kühlschrank / Akku-Kühlbox', inv: 'Party-Kühlschrank/Akku-Kühlbox', p: [40, 60, 80], k: 100, x: ['Langzeit: 4–6 Tage = 22 €/Tag', '7–13 Tage = 18 €/Tag · ab 14 Tage = 15 €/Tag'] },
      { n: 'Glühweinkocher / Wasserkocher', inv: 'Glühweinkocher/Wasserkocher', p: [15, 20, 25], k: 20 },
      { n: 'kukki Cocktail-Toaster', inv: 'kukki Cocktail-Toaster', p: [25, 40, 50], k: 50, note: 'Tiefgefrorene Cocktails in 20–30 Sek. servierfertig. Cocktails selbst nicht im Mietpreis enthalten, Abgabe nur ab 18 Jahren.', x: ['Cocktails auf Anfrage dazu erhältlich'] },
      { n: 'Aperol Spritz Maschine', inv: 'Aperol Spritz Maschine', p: [25, 40, 50], k: 50, note: 'Sprizzer mit 3 Kammern (Prosecco/Aperol/Soda), mischt automatisch 3:2:1, reicht für ca. 18–20 Gläser pro Füllung. Getränke & Eis nicht im Mietpreis enthalten.', x: ['Vorlage Lichtbildausweis erforderlich'] }
    ] },
    { cat: 'Mobiliar & Stehtische', short: 'Mobiliar', items: [
      { n: 'Stehtisch (pro Tisch)', inv: 'Stehtisch', p: [10, 12, 15], k: 20, kp: 'pro Stück', x: ['+ Hussen Paket (inkl. Reinigung): 7 €'] },
      { n: 'Bierzeltgarnitur (1 Tisch & 2 Bänke)', inv: 'Bierzeltgarnitur', p: [10, 12, 15], k: 20, kp: 'pro Stück' }
    ] },
    { cat: 'Spezialmaschinen', short: 'Maschinen', items: [
      { n: 'Schneemaschine Snow', inv: 'Schneemaschine/Schaumkanone Snow', p: [50, 70, 90], k: 50, x: ['+ Schnee Paket 1: 22 €'] },
      { n: 'Nebelmaschine Fog / Fog Beamz', inv: 'Nebelmaschine Fog Beamz', p: [20, 30, 40], k: 50, x: ['+ Nebel Paket 1: 10 €'] }
    ] }
  ];
  const diffDays = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  function matchTier(vs, bs) {
    if (!vs) return -1; bs = bs || vs; if (bs < vs) bs = vs;
    const n = diffDays(parse(bs), parse(vs)) + 1;
    return n >= 4 ? 3 : n - 1;
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
      h('div', { class: 'ptiers' }, it.p.concat(['auf Anfrage']).map((v, i) => h('div', { class: 'tier' + (i === tier ? ' hit' : '') + (i === 3 ? ' req' : '') }, h('small', {}, TIERS[i][0]), h('b', {}, i === 3 ? 'Anfrage' : v + ' €')))),
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
        ' · ' + n + (n === 1 ? ' Tag' : ' Tage') + ' · ', TIERS[tier][1]));
    }
    if (state.pmode !== 'karten') {
      const last0 = (bs < vs ? vs : bs) || vs, n0 = vs ? diffDays(parse(last0), parse(vs)) + 1 : 1;
      PRICES.forEach((g, gi) => {
        const items = g.items.filter((it) => !q || (it.n + ' ' + g.cat).toLowerCase().indexOf(q) > -1);
        if (!items.length) return;
        box.append(h('div', { class: 'pcat', id: 'pc-' + gi }, g.cat));
        box.append(h('div', { class: 'tiles' }, items.map((it) => {
          const av = availOf(it, vs, bs);
          const req = tier === 3, price = req ? 0 : it.p[tier >= 0 ? tier : 0];
          const lbl = !vs ? '1 Tag' : TIERS[tier][0];
          return h('div', { class: 'tile ' + (av ? av.c : '') },
            h('div', { class: 'tn' }, it.n),
            h('div', { class: 'tp' }, req ? 'auf Anfrage' : price + ' €', h('small', {}, ' ' + lbl)),
            h('div', { class: 'tmini' }, it.p.concat(['Anfrage']).map((v, i) => h('span', { class: i === (vs ? tier : 0) ? 'hit' : '' }, h('i', {}, TIERS[i][0].replace(' Tage', ' T').replace(' Tag', ' T')), h('b', {}, i === 3 ? 'auf Anfr.' : v + ' €')))),
            av ? h('span', { class: 'pav ' + av.c }, av.t) : h('span', { class: 'pav' }, 'Termin wählen'),
            h('div', { class: 'tk' }, 'Kaution ' + it.k + ' €' + (it.kp ? ' ' + it.kp : '')),
            it.inv ? h('button', { class: 'tbook', onclick: () => bookFromTile(it, vs, bs, vs ? price : it.p[0]) }, '+ Anfrage anlegen') : null);
        })));
      });
      if (!box.childNodes.length) box.append(h('div', { class: 'empty' }, 'Nichts gefunden.'));
      else box.append(h('div', { class: 'phints' }, h('div', {}, h('b', {}, 'Mietzeit: '), '1 Tag = i. d. R. 9:00 – 21:00 Uhr'), h('div', {}, h('b', {}, 'Preise: '), '1 Tag, 2 Tage, 3 Tage – ab 4 Tagen auf Anfrage')));
      return;
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
        h('div', {}, h('b', {}, 'Pakete: '), 'Preise nach Tagen: 1 Tag, 2 Tage, 3 Tage – ab 4 Tagen auf Anfrage (Pauschalpreis)'),
        h('div', {}, h('b', {}, 'Lieferung: '), 'Ruhrgebiet & Umgebung. Stehtische und Bierzeltgarnituren ab 6 Stück: 1 €/km · 4 Fahrten'),
        h('div', {}, h('b', {}, 'Kaution: '), 'wird bei Rückgabe vollständig erstattet'),
        h('div', {}, h('b', {}, 'Steuer: '), '§19 Abs. 1 UStG, keine Mehrwertsteuer'),
        h('div', {}, h('b', {}, 'Kontakt: '), '0163 3865144 · info@muellers-mietxpress.de'),
        h('div', { class: 'pextra' }, 'Preisliste 2026, Stand 10/2026')));
  }
  // ===== Schnellansicht (iPad): links Kalender, rechts Tag / Preise =====
  function setBreit(on) {
    state.breit = !!on;
    try { localStorage.setItem('mxBreit', on ? '1' : '0'); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function setSchnell(on) {
    state.schnell = !!on; state.menu = false;
    try { localStorage.setItem('mxSchnell', on ? '1' : '0'); } catch (e) {}
    render(); window.scrollTo(0, 0);
  }
  function schnellPanel(R) {
    const map = dayMap(), sel = state.sel;
    R.append(h('div', { class: 'sphead' },
      h('b', {}, fmtFull(sel)),
      h('button', { class: 'btn', onclick: () => openEdit(null) }, '+ Neue Buchung')));
    const list = (map[sel] || []).slice().sort(sortByStart);
    if (list.length) list.forEach((b) => {
      const k = 's' + b.id, op = !!state.open[k];
      R.append(h('button', { class: 'srow', style: '--pc:' + bookCatColor(b), onclick: () => { state.open[k] = !op; render(); } },
        h('b', {}, abbrArt(b.artikel) || b.name || '—'),
        h('span', {}, [b.name, b.start === sel ? (b.abholzeit ? '↑ ' + b.abholzeit : '') : (b.ende === sel && b.rueckzeit ? '↓ ' + b.rueckzeit : ''), STATUS[b.status]].filter(Boolean).join(' · ')),
        h('i', {}, op ? '▴' : '▾')));
      if (op) R.append(card(b));
    });
    else R.append(h('div', { class: 'empty' }, 'Keine Buchungen an diesem Tag.'));
    // Ausgebucht / teils frei an diesem Tag
    const no = [], mid = [];
    PRICES.forEach((g) => g.items.forEach((it) => {
      const av = availOf(it, sel, sel); if (!av) return;
      if (av.c === 'no') no.push(it); else if (av.c === 'mid') mid.push([it, av.t]);
    }));
    if (no.length) R.append(h('div', { class: 'grp grp-mx' }, 'Ausgebucht'), h('div', { class: 'chipsrow' }, no.map((it) => h('span', { class: 'pav no' }, it.n))));
    if (mid.length) R.append(h('div', { class: 'grp grp-priv' }, 'Teilweise frei'), h('div', { class: 'chipsrow' }, mid.map((m) => h('span', { class: 'pav mid' }, m[0].n + ' · ' + m[1]))));
    if (!no.length && !mid.length) R.append(h('div', { class: 'grp grp-priv' }, 'Alles frei'));
  }
  function schnellBar() {
    const m = state.smode === 'preise' ? 'preise' : 'kal';
    const go = (x) => () => { state.smode = x; if (x === 'preise') { state.pvon = state.pvon || state.sel; } render(); window.scrollTo(0, 0); };
    return h('div', { class: 'sbar' },
      h('button', { class: m === 'kal' ? 'on' : '', onclick: go('kal') }, h('span', {}, '📅'), 'Kalender', h('small', {}, 'Ist es frei? Eintragen')),
      h('button', { class: m === 'preise' ? 'on' : '', onclick: go('preise') }, h('span', {}, '💶'), 'Was kostet was?', h('small', {}, 'Preise & frei')));
  }
  function bookFromTile(it, vs, bs, price) {
    openEdit(null);
    const d = state.edit.d, a = vs || d.start, e = (bs && bs >= a) ? bs : a;
    d.start = a; d.ende = e; d.status = 'angefragt'; d.name = d.name || '(Name fehlt)'; d.positionen = [{ artikel: it.inv, anzahl: 1 }];
    d.preis = price; d.kaution = it.k; d.kautionStatus = 'offen';
    render();
  }
  function quickDates() {
    const t0 = today0(), dow = (t0.getDay() + 6) % 7, fr = addDays(t0, (4 - dow + 7) % 7);
    const set = (a, b) => { state.pvon = a; state.pbis = b; render(); };
    const cur = (state.pvon || '') + '|' + (state.pbis || '');
    return h('div', { class: 'chips qd' }, [
      ['Heute', iso(t0), ''],
      ['Morgen', iso(addDays(t0, 1)), ''],
      ['Fr–Sa', iso(fr), iso(addDays(fr, 1))],
      ['Sa–So', iso(addDays(fr, 1)), iso(addDays(fr, 2))],
      ['Fr–So', iso(fr), iso(addDays(fr, 2))]
    ].map((c) => {
      const on = cur === c[1] + '|' + c[2];
      return h('button', { class: on ? 'on' : '', onclick: () => set(c[1], c[2]) }, (on ? '✓ ' : '') + c[0]);
    }));
  }
  function viewPreise(main) {
    if (state.pmode == null) { try { state.pmode = localStorage.getItem('mxPmode') || 'kacheln'; } catch (e) { state.pmode = 'kacheln'; } }
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
      quickDates(),
      h('div', { class: 'seg' }, [['kacheln', 'Kacheln'], ['karten', 'Karten']].map((m) => h('button', { class: (state.pmode !== 'karten' ? 'kacheln' : 'karten') === m[0] ? 'on' : '', onclick: () => { state.pmode = m[0]; try { localStorage.setItem('mxPmode', m[0]); } catch (e) {} render(); } }, m[1]))),
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
    const fest = (o.art && GEN[o.art] ? GEN[o.art] + ' ' + (DISP[o.art] || o.art) + ' fest für dich reserviert' : 'dein Termin fest reserviert');
    const dat = o.d ? pad(o.d.getDate()) + '.' + pad(o.d.getMonth() + 1) : '[DATUM]';
    return {
      avail: 'Hallo,\nja, ' + (o.art && GEN[o.art] ? GEN[o.art] + ' ' + (DISP[o.art] || o.art) + ' wäre' : 'das wäre') + ' da noch verfügbar.\n\nMit freundlichen Grüßen\n' + sig,
      res: 'Hallo lieber Kunde,\nfür die Reservierung sende bitte 10 € per PayPal an info@muellers-mietxpress.de\nName und Mietdatum einfach im Betreff angeben.\n\nSobald die Anzahlung bei mir eingegangen ist, ist ' + fest + ' und ich schicke dir alle weiteren Infos zur Abholung.\n\nMit freundlichen Grüßen\n' + sig,
      best: 'Hallo lieber Kunde,\nvielen Dank für deine Buchung! 🙏\n\n' +
        'Hier alle Infos auf einen Blick:\n' +
        '📍 Abholadresse: Leveringhauser Str. 80, 44581 Castrop-Rauxel\n' +
        '🕐 Abholzeit: ' + (o.ab ? timeDe(o.ab) : '[UHRZEIT]') + '\n' +
        '📅 Datum: ' + dat + '\n' +
        '🪪 Bitte mitbringen: Lichtbildausweis + Kaution (bar)\n' +
        (o.hasData ? '' : '\n❗ Noch von dir benötigt, damit ich den Mietvertrag fertig machen kann:\n' + (o.miss || ['n', 'a', 'e']).map((k) => ({ n: '👤 Vollständiger Name', a: '🏠 Adresse (Straße, Hausnummer, PLZ, Ort)', e: '✉️ E-Mail-Adresse' })[k]).join('\n') + '\n') +
        '\nBis dann! 😊\n' + sig,
      bank: 'Hallo lieber Kunde,\nkein Problem, du kannst die 10 € für die Reservierung auch per Überweisung senden:\nIBAN: ' + IBAN_TXT + '\nName und Mietdatum einfach im Verwendungszweck angeben.\n\nSobald die Anzahlung bei mir eingegangen ist, ist ' + fest + ' und ich schicke dir alle weiteren Infos zur Abholung.\n\nMit freundlichen Grüßen\n' + sig
    };
  }
  function buildMsgs(b) {
    const miss = [];
    if (!(b.name && b.name.indexOf('(Name fehlt)') < 0 && /\s|,/.test(String(b.name).trim()))) miss.push('n');
    if (!b.adresse) miss.push('a');
    if (!b.email) miss.push('e');
    const hasData = !miss.length;
    const m = msgTexts({ d: parse(b.start), ab: b.abholzeit, hasData, miss });
    return [
      { t: '1. Reservierung (PayPal)', x: m.res },
      { t: '2. Bestätigung mit Infos', x: m.best, hint: hasData ? 'Name, Adresse und E-Mail sind schon da, deshalb ohne Nachfrage.' : 'Name, Adresse oder E-Mail fehlen noch, deshalb mit Nachfrage.' },
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
        h('label', { class: 'calrow' }, known, h('span', {}, 'Name, Adresse und E-Mail sind schon bekannt'))),
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
    warmToken();
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
    let neu = 0, geaendert = 0, weg = 0, bestand = 0; const warn = [];
    for (const f of fresh) {
      let j;
      try { j = await GDRIVE.download(f.id); } catch (e) { warn.push(f.name + ': nicht lesbar'); continue; }
      const list = Array.isArray(j) ? j : (j && Array.isArray(j.buchungen) ? j.buchungen : []);
      const del = j && Array.isArray(j.loeschen) ? j.loeschen.map(String) : [];
      const artUp = j && Array.isArray(j.artikel) ? j.artikel.filter((x) => x && x.name && x.menge != null) : []; // Bestandsänderungen: { name, menge }
      try {
        // Jeder Eintrag einzeln: ein unbrauchbarer Eintrag (z. B. Änderung an einer Buchung, die es in der App nicht gibt) darf die anderen nicht blockieren
        let okItems = 0, badItems = 0;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (o && typeof o === 'object' && o.id && !o.start && !state.bookings.some((x) => x.id === String(o.id))) {
            warn.push(f.name + ': Änderung an „' + o.id + '“ übersprungen, diese Buchung gibt es in der App nicht (evtl. schon gelöscht).'); badItems++; continue;
          }
          let it;
          try { it = prepItems([o])[0]; } catch (e) { warn.push(f.name + ': Eintrag ' + (i + 1) + (o && o.id ? ' („' + o.id + '“)' : '') + ' übersprungen, ' + String(e.message || e).replace(/^Eintrag \d+ /, '')); badItems++; continue; }
          const d = Object.assign({}, it.b, { positionen: (it.b.positionen || Avail.positionsOf(it.b, state.arts)).map((p) => ({ artikel: p.artikel, anzahl: p.anzahl })) });
          editWarnings(d).forEach((w) => warn.push((it.b.name || 'Buchung') + ': ' + w));
          await saveBooking(it.b);
          if (it.isNew) neu++; else geaendert++;
          okItems++;
        }
        if (list.length && !okItems && badItems) continue; // komplett unbrauchbar: nicht als erledigt merken
        for (const id of del) { const b = state.bookings.find((x) => x.id === id); if (b) { await removeBooking(b); weg++; } }
        if (artUp.length) {
          const list = state.arts.map((x) => Object.assign({}, x));
          artUp.forEach((u) => { const t = list.find((x) => x.name === u.name); if (t) { t.menge = Number(u.menge); bestand++; } else warn.push('Bestand: Artikel "' + u.name + '" nicht gefunden'); });
          if (bestand) await saveArts(list);
        }
      } catch (e) { warn.push(f.name + ': ' + e.message); continue; }
      done.push(f.id);
    }
    await DB.setMeta('eingangDone', done.slice(-200));
    return { neu, geaendert, weg, bestand, warn, dateien: fresh.length, gesehen: files.length, neuste: files.length ? files.map((f) => f.name).sort().pop() : '' };
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

  // Immer sichtbar: was gerade draußen ist und welche Anfragen offen sind (nur Produkt)
  // ===== Suche über alles (Buchungen + Kalendertermine) =====
  function viewSearch() {
    const S = state.search, T = iso(today0());
    const out = h('div', { class: 'srlist' });
    const norm = (t) => String(t == null ? '' : t).toLowerCase();
    const go = (day, b) => () => {
      state.search = null; if (!state.schnell) state.view = 'monat';
      state.sel = day; state.cursor = new Date(parse(day).getFullYear(), parse(day).getMonth(), 1);
      if (b) { state.open['s' + b.id] = true; state.open['z' + b.id] = true; }
      render(); window.scrollTo(0, 0);
    };
    const paint = () => {
      const words = norm(S.q).split(/\s+/).filter(Boolean);
      if (!words.length) { out.replaceChildren(h('div', { class: 'empty' }, 'Tippe einen Namen, Artikel, Ort, Telefonnummer oder Begriff ein.')); return; }
      const hit = (txt) => { const t = norm(txt); return words.every((w) => t.indexOf(w) > -1); };
      const items = [];
      state.bookings.forEach((b) => {
        if (hit([b.name, b.artikel, b.telefon, b.email, b.adresse, b.notiz, b.plattform, STATUS[b.status]].join(' ')))
          items.push({ d: b.start, e: b.ende || b.start, t: (b.artikel || '(ohne Artikel)') + ' · ' + (b.name || '(ohne Name)'), s: 'Buchung · ' + (STATUS[b.status] || b.status) + (b.adresse ? ' · ' + b.adresse : ''), k: 'b', b, c: bookCatColor(b) });
      });
      const mirrored = (ev) => state.bookings.some((b) => b.gcalEventId && (b.gcalEventId === ev.id || String(ev.id).endsWith(':' + b.gcalEventId) || String(b.gcalEventId).endsWith(':' + ev.id)));
      (state.cal.events || []).forEach((ev) => {
        if (mirrored(ev)) return;
        if (hit([ev.title, ev.ort].join(' '))) items.push({ d: ev.start, e: ev.ende || ev.start, t: ev.title, s: 'Kalender' + (ev.zeit ? ' · ' + ev.zeit : '') + (ev.ort ? ' · ' + ev.ort : ''), k: 'e', c: '#7a8aa8' });
      });
      const up = items.filter((x) => x.e >= T).sort((a, b) => a.d.localeCompare(b.d)), past = items.filter((x) => x.e < T).sort((a, b) => b.d.localeCompare(a.d));
      const all = up.concat(past).slice(0, 80);
      const row = (x) => h('button', { class: 'trow' + (x.e < T ? ' past' : ''), style: '--pc:' + x.c, onclick: go(x.d, x.b) },
        h('b', {}, wd(x.d) + ' ' + fmtD(x.d) + (x.e !== x.d ? ' – ' + fmtD(x.e) : '') + '.' + parse(x.d).getFullYear()), h('span', {}, x.t), h('em', {}, x.s));
      out.replaceChildren(...(all.length ? [h('div', { class: 'tnone' }, items.length + (items.length === 1 ? ' Treffer' : ' Treffer') + (items.length > 80 ? ' (die ersten 80)' : ''))].concat(all.map(row)) : [h('div', { class: 'empty' }, 'Nichts gefunden.')]));
    };
    const inp = h('input', { class: 'inp', type: 'search', placeholder: 'Alles durchsuchen …', value: S.q, autocomplete: 'off', oninput: (e) => { S.q = e.target.value; paint(); } });
    setTimeout(() => { try { inp.focus(); } catch (e) {} paint(); }, 0);
    return h('div', { class: 'ov', id: 'searchov' }, h('div', { class: 'ovin' },
      h('div', { class: 'ovtop' }, h('h2', {}, 'Suche'), h('button', { class: 'btn sec', onclick: () => { state.search = null; render(); } }, 'Schließen')),
      inp,
      h('div', { class: 'tnone' }, 'Durchsucht Buchungen und deine Google-Kalender (ab letztem Monat bis ca. 10 Monate voraus).'),
      out));
  }
  // ===== Heute: was geht raus, was kommt zurück, was ist offen =====
  function listDev(b) {
    if (!(Number(b.preis) > 0) || ['angefragt', 'bestaetigt', 'abgeholt'].indexOf(b.status) < 0) return null;
    if (/paket/i.test((b.notiz || '') + ' ' + (b.artikel || ''))) return null;
    const pos = Avail.positionsOf(b, state.arts).map((p) => ({ artikel: p.artikel, anzahl: p.anzahl }));
    const c = calcPrice({ start: b.start, ende: b.ende || b.start, positionen: pos });
    return c && c.preis != null && c.preis !== Number(b.preis) ? c.preis : null;
  }
  const heuteOn = () => { try { return localStorage.getItem('mxHeute') === '1'; } catch (e) { return false; } };
  function todayBox() {
    const T = iso(today0());
    const go = (day) => () => { if (!state.schnell) state.view = 'monat'; state.sel = day; state.cursor = new Date(parse(day).getFullYear(), parse(day).getMonth(), 1); render(); window.scrollTo(0, 0); };
    const open = (b) => (b.kaution > 0 && b.kautionStatus !== 'erhalten' && b.kautionStatus !== 'zurueck' ? b.kaution : 0);
    const raus = state.bookings.filter((b) => (b.status === 'bestaetigt' || b.status === 'angefragt') && b.start === T).sort(sortByStart);
    const zur = state.bookings.filter((b) => b.status === 'abgeholt' && (b.ende || b.start) <= T).sort((x, y) => (x.ende || x.start).localeCompare(y.ende || y.start));
    const offen = [];
    state.bookings.filter((b) => b.status === 'angefragt' && b.start >= T && !(Number(b.anzahlung) > 0)).sort(sortByStart).slice(0, 6)
      .forEach((b) => offen.push({ b, t: 'Anzahlung fehlt', d: b.start }));
    state.bookings.filter((b) => b.status === 'zurueck' && b.kaution > 0 && b.kautionStatus === 'erhalten')
      .forEach((b) => offen.push({ b, t: 'Kaution zurückgeben ' + eur0(b.kaution), d: b.ende || b.start }));
    const row = (b, info, cls, day) => h('button', { class: 'trow ' + (cls || ''), style: '--pc:' + bookCatColor(b), onclick: go(day || b.start) },
      h('b', {}, (abbrArt(b.artikel) || b.artikel || '(ohne Artikel)')), h('span', {}, (b.name || '(ohne Name)')), h('em', {}, info));
    const col = (title, n, rows, empty) => h('div', { class: 'tcol' }, h('div', { class: 'tcap' }, title, n ? h('i', {}, String(n)) : null), rows.length ? rows : h('div', { class: 'tnone' }, empty));
    return h('div', { class: 'today' },
      col('HEUTE RAUS', raus.length, raus.map((b) => {
        const z = Math.max(0, b.preis - b.anzahlung) + open(b);
        return row(b, hhmm(b.abholzeit || b.zeit) + (b.status === 'angefragt' ? ' · angefragt' : '') + (z > 0 ? ' · kassieren ' + eur0(z) : ' · bezahlt ✓'));
      }), 'Keine Abholung'),
      col('ZURÜCK', zur.length, zur.map((b) => {
        const e = b.ende || b.start, late = e < T;
        return row(b, (late ? 'überfällig seit ' + fmtD(e) : hhmm(b.rueckzeit)) + (open(b) ? ' · Kaution ' + eur0(open(b)) : ''), late ? 'late' : '', e);
      }), 'Nichts zurück'),
      col('OFFEN', offen.length, offen.map((o) => row(o.b, o.t + (o.t.indexOf('Anzahlung') === 0 ? ' · ab ' + fmtD(o.d) : ''), '', o.d)), 'Nichts offen'));
  }
  function liveStrip() {
    const out = state.bookings.filter((b) => b.status === 'abgeholt').sort((x, y) => (x.ende || x.start).localeCompare(y.ende || y.start));
    const req = state.bookings.filter((b) => b.status === 'angefragt').sort(sortByStart);
    if (!out.length && !req.length) return null;
    const go = (b, day) => () => { state.view = 'monat'; state.sel = day; state.cursor = new Date(parse(day).getFullYear(), parse(day).getMonth(), 1); render(); window.scrollTo(0, 0); };
    const chip = (b, cls, day) => h('button', { class: 'lchip ' + cls, style: '--pc:' + bookCatColor(b), onclick: go(b, day) }, abbrArt(b.artikel) || b.artikel || b.name);
    return h('div', { class: 'live' },
      req.length ? h('div', { class: 'lrow req' }, h('span', {}, 'ANFRAGEN'), req.map((b) => chip(b, 'rq', b.start))) : null,
      out.length ? h('div', { class: 'lrow' }, h('span', {}, 'DRAUSSEN'), out.map((b) => chip(b, 'ot', b.ende || b.start))) : null);
  }
  // ===== Rendern =====
  function render() {
    const app = document.getElementById('app');
    const y = window.scrollY;
    const ovTop = {}; app.querySelectorAll('.ov[id]').forEach((o) => { ovTop[o.id] = o.scrollTop; });
    app.replaceChildren();
    const breitOn = state.breit && !state.schnell;
    const wrap = h('div', { class: 'wrap' + (state.schnell ? ' schnell' : '') + (breitOn ? ' breit v-' + state.view : '') });
    wrap.append(h('header', {},
      h('img', { class: 'logoimg', src: state.logo || 'logo.jpg', alt: 'müllers-MietXpress' }),
      h('div', { class: 'ttl' }, h('h1', {}, 'MietXpress'), h('div', { class: 'hdate' }, h('span', {}, today0().toLocaleDateString('de-DE', { weekday: 'long' }) + ' '), h('b', {}, today0().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })))),
      h('span', { class: 'net ' + (state.online ? 'on' : 'off') }, state.online ? 'Online' : 'Offline'),
      h('button', { class: 'iconbtn' + (state.schnell ? ' on' : ''), 'aria-label': state.schnell ? 'Zurück zur normalen Ansicht' : 'Schnellansicht (iPad)', title: state.schnell ? 'Normale Ansicht' : 'Schnellansicht', onclick: () => setSchnell(!state.schnell) }, '🖥️'),
      h('button', { class: 'iconbtn' + (state.breit ? ' on' : ''), 'aria-label': state.breit ? 'Zurück zur schmalen Ansicht' : 'Breite Ansicht (iPad quer)', title: state.breit ? 'Schmale Ansicht' : 'Breite Ansicht', onclick: () => setBreit(!state.breit) }, '↔️'),
      h('button', { class: 'iconbtn', 'aria-label': 'Suche', onclick: () => { state.search = { q: '' }; render(); } }, '🔍'),
      h('button', { class: 'iconbtn', 'aria-label': 'Nachricht', onclick: openMsgsGeneric }, '💬'),
      h('button', { class: 'iconbtn', 'aria-label': 'Neue Buchung', onclick: () => openEdit(null) }, '+'),
      h('button', { class: 'iconbtn', 'aria-label': 'Daten und Einstellungen', onclick: () => { state.menu = true; render(); } }, '⋯')));
    if (state.ready && state.schnell) { if (state.bookings.length && heuteOn()) wrap.append(todayBox()); const lv = liveStrip(); if (lv) wrap.append(lv); }
    else if (state.ready && state.view !== 'preise' && state.bookings.length) { if (heuteOn()) wrap.append(todayBox()); wrap.append(statsBox()); const lv = liveStrip(); if (lv) wrap.append(lv); }
    if (!state.schnell) wrap.append(h('div', { class: 'tabs' }, [['monat', 'Monat'], ['woche', 'Woche'], ['liste', 'Liste'], ['preise', 'Frei & Preis']].map((t) =>
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
    } else if (state.schnell) {
      main.append(schnellBar());
      if (state.smode === 'preise') { const P = h('div', { class: 'spfull' }); viewPreise(P); main.append(P); }
      else {
        const L = h('div', { class: 'scol' }), R = h('div', { class: 'sp' });
        viewMonat(L, true); schnellPanel(R); main.append(h('div', { class: 'sgrid' }, L, R));
      }
    } else if (state.view === 'monat' && breitOn) {
      const L = h('div', { class: 'bcol' }), R = h('div', { class: 'bpanel' });
      viewMonat(L, false, R); main.append(h('div', { class: 'bgrid' }, L, R));
    } else if (state.view === 'monat') viewMonat(main);
    else if (state.view === 'liste') viewListe(main);
    else if (state.view === 'woche') viewWoche(main);
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
    if (state.search) app.append(viewSearch());
    if (state.sperrOpen) app.append(viewSperr());
    if (state.bestandOpen) app.append(viewBestandEdit());
    if (state.gev) app.append(viewGev());
    window.scrollTo(0, y);
    app.querySelectorAll('.ov[id]').forEach((o) => { if (ovTop[o.id]) o.scrollTop = ovTop[o.id]; });
  }

  // ===== Start =====
  window.addEventListener('online', () => { state.online = true; render(); });
  window.addEventListener('offline', () => { state.online = false; render(); });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  render();
  function autoSync() {
    if (!state.ready || !state.drive.id || !state.online || state.drive.busy || state.synced) return;
    if (!GCAL.isSignedIn()) return; // ohne Fingertipp lässt iOS kein Anmeldefenster zu
    if (Date.now() - state.autoAt < 5 * 60 * 1000) return;
    state.autoAt = Date.now();
    driveSync(true);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });
  load().then(() => { render(); if (state.cal.connected && state.online && GCAL.preload) GCAL.preload(); setTimeout(autoSync, 600); }).catch((e) => {
    document.getElementById('app').replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'empty' }, 'Speicher nicht verfügbar: ' + e.message)));
  });
})();
