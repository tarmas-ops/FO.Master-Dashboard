/**
 * Puente entre tu planilla de Google Sheets y el Family Office OS.
 *
 * Hace dos cosas:
 *   1. Entrega los datos de la planilla al dashboard cuando este los pide (doPost). El dashboard
 *      los lee al construirse, los valida y solo entonces los publica.
 *   2. Detecta cambios en la planilla y le pide a Vercel que reconstruya el dashboard
 *      (revisarCambios), con tope de publicaciones para no agotar el plan gratuito.
 *
 * Los datos nunca salen de aquí sin el token secreto. Se guarda en las propiedades de este
 * script (no en la planilla), de modo que quien tiene acceso de lectura a la planilla no lo ve.
 *
 * Instalación: ver LEEME.md en esta misma carpeta.
 */

// Pestañas que el dashboard necesita. Los nombres deben coincidir exactamente con los de tu planilla.
var TABS = [
  'Supuestos',
  'Perimetro_Familiar',
  'Liquidez',
  'Inversiones_Financieras',
  'Otras_Partidas',
  'Bienes_Raices',
  'Empresas',
  'Pasivos',
  'Flujo_Caja',
  'Balance_Consolidado'
];
// Pestañas opcionales: si existen se envían, si no, el dashboard usa su valor por defecto.
var OPTIONAL_TABS = ['Mapeo_Arriendos'];

// Cada cuánto se revisa si hubo cambios.
var CHECK_EVERY_MINUTES = 5;
// Una edición se publica solo cuando la planilla no cambió entre dos revisiones seguidas (evita
// publicar a medio editar): con revisiones cada 5 minutos, eso es entre 5 y 10 minutos de quietud.
// Separación mínima entre publicaciones y tope diario (el plan gratuito de Vercel permite 100 al día).
var MIN_MINUTES_BETWEEN_DEPLOYS = 15;
var MAX_DEPLOYS_PER_DAY = 20;

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Dashboard')
    .addItem('Configurar (una sola vez)', 'configurar')
    .addItem('Publicar ahora', 'publicarAhora')
    .addItem('Ver estado', 'verEstado')
    .addSeparator()
    .addItem('Regenerar token (si se filtró)', 'regenerarToken')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Entrega de datos al dashboard
// ---------------------------------------------------------------------------

/** El dashboard pide los datos con POST y el token. GET no entrega nada, para no filtrar datos por error. */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || !body.token || !safeEqual_(String(body.token), expected)) {
      return respond_({ error: 'No autorizado.' });
    }
    return respond_(snapshot_());
  } catch (err) {
    return respond_({ error: String((err && err.message) || err) });
  }
}

function doGet() {
  return respond_({ ok: true, mensaje: 'Este punto de acceso solo responde a solicitudes autorizadas.' });
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Lee las pestañas tal como se ven: los números como números y las fechas como aaaa-mm-dd. */
function snapshot_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheets = {};
  TABS.concat(OPTIONAL_TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      if (OPTIONAL_TABS.indexOf(name) < 0) throw new Error('Falta la pestaña "' + name + '".');
      return;
    }
    sheets[name] = sh.getDataRange().getValues().map(function (row) {
      return row.map(function (v) {
        return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
      });
    });
  });
  return { generatedAt: new Date().toISOString(), spreadsheetName: ss.getName(), sheets: sheets };
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Detección de cambios y publicación
// ---------------------------------------------------------------------------

function hashSnapshot_() {
  var sheets = snapshot_().sheets;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(sheets));
  return bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

/** Se ejecuta sola cada pocos minutos (la crea "Configurar"). */
function revisarCambios() {
  var props = PropertiesService.getScriptProperties();
  var hook = props.getProperty('DEPLOY_HOOK_URL');
  if (!hook) return;

  var current = hashSnapshot_();
  if (current === props.getProperty('LAST_HASH')) {
    props.deleteProperty('PENDING_HASH');
    return;
  }
  // Hubo un cambio. Se espera a que la planilla quede quieta: si cambió desde la revisión
  // anterior, alguien sigue editando y todavía no se publica.
  if (props.getProperty('PENDING_HASH') !== current) {
    props.setProperty('PENDING_HASH', current);
    return;
  }
  var sinceLast = Date.now() - Number(props.getProperty('LAST_DEPLOY_AT') || 0);
  if (sinceLast < MIN_MINUTES_BETWEEN_DEPLOYS * 60000) return; // se reintenta en la próxima revisión

  var result = desplegar_(props);
  if (result.ok) {
    props.setProperty('LAST_HASH', current);
    props.deleteProperty('PENDING_HASH');
  }
}

