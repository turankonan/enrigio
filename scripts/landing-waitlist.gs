/**
 * Google Apps Script web app that stores the landing page's early-access and
 * contact form submissions in the Google Sheet it is bound to.
 *
 * Setup: Extensions → Apps Script in the sheet, paste this file, then
 * Deploy → New deployment → Web app, execute as "Me", access "Anyone".
 * The landing page posts JSON as text/plain so the browser skips the CORS
 * preflight, which Apps Script web apps cannot answer.
 */

var SHEETS = {
  signup: {
    name: 'Erken erişim',
    headers: ['Tarih', 'Site', 'E-posta', 'Dil'],
  },
  contact: {
    name: 'İletişim',
    headers: ['Tarih', 'Ad soyad', 'E-posta', 'Şirket', 'Telefon', 'Kapsam', 'Not', 'Dil'],
  },
};

var MIN_ELAPSED_MS = 2000;
// Apps Script cannot see the client IP, so flooding is capped site-wide.
var MAX_ROWS_PER_HOUR = 100;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var SITE_RE = /^([a-z0-9çğıöşü-]+\.)+[a-z]{2,}$/i;

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply({ ok: false, error: 'invalid' });
  }

  // Bots get a success reply so they have no signal to adapt to.
  if (clean(body.company_url, 200)) return reply({ ok: true });
  if (!(Number(body.elapsed_ms) >= MIN_ELAPSED_MS)) return reply({ ok: true });

  var kind = body.kind === 'contact' ? 'contact' : body.kind === 'signup' ? 'signup' : null;
  if (!kind) return reply({ ok: false, error: 'invalid' });

  var lang = body.lang === 'en' ? 'en' : 'tr';
  var email = clean(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return reply({ ok: false, error: 'invalid' });

  var row;
  if (kind === 'signup') {
    var site = clean(body.site, 253)
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
    if (!SITE_RE.test(site)) return reply({ ok: false, error: 'invalid' });
    row = [new Date(), site, email, lang];
  } else {
    var name = clean(body.name, 120);
    var company = clean(body.company, 160);
    if (!name || !company) return reply({ ok: false, error: 'invalid' });
    row = [
      new Date(),
      name,
      email,
      company,
      clean(body.phone, 40),
      clean(body.scope, 200),
      clean(body.note, 2000),
      lang,
    ];
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reply({ ok: false, error: 'busy' });
  try {
    if (!underHourlyCap()) return reply({ ok: false, error: 'busy' });
    var sheet = sheetFor(kind);
    // A repeat signup is a success that adds no second row.
    if (kind === 'signup' && hasEmail(sheet, email)) return reply({ ok: true });
    sheet.appendRow(row.map(safeCell));
    return reply({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true });
}

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

// A leading = + - @ would make Sheets treat submitted text as a formula.
function safeCell(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function sheetFor(kind) {
  var spec = SHEETS[kind];
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(spec.name);
  if (!sheet) {
    sheet = book.insertSheet(spec.name);
    sheet.appendRow(spec.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, spec.headers.length).setFontWeight('bold');
  }
  return sheet;
}

function hasEmail(sheet, email) {
  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return false;
  var column = SHEETS.signup.headers.indexOf('E-posta') + 1;
  var values = sheet.getRange(2, column, rows, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === email) return true;
  }
  return false;
}

function underHourlyCap() {
  var cache = CacheService.getScriptCache();
  var key = 'rows-' + Math.floor(Date.now() / 3600000);
  var count = Number(cache.get(key) || 0);
  if (count >= MAX_ROWS_PER_HOUR) return false;
  cache.put(key, String(count + 1), 3600);
  return true;
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
