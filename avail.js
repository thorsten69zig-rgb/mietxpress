/* Verfügbarkeits-Logik (reine Funktionen, keine Oberfläche, keine Kundendaten im Ergebnis,
   außer in hitsFor() für die interne App). Wird von der internen App genutzt und ist so
   gebaut, dass der spätere öffentliche Kunden-Buchungskalender sie wiederverwenden kann
   (publicDay() liefert nur Artikel, Menge und freie Stückzahl).

   Regeln wie im bisherigen Artefakt:
   - stornierte Buchungen zählen nicht
   - Pakete (artikel.enthaelt) belegen ihre Bestandteile mit
   - ein Artikel mit enthaelt wird gesperrt, sobald ein Bestandteil gebucht ist ("blocker") */
const Avail = (function () {
  function artByName(arts, name) {
    for (let i = 0; i < arts.length; i++) if (arts[i].name === name) return arts[i];
    return null;
  }

  function positionsOf(b, arts) {
    if (b.positionen && b.positionen.length) {
      return b.positionen.map((p) => ({ artikel: p.artikel, anzahl: Number(p.anzahl) || 1 }));
    }
    const txt = (b.artikel || '').toLowerCase();
    const out = [];
    if (!txt) return out;
    arts.forEach((a) => { if (txt.indexOf(a.name.toLowerCase()) > -1) out.push({ artikel: a.name, anzahl: 1 }); });
    return out;
  }

  // Alle Buchungstreffer für einen Artikel im Zeitraum s..e (ISO-Datum, inklusive)
  function hitsFor(bookings, arts, artName, s, e) {
    const res = [];
    const me = artByName(arts, artName);
    bookings.forEach((b) => {
      if (b.status === 'storniert' || b.start > e || b.ende < s) return;
      positionsOf(b, arts).forEach((p) => {
        if (p.artikel === artName) res.push({ b, anzahl: p.anzahl });
        const pa = artByName(arts, p.artikel);
        if (pa && pa.enthaelt && p.artikel !== artName) {
          pa.enthaelt.forEach((c) => {
            if (c.artikel === artName) res.push({ b, anzahl: (Number(c.anzahl) || 1) * p.anzahl, via: p.artikel });
          });
        }
        if (me && me.enthaelt && p.artikel !== artName) {
          me.enthaelt.forEach((c) => {
            if (c.artikel === p.artikel) res.push({ b, anzahl: 1, blocker: p.artikel });
          });
        }
      });
    });
    return res;
  }

  // Zustand eines Artikels im Zeitraum: frei / teils / vergeben
  function status(bookings, arts, art, s, e) {
    const hits = hitsFor(bookings, arts, art.name, s, e);
    const real = hits.filter((x) => !x.blocker).reduce((t, x) => t + x.anzahl, 0);
    const blocked = hits.some((x) => x.blocker);
    const m = art.menge;
    let state = 'frei';
    let frei = m == null ? null : m;
    if (blocked || (m != null && real >= m)) { state = 'vergeben'; frei = 0; }
    else if (m != null && m > 1 && real > 0) { state = 'teils'; frei = m - real; }
    else if (m == null && real > 0) { state = 'teils'; }
    else if (m != null) { frei = m - real; }
    return { state, frei, menge: m, vergeben: real, blocked, hits };
  }

  // Öffentlich unbedenkliche Sicht auf einen Tag: nur Artikel, Menge, freie Stückzahl
  function publicDay(bookings, arts, ds) {
    return arts.map((a) => {
      const st = status(bookings, arts, a, ds, ds);
      return { artikel: a.name, kategorie: a.kategorie, menge: st.menge, frei: st.frei, zustand: st.state };
    });
  }

  return { artByName, positionsOf, hitsFor, status, publicDay };
})();
