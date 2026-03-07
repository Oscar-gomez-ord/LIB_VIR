# LIB_VIR

ingresar con: // ╔══════════════════════════════════════════════════════════════╗
// ║           BOOKFLOW — Google Apps Script Backend v2           ║
// ║                                                              ║
// ║  INSTRUCCIONES DE INSTALACIÓN:                               ║
// ║  1. Abre Google Sheets y crea una hoja nueva (vacía)         ║
// ║  2. Ve a Extensiones → Apps Script                           ║
// ║  3. Borra el código por defecto y pega este archivo          ║
// ║  4. Guarda (Ctrl+S)                                          ║
// ║  5. Click "Implementar" → "Nueva implementación"             ║
// ║     · Tipo: Aplicación web                                   ║
// ║     · Ejecutar como: Yo                                      ║
// ║     · Acceso: Cualquier persona (incluso anónima)            ║
// ║  6. Autoriza los permisos cuando se pida                     ║
// ║  7. Copia la URL que aparece y pégala en BookFlow            ║
// ║                                                              ║
// ║  ⚠️  Si modificas el script: Implementar →                   ║
// ║      "Administrar implementaciones" → editar versión         ║
// ╚══════════════════════════════════════════════════════════════╝

const SPREADSHEET_ID  = SpreadsheetApp.getActiveSpreadsheet().getId();
const REQUIRED_TABS   = ['Usuarios', 'Clientes', 'Ventas', 'Visitas'];

// ════════════════════════════════════════════════════════════════
//  ENTRY POINT — sólo doGet (evita problemas de CORS con POST)
// ════════════════════════════════════════════════════════════════

function doGet(e) {
  try {
    ensureTabsExist();

    // Operaciones de escritura enviadas como GET con ?payload=…
    if (e.parameter.payload) {
      var body = JSON.parse(decodeURIComponent(e.parameter.payload));
      return jsonResponse(handleAction(body));
    }

    // Lectura: ?action=read&tab=NombreHoja
    if (e.parameter.action === 'read' && e.parameter.tab) {
      var rows = readSheet(e.parameter.tab);
      return jsonResponse({ ok: true, rows: rows });
    }

    return jsonResponse({ ok: false, error: 'Parametros no reconocidos' });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// doPost por compatibilidad
function doPost(e) {
  try {
    ensureTabsExist();
    var body = JSON.parse(e.postData.contents);
    return jsonResponse(handleAction(body));
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ════════════════════════════════════════════════════════════════
//  DISPATCHER
// ════════════════════════════════════════════════════════════════

function handleAction(body) {
  switch (body.action) {
    case 'write':     return writeRows(body.tab, body.rows);
    case 'updateRow': return updateRow(body.tab, body.idField, body.idValue, body.updates);
    case 'deleteRow': return deleteRow(body.tab, body.idField, body.idValue);
    default:          return { ok: false, error: 'Accion desconocida: ' + body.action };
  }
}

// ════════════════════════════════════════════════════════════════
//  CRUD
// ════════════════════════════════════════════════════════════════

function readSheet(tabName) {
  var sheet = getOrCreateSheet(tabName);
  var data  = sheet.getDataRange().getValues();

  if (data.length < 2) return [];

  var headers = data[0].map(function(h){ return String(h).trim(); });

  return data.slice(1)
    .filter(function(row){
      return row.some(function(c){ return c !== '' && c !== null && c !== undefined; });
    })
    .map(function(row){
      var obj = {};
      headers.forEach(function(h, i){ obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });
}

function writeRows(tabName, rows) {
  if (!rows || rows.length === 0) return { ok: false, error: 'No hay filas para escribir' };

  var sheet   = getOrCreateSheet(tabName);
  var allData = sheet.getDataRange().getValues();
  var headers;

  var isEmpty = allData.length === 0 ||
    (allData.length === 1 && allData[0].every(function(c){ return c === ''; }));

  if (isEmpty) {
    headers = Object.keys(rows[0]);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers = allData[0].map(function(h){ return String(h).trim(); });
  }

  var newRows = rows.map(function(row){
    return headers.map(function(h){
      var v = row[h];
      return (v !== undefined && v !== null) ? v : '';
    });
  });

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, headers.length).setValues(newRows);

  return { ok: true, written: newRows.length };
}

function updateRow(tabName, idField, idValue, updates) {
  var sheet   = getOrCreateSheet(tabName);
  var allData = sheet.getDataRange().getValues();

  if (allData.length < 2) return { ok: false, error: 'Hoja vacia' };

  var headers  = allData[0].map(function(h){ return String(h).trim(); });
  var idColIdx = headers.indexOf(idField);

  if (idColIdx === -1) return { ok: false, error: "Columna '" + idField + "' no encontrada" };

  for (var r = 1; r < allData.length; r++) {
    if (String(allData[r][idColIdx]) === String(idValue)) {
      Object.keys(updates).forEach(function(key){
        var colIdx = headers.indexOf(key);
        if (colIdx === -1) {
          headers.push(key);
          colIdx = headers.length - 1;
          sheet.getRange(1, colIdx + 1).setValue(key);
        }
        var v = updates[key];
        sheet.getRange(r + 1, colIdx + 1).setValue(v !== null && v !== undefined ? v : '');
      });
      return { ok: true, updated: 1 };
    }
  }

  return { ok: false, error: idField + '=' + idValue + ' no encontrado' };
}

function deleteRow(tabName, idField, idValue) {
  var sheet   = getOrCreateSheet(tabName);
  var allData = sheet.getDataRange().getValues();

  if (allData.length < 2) return { ok: false, error: 'Hoja vacia' };

  var headers  = allData[0].map(function(h){ return String(h).trim(); });
  var idColIdx = headers.indexOf(idField);

  if (idColIdx === -1) return { ok: false, error: "Columna '" + idField + "' no encontrada" };

  for (var r = 1; r < allData.length; r++) {
    if (String(allData[r][idColIdx]) === String(idValue)) {
      sheet.deleteRow(r + 1);
      return { ok: true, deleted: 1 };
    }
  }

  return { ok: false, error: idField + '=' + idValue + ' no encontrado' };
}

// ════════════════════════════════════════════════════════════════
//  UTILIDADES
// ════════════════════════════════════════════════════════════════

function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureTabsExist() {
  REQUIRED_TABS.forEach(function(tab){ getOrCreateSheet(tab); });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
//  SETUP INICIAL — ejecuta manualmente UNA VEZ desde el editor
// ════════════════════════════════════════════════════════════════

function setupInicial() {
  ensureTabsExist();

  var sheet = getOrCreateSheet('Usuarios');
  var datos = sheet.getDataRange().getValues();

  if (datos.length < 2) {
    var headers = ['id', 'name', 'pin', 'role'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(2, 1, 1, headers.length).setValues([
      [String(Date.now()), 'Admin', '1234', 'admin']
    ]);
    Logger.log('Admin creado con PIN 1234');
  } else {
    Logger.log('Ya hay usuarios registrados');
  }

  Logger.log('Hojas listas: ' + REQUIRED_TABS.join(', '));
}
