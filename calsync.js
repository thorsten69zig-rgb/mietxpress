/* Buchungen in den Google-Kalender "Müllers MietXpress" eintragen (gleiches Format wie bisher im Artefakt).
   Reine Funktionen (fields/sig/event/plan) + ein Ausführer (run), der über GCAL schreibt. */
const CALSYNC = (function () {
  const STATUS = { angefragt: 'Angefragt', bestaetigt: 'Bestätigt', abgeholt: 'Abgeholt', zurueck: 'Zurück', storniert: 'Storniert' };
  const pad = (n) => String(n).padStart(2, '0');
  const parse = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nextDay = (s) => { const d = parse(s); return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)); };
  const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const isDemo = (id) => /^demo\d+$/.test(String(id));

  const title = (b) => (b.artikel || 'Buchung') + (b.name ? ' – ' + b.name : '');

  function description(b) {
    const lines = [];
    if (b.name) lines.push('Kunde: ' + b.name);
    if (b.telefon) lines.push('Telefon: ' + b.telefon);
    if (b.adresse) lines.push('Adresse: ' + b.adresse);
    if (b.plattform) lines.push('Plattform: ' + b.plattform);
    lines.push('Status: ' + (STATUS[b.status] || b.status));
    if (b.preis) lines.push('Preis: ' + eur(b.preis));
    if (b.notiz) lines.push('Notiz: ' + b.notiz);
    return lines.join('\n');
  }

  // Unterschrift der Daten, die im Kalender stehen – ändert sie sich, wird der Termin nachgezogen
  const sig = (b) => [b.artikel, b.name, b.telefon, b.adresse, b.plattform, b.start, b.ende, b.abholzeit, b.rueckzeit, b.status, b.notiz, b.preis].join('|');

  function event(b) {
    const ev = { summary: title(b), description: description(b) };
    const ende = b.ende || b.start;
    if (!(b.abholzeit || b.rueckzeit)) {
      ev.start = { date: b.start };
      ev.end = { date: nextDay(ende) };
    } else {
      ev.start = { dateTime: b.start + 'T' + (b.abholzeit || '09:00') + ':00', timeZone: 'Europe/Berlin' };
      ev.end = { dateTime: ende + 'T' + (b.rueckzeit || b.abholzeit || '18:00') + ':00', timeZone: 'Europe/Berlin' };
    }
    return ev;
  }

  // Was ist zu tun? (Regeln wie im Artefakt: Alt-Buchungen, die von Hand im Kalender stehen
  // (kalender "ja"/"abweichend" ohne Termin-ID), werden nie doppelt angelegt.)
  function plan(bookings, delIds) {
    const actions = [];
    (bookings || []).forEach((b) => {
      if (isDemo(b.id)) return;
      if (b.status === 'storniert') { if (b.gcalEventId) actions.push({ op: 'delete', b }); return; }
      if (!b.gcalEventId && (b.kalender === 'ja' || b.kalender === 'abweichend')) return;
      if (b.gcalEventId && b.gcalSig === sig(b)) return;
      actions.push({ op: b.gcalEventId ? 'update' : 'create', b });
    });
    return { actions, dels: (delIds || []).slice() };
  }

  // Ausführen. onPatch(id, {gcalEventId, gcalSig}) wird nach jedem Erfolg gerufen (sofort speichern,
  // damit nach einem Abbruch nichts doppelt angelegt wird). onDel(eventId) nach erledigter Löschung.
  async function run(pl, calId, G, onPatch, onDel) {
    const stat = { neu: 0, geaendert: 0, geloescht: 0 };
    for (const eventId of pl.dels) {
      await G.deleteEvent(calId, eventId);
      await onDel(eventId);
      stat.geloescht++;
    }
    for (const a of pl.actions) {
      const b = a.b;
      if (a.op === 'delete') {
        await G.deleteEvent(calId, b.gcalEventId);
        await onPatch(b.id, { gcalEventId: null, gcalSig: null });
        stat.geloescht++;
      } else if (a.op === 'update') {
        const r = await G.updateEvent(calId, b.gcalEventId, event(b));
        if (r && r.gone) {
          const c = await G.createEvent(calId, event(b));
          await onPatch(b.id, { gcalEventId: c.id, gcalSig: sig(b) });
          stat.neu++;
        } else {
          await onPatch(b.id, { gcalSig: sig(b) });
          stat.geaendert++;
        }
      } else {
        const c = await G.createEvent(calId, event(b));
        await onPatch(b.id, { gcalEventId: c.id, gcalSig: sig(b) });
        stat.neu++;
      }
    }
    return stat;
  }

  return { title, description, sig, event, plan, run };
})();
