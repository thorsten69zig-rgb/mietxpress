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

  return { NAME, find, download, create, update };
})();
