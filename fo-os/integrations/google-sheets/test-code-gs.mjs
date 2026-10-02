/**
 * Prueba de la lógica de Code.gs con servicios de Google simulados.
 *   npm run check-appsscript
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ok ' : ' FALLA'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};

function makeWorld() {
  const world = { now: Date.UTC(2026, 9, 2, 12, 0, 0), props: new Map(), fetches: [], hookStatus: 200, triggers: [], data: {} };
  const TABS = ['Supuestos', 'Perimetro_Familiar', 'Liquidez', 'Inversiones_Financieras', 'Otras_Partidas', 'Bienes_Raices', 'Empresas', 'Pasivos', 'Flujo_Caja', 'Balance_Consolidado'];
  TABS.forEach((t) => (world.data[t] = [['x', 1]]));

  class FakeDate extends Date {
    constructor(...a) { super(...(a.length ? a : [world.now])); }
    static now() { return world.now; }
  }
  const pad = (n) => String(n).padStart(2, '0');
  const sandbox = {
    Date: FakeDate,
    console,
    JSON,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (world.props.has(k) ? world.props.get(k) : null),
        setProperty: (k, v) => world.props.set(k, String(v)),
        deleteProperty: (k) => world.props.delete(k),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getName: () => 'Planilla de prueba',
        getSpreadsheetTimeZone: () => 'America/Santiago',
        getSheetByName: (n) => (world.data[n] ? { getDataRange: () => ({ getValues: () => world.data[n] }) } : null),
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_alg, str) => [...crypto.createHash('sha256').update(str).digest()].map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, _tz, fmt) => {
        const x = new Date(d.getTime());
        const m = { yyyy: x.getUTCFullYear(), MM: pad(x.getUTCMonth() + 1), dd: pad(x.getUTCDate()), HH: pad(x.getUTCHours()), mm: pad(x.getUTCMinutes()) };
        return fmt.replace(/yyyy|MM|dd|HH|mm/g, (k) => m[k]);
      },
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        world.fetches.push({ url, opts });
        return { getResponseCode: () => world.hookStatus };
      },
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    Session: { getScriptTimeZone: () => 'America/Santiago' },
    ScriptApp: { getProjectTriggers: () => world.triggers, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }) },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setWidth() { return this; }, setHeight() { return this; } }) },
    ui: { dialogs: [], answer: 'YES' },
  };
  const ui = {
    Button: { YES: 'YES', NO: 'NO' }, ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
    alert: (...a) => { sandbox.ui.dialogs.push(a.join(' | ')); return sandbox.ui.answer; },
    showModalDialog: (out) => sandbox.ui.dialogs.push(out.html),
  };
  sandbox.SpreadsheetApp.getUi = () => ui;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), sandbox);
  return { world, sandbox };
}

const call = (sb, body) => JSON.parse(sb.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

// ---- Entrega de datos ----
{
  const { world, sandbox } = makeWorld();
  world.props.set('API_TOKEN', 'a'.repeat(64));
  check('sin token no entrega datos', call(sandbox, {}).error === 'No autorizado.');
  check('token incorrecto no entrega datos', call(sandbox, { token: 'b'.repeat(64) }).error === 'No autorizado.');
  check('token de otro largo no entrega datos', call(sandbox, { token: 'a' }).error === 'No autorizado.');
  const ok = call(sandbox, { token: 'a'.repeat(64) });
  check('token correcto entrega las pestañas', ok.sheets && Object.keys(ok.sheets).length === 10 && ok.spreadsheetName === 'Planilla de prueba');
  check('GET no entrega datos', JSON.parse(sandbox.doGet().getContent()).sheets === undefined);
  delete world.data['Pasivos'];
  check('pestaña faltante responde con error claro', /Falta la pestaña "Pasivos"/.test(call(sandbox, { token: 'a'.repeat(64) }).error || ''));
}

// ---- Publicación ----
const minutes = (w, m) => (w.now += m * 60000);
function setup() {
  const { world, sandbox } = makeWorld();
  world.props.set('API_TOKEN', 't'.repeat(64));
  world.props.set('DEPLOY_HOOK_URL', 'https://api.vercel.com/v1/integrations/deploy/prj_x/abc');
  world.props.set('LAST_HASH', vm.runInContext('hashSnapshot_()', sandbox)); // la planilla actual ya está publicada
  return { world, sandbox };
}
const edit = (w, v) => (w.data['Liquidez'] = [['x', v]]);
const tick = (sb) => sb.revisarCambios();

{
  const { world, sandbox } = setup();
  tick(sandbox);
  check('sin cambios no publica', world.fetches.length === 0);

  edit(world, 2);
  minutes(world, 5); tick(sandbox);
  check('un cambio recién visto todavía no publica (puede estar editándose)', world.fetches.length === 0);
  minutes(world, 5); tick(sandbox);
  check('el mismo cambio, estable en dos revisiones, publica una vez', world.fetches.length === 1);
  minutes(world, 5); tick(sandbox);
  check('después de publicar no vuelve a publicar lo mismo', world.fetches.length === 1);
}
{
  const { world, sandbox } = setup();
  edit(world, 2); minutes(world, 5); tick(sandbox);
  edit(world, 3); minutes(world, 5); tick(sandbox); // siguió editando
  check('si sigue cambiando entre revisiones, no publica', world.fetches.length === 0);
  minutes(world, 5); tick(sandbox);
  check('cuando se queda quieto, publica la versión final', world.fetches.length === 1);
}
{
  const { world, sandbox } = setup();
  edit(world, 2); minutes(world, 5); tick(sandbox); minutes(world, 5); tick(sandbox); // publica
  edit(world, 3); minutes(world, 5); tick(sandbox); minutes(world, 5); tick(sandbox);
  check('respeta el intervalo mínimo entre publicaciones', world.fetches.length === 1);
  minutes(world, 10); tick(sandbox);
  check('pasado el intervalo, publica el cambio pendiente', world.fetches.length === 2);
}
{
  const { world, sandbox } = setup();
  world.hookStatus = 500;
  edit(world, 2); minutes(world, 5); tick(sandbox); minutes(world, 5); tick(sandbox);
  check('si Vercel falla, lo intenta y no da el cambio por publicado', world.fetches.length === 1 && world.props.get('LAST_HASH') !== vm.runInContext('hashSnapshot_()', sandbox));
  world.hookStatus = 200;
  minutes(world, 20); tick(sandbox);
  check('y lo reintenta en la siguiente revisión', world.fetches.length === 2 && world.props.get('LAST_HASH') === vm.runInContext('hashSnapshot_()', sandbox));
}
{
  const { world, sandbox } = setup();
  for (let i = 0; i < 25; i++) {
    edit(world, 100 + i); minutes(world, 20); tick(sandbox); minutes(world, 20); tick(sandbox);
    if (world.now > Date.UTC(2026, 9, 2, 23, 0, 0)) break;
  }
  check('respeta el tope de publicaciones por día', world.fetches.length <= 20, `${world.fetches.length} publicaciones`);
}
{
  const { world, sandbox } = setup();
  world.props.delete('DEPLOY_HOOK_URL');
  edit(world, 2); minutes(world, 5); tick(sandbox); minutes(world, 5); tick(sandbox);
  check('sin Deploy Hook configurado no hace nada', world.fetches.length === 0);
}

// ---- Regenerar token ----
{
  const { world, sandbox } = makeWorld();
  world.props.set('API_TOKEN', 'a'.repeat(64));
  sandbox.ui.answer = 'NO';
  sandbox.regenerarToken();
  check('regenerar token pide confirmación y, si se cancela, no cambia nada', world.props.get('API_TOKEN') === 'a'.repeat(64));
  sandbox.ui.answer = 'YES';
  sandbox.regenerarToken();
  const nuevo = world.props.get('API_TOKEN');
  check('regenerar token deja uno nuevo de 64 caracteres', nuevo !== 'a'.repeat(64) && /^[0-9a-f]{64}$/.test(nuevo));
  check('el token anterior deja de funcionar', call(sandbox, { token: 'a'.repeat(64) }).error === 'No autorizado.');
  check('el token nuevo funciona', !!call(sandbox, { token: nuevo }).sheets);
  check('muestra el token nuevo en pantalla para copiarlo', sandbox.ui.dialogs.some((d) => d.includes(nuevo)));
}

console.log(failed === 0 ? '\nAPPS SCRIPT: OK' : `\nAPPS SCRIPT: ${failed} caso(s) fallaron`);
process.exit(failed === 0 ? 0 : 1);
