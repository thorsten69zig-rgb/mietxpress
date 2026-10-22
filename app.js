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
    menu: false, online: navigator.onLine, importAt: null, ready: false
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
    return {
      id: String(b.id), name: b.name || '', adresse: b.adresse || '', telefon: b.telefon || '',
      plattform: b.plattform || '', artikel: artText, positionen: pos,
      start: start, ende: b.ende || start, zeit: b.zeit || '',
      abholzeit: b.abholzeit || '', rueckzeit: b.rueckzeit || '', erstellt: b.erstellt || '',
      preis: Number(b.preis) || 0, anzahlung: Number(b.anzahlung) || 0, kaution: Number(b.kaution) || 0,
      kautionStatus: b.kautionStatus || (Number(b.kaution) > 0 ? 'offen' : 'keine'),
      status: b.status || 'bestaetigt', notiz: b.notiz || '',
      rechnung: b.rechnung || '', rechnungNr: b.rechnungNr || '',
      gcalEventId: b.gcalEventId || null, gcalSig: b.gcalSig || ''
    };
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
    state.ready = true;
  }

  async function replaceData(data) {
    const bookings = (data.buchungen || []).map((b, i) => norm(Object.assign({ id: 'b' + i }, b)));
    const arts = (data.artikel || []).map(normArt);
    const sperre = (data.sperrliste || []).map((e, i) => ({
      id: String(e.id || 's' + i), name: e.name || '', telefon: e.telefon || '', grund: e.grund || '', erstellt: e.erstellt || ''
    }));
    await DB.replaceAll('buchungen', bookings);
    await DB.replaceAll('artikel', arts);
    await DB.replaceAll('sperrliste', sperre);
    await DB.setMeta('importAt', new Date().toISOString());
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
      row('Notiz', b.notiz)
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
  function viewMonat(main) {
    const c = state.cursor, y = c.getFullYear(), mo = c.getMonth();
    main.append(h('div', { class: 'mnav' },
      h('button', { 'aria-label': 'Vorheriger Monat', onclick: () => { state.cursor = new Date(y, mo - 1, 1); render(); } }, '‹'),
      h('b', {}, MONTHS[mo] + ' ' + y),
      h('button', { 'aria-label': 'Nächster Monat', onclick: () => { state.cursor = new Date(y, mo + 1, 1); render(); } }, '›')));

    const grid = h('div', { class: 'grid' });
    DOW.forEach((d) => grid.append(h('div', { class: 'dow' }, d)));
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const rows = Math.ceil((lead + days) / 7);
    const start = new Date(y, mo, 1 - lead);
    const map = dayMap();
    const ts = iso(today0());
    for (let i = 0; i < rows * 7; i++) {
      const d = addDays(start, i), ds = iso(d), list = map[ds] || [];
      grid.append(h('button', {
        class: 'day' + (d.getMonth() !== mo ? ' out' : '') + (ds === ts ? ' today' : '') + (ds === state.sel ? ' sel' : ''),
        onclick: () => { state.sel = ds; render(); }
      },
        h('div', { class: 'dn' }, d.getDate()),
        list.slice(0, 2).map((b) => {
          const col = bookCatColor(b);
          return h('span', { class: 'pc' + (b.status === 'zurueck' ? ' done' : ''), style: 'border-left:3px solid ' + col + ';background:' + col + '26' },
            h('span', { class: 'pn' }, b.name || '—'));
        }),
        list.length > 2 ? h('div', { class: 'more' }, '+' + (list.length - 2)) : null));
    }
    main.append(grid);

    const sel = (map[state.sel] || []).slice().sort(sortByStart);
    main.append(h('h3', {}, fmtFull(state.sel)));
    if (sel.length) sel.forEach((b) => main.append(card(b)));
    else main.append(h('div', { class: 'empty' }, 'Keine Buchungen an diesem Tag.'));
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
  function viewMenu() {
    const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try {
        const data = parseImport(await f.text());
        if (state.bookings.length && !confirm('Vorhandene lokale Daten werden durch die Datei ersetzt. Fortfahren?')) return;
        await replaceData(data);
        state.menu = false;
        render();
        alert(state.bookings.length + ' Buchungen und ' + state.arts.length + ' Artikel geladen.');
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
      h('div', { class: 'stack' },
        h('button', { class: 'btn', onclick: () => file.click() }, 'Daten aus Datei laden (JSON)'),
        h('button', { class: 'btn sec', onclick: () => download('mietxpress-daten-' + iso(new Date()) + '.json',
          JSON.stringify({ version: 1, exportiert: new Date().toISOString(), buchungen: state.bookings, artikel: state.arts, sperrliste: state.sperre }, null, 1)) }, 'Backup speichern'),
        h('button', { class: 'btn sec', onclick: async () => {
          if (state.bookings.length && !confirm('Lokale Daten durch Beispieldaten ersetzen?')) return;
          await replaceData(demoData()); state.menu = false; render();
        } }, 'Beispieldaten laden (zum Ausprobieren)'),
        h('button', { class: 'btn warn', onclick: async () => {
          if (!confirm('Wirklich alle Daten auf diesem Gerät löschen?')) return;
          await DB.clearAll(); await load(); state.menu = false; render();
        } }, 'Alle lokalen Daten löschen'),
        file),
      h('p', { class: 'stand' }, 'Alle Daten liegen nur auf diesem Gerät und funktionieren ohne Internet.')));
  }

  // ===== Rendern =====
  function render() {
    const app = document.getElementById('app');
    const y = window.scrollY;
    app.replaceChildren();
    const wrap = h('div', { class: 'wrap' });
    wrap.append(h('header', {},
      h('div', { class: 'logo' }, h('i'), h('i'), h('i')),
      h('h1', {}, 'MietXpress'),
      h('span', { class: 'net ' + (state.online ? 'on' : 'off') }, state.online ? 'Online' : 'Offline'),
      h('button', { class: 'iconbtn', 'aria-label': 'Daten und Einstellungen', onclick: () => { state.menu = true; render(); } }, '⋯')));
    wrap.append(h('div', { class: 'tabs' }, [['monat', 'Monat'], ['liste', 'Liste'], ['bestand', 'Bestand']].map((t) =>
      h('button', { class: state.view === t[0] ? 'on' : '', onclick: () => { state.view = t[0]; render(); } }, t[1]))));

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
    else viewBestand(main);
    wrap.append(main);
    if (state.ready && state.importAt) wrap.append(h('div', { class: 'stand' }, 'Datenstand: ' + new Date(state.importAt).toLocaleString('de-DE')));
    app.append(wrap);
    if (state.menu) app.append(viewMenu());
    window.scrollTo(0, y);
  }

  // ===== Start =====
  window.addEventListener('online', () => { state.online = true; render(); });
  window.addEventListener('offline', () => { state.online = false; render(); });

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  render();
  load().then(render).catch((e) => {
    document.getElementById('app').replaceChildren(h('div', { class: 'wrap' }, h('div', { class: 'empty' }, 'Speicher nicht verfügbar: ' + e.message)));
  });
})();