/** Pide a Vercel que reconstruya el dashboard. Respeta el tope diario. */
function desplegar_(props) {
  var hook = props.getProperty('DEPLOY_HOOK_URL');
  if (!hook) return { ok: false, motivo: 'Falta la URL del Deploy Hook. Usa Dashboard → Configurar.' };

  var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var stored = (props.getProperty('DEPLOYS_TODAY') || '').split(':');
  var count = stored[0] === day ? Number(stored[1]) : 0;
  if (count >= MAX_DEPLOYS_PER_DAY) {
    return { ok: false, motivo: 'Se alcanzó el tope de ' + MAX_DEPLOYS_PER_DAY + ' publicaciones por hoy.' };
  }

  var res = UrlFetchApp.fetch(hook, { method: 'post', muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) return { ok: false, motivo: 'Vercel respondió con el código ' + code + '.' };

  props.setProperty('DEPLOYS_TODAY', day + ':' + (count + 1));
  props.setProperty('LAST_DEPLOY_AT', String(Date.now()));
  return { ok: true };
}

/** Menú: publica sin esperar. Sigue respetando el tope diario. */
function publicarAhora() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var result = desplegar_(props);
  if (result.ok) {
    props.setProperty('LAST_HASH', hashSnapshot_());
    props.deleteProperty('PENDING_HASH');
    ui.alert('Publicación solicitada', 'El dashboard se actualizará en uno o dos minutos. Si hay un error en los datos, la versión anterior se mantiene.', ui.ButtonSet.OK);
  } else {
    ui.alert('No se pudo publicar', result.motivo, ui.ButtonSet.OK);
  }
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

function configurar() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty('API_TOKEN')) {
    props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }

  var answer = ui.prompt(
    'Deploy Hook de Vercel',
    'Pega aquí la URL del Deploy Hook (Vercel → tu proyecto → Settings → Git → Deploy Hooks).\n' +
      'Si ya la configuraste y no quieres cambiarla, deja el campo vacío.',
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() === ui.Button.CANCEL) return;
  var hook = answer.getResponseText().trim();
  if (hook) {
    if (hook.indexOf('https://api.vercel.com/v1/integrations/deploy/') !== 0) {
      ui.alert('Esa URL no parece un Deploy Hook de Vercel', 'Debe empezar con https://api.vercel.com/v1/integrations/deploy/', ui.ButtonSet.OK);
      return;
    }
    props.setProperty('DEPLOY_HOOK_URL', hook);
  }

  // Un solo disparador de revisión: se eliminan los anteriores para no duplicarlo.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCambios') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarCambios').timeBased().everyMinutes(CHECK_EVERY_MINUTES).create();
  // Se toma la planilla actual como "ya publicada": el primer cambio posterior dispara la publicación.
  props.setProperty('LAST_HASH', hashSnapshot_());
  props.deleteProperty('PENDING_HASH');

  mostrarCredenciales_();
}

/** Invalida el token anterior y genera uno nuevo. Hay que copiarlo de nuevo a Vercel (SHEETS_TOKEN). */
function regenerarToken() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    'Regenerar token',
    'El token actual dejará de funcionar y tendrás que pegar el nuevo en Vercel (SHEETS_TOKEN). ¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  mostrarCredenciales_();
}

function mostrarCredenciales_() {
  var token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  var url = ScriptApp.getService().getUrl() || '(todavía no hay una implementación: sigue el paso de "Implementar" del LEEME)';
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.5">' +
      '<p>Copia estos dos valores en Vercel, en <b>Settings → Environment Variables</b>:</p>' +
      '<p><b>SHEETS_ENDPOINT</b></p>' +
      '<input readonly style="width:100%;padding:6px" value="' + escapeHtml_(url) + '" onclick="this.select()">' +
      '<p><b>SHEETS_TOKEN</b></p>' +
      '<input readonly style="width:100%;padding:6px" value="' + escapeHtml_(token) + '" onclick="this.select()">' +
      '<p style="color:#b00">El token es como una contraseña: no lo compartas ni lo pegues en chats o correos.</p>' +
      '</div>'
  )
    .setWidth(520)
    .setHeight(330);
  SpreadsheetApp.getUi().showModalDialog(html, 'Configuración lista');
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

function verEstado() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var faltan = TABS.filter(function (n) {
    return !ss.getSheetByName(n);
  });
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'revisarCambios';
  });
  var last = Number(props.getProperty('LAST_DEPLOY_AT') || 0);
  var stored = (props.getProperty('DEPLOYS_TODAY') || '').split(':');
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var lines = [
    'Pestañas requeridas: ' + (faltan.length === 0 ? 'todas presentes' : 'FALTAN ' + faltan.join(', ')),
    'Mapeo de arriendos: ' + (ss.getSheetByName('Mapeo_Arriendos') ? 'presente' : 'no existe (el dashboard usa el que trae incluido)'),
    'Token de acceso: ' + (props.getProperty('API_TOKEN') ? 'configurado' : 'FALTA (usa Configurar)'),
    'Deploy Hook de Vercel: ' + (props.getProperty('DEPLOY_HOOK_URL') ? 'configurado' : 'FALTA (usa Configurar)'),
    'Revisión automática: ' + (activo ? 'activa, cada ' + CHECK_EVERY_MINUTES + ' minutos' : 'INACTIVA (usa Configurar)'),
    'Última publicación: ' + (last ? Utilities.formatDate(new Date(last), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm') : 'ninguna todavía'),
    'Publicaciones hoy: ' + (stored[0] === today ? stored[1] : 0) + ' de ' + MAX_DEPLOYS_PER_DAY
  ];
  SpreadsheetApp.getUi().alert('Estado del dashboard', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
