#!/usr/bin/env node
// ─────────────────────────────────────────────
//  autopush.js — Programacion auto git watcher
//  Uso: node autopush.js
//  Hace git add + commit + push cada vez que
//  guardas un archivo del proyecto.
// ─────────────────────────────────────────────

var fs    = require('fs');
var path  = require('path');
var { execSync, spawnSync } = require('child_process');

// ── CONFIG ────────────────────────────────────
var WATCH_EXTENSIONS = ['.html', '.css', '.js', '.json'];
var IGNORE_DIRS      = ['node_modules', '.git'];
var DEBOUNCE_MS      = 1500;   // espera 1.5s tras el último guardado antes de hacer commit
var BRANCH           = '';     // vacío = rama actual; o pon 'main' para forzar
var REMOTE_URL       = 'https://github.com/manuelcespedesrguez-ux/Marcas.git';
// ─────────────────────────────────────────────

var ROOT = process.cwd();
var timer = null;
var pendingFiles = new Set();

function log(msg) {
  var t = new Date().toLocaleTimeString('es-ES');
  console.log('[' + t + '] ' + msg);
}

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
  } catch(e) {
    return 'main';
  }
}

function hasChanges() {
  try {
    var result = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT });
    return result.stdout.toString().trim().length > 0;
  } catch(e) {
    return false;
  }
}

function doCommitAndPush(files) {
  if (!hasChanges()) {
    log('Sin cambios que commitear.');
    return;
  }

  var branch = BRANCH || getCurrentBranch();
  var names  = Array.from(files).map(function(f){ return path.relative(ROOT, f); });
  var msg    = 'auto: ' + names.join(', ');

  // Recortar mensaje si es muy largo
  if (msg.length > 72) msg = 'auto: ' + names.length + ' archivo(s) actualizado(s)';

  try {
    execSync('git add .', { cwd: ROOT, stdio: 'inherit' });
    execSync('git commit -m "' + msg.replace(/"/g, '\\"') + '"', { cwd: ROOT, stdio: 'inherit' });
    execSync('git push origin ' + branch, { cwd: ROOT, stdio: 'inherit' });
    log('✅ Push OK → ' + branch + ' | ' + msg);
  } catch(e) {
    log('❌ Error en git: ' + e.message);
  }

  pendingFiles.clear();
}

function onFileChanged(filepath) {
  var ext = path.extname(filepath);
  if (!WATCH_EXTENSIONS.includes(ext)) return;

  // Ignorar directorios bloqueados
  var rel = path.relative(ROOT, filepath);
  for (var i = 0; i < IGNORE_DIRS.length; i++) {
    if (rel.startsWith(IGNORE_DIRS[i] + path.sep) || rel.startsWith(IGNORE_DIRS[i] + '/')) return;
  }

  pendingFiles.add(filepath);
  log('📝 Cambio detectado: ' + rel);

  // Debounce: resetea el timer en cada guardado
  if (timer) clearTimeout(timer);
  timer = setTimeout(function() {
    doCommitAndPush(pendingFiles);
  }, DEBOUNCE_MS);
}

function watchDir(dir) {
  var entries;
  try { entries = fs.readdirSync(dir); } catch(e) { return; }

  // Vigila el propio directorio
  try {
    fs.watch(dir, function(event, filename) {
      if (!filename) return;
      var full = path.join(dir, filename);
      onFileChanged(full);
    });
  } catch(e) {}

  // Recursivo en subdirectorios (excepto los ignorados)
  entries.forEach(function(entry) {
    if (IGNORE_DIRS.includes(entry)) return;
    var full = path.join(dir, entry);
    try {
      if (fs.statSync(full).isDirectory()) watchDir(full);
    } catch(e) {}
  });
}

function ensureRemote() {
  try {
    // Comprobar si ya existe el remote 'origin'
    var result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT });
    var currentUrl = result.stdout.toString().trim();

    if (result.status !== 0) {
      // No existe origin → añadirlo
      execSync('git remote add origin ' + REMOTE_URL, { cwd: ROOT });
      log('🔗 Remote añadido: ' + REMOTE_URL);
    } else if (currentUrl !== REMOTE_URL) {
      // Existe pero apunta a otro sitio → actualizarlo
      execSync('git remote set-url origin ' + REMOTE_URL, { cwd: ROOT });
      log('🔗 Remote actualizado: ' + REMOTE_URL);
    } else {
      log('🔗 Remote OK: ' + REMOTE_URL);
    }
  } catch(e) {
    log('⚠️  No se pudo configurar el remote: ' + e.message);
  }
}

function ensureGitRepo() {
  var gitDir = path.join(ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    try {
      execSync('git init', { cwd: ROOT, stdio: 'inherit' });
      log('📁 Repositorio git inicializado.');
    } catch(e) {
      log('❌ No se pudo inicializar git: ' + e.message);
      process.exit(1);
    }
  }
}

// ── ARRANQUE ──────────────────────────────────
console.log('');
console.log('  Marcas AutoPush');
console.log('  Repo: ' + REMOTE_URL);
console.log('  Vigilando: ' + ROOT);
console.log('  Extensiones: ' + WATCH_EXTENSIONS.join(' '));
console.log('  Debounce: ' + DEBOUNCE_MS + 'ms');
console.log('  Ctrl+C para parar');
console.log('');

ensureGitRepo();
ensureRemote();
watchDir(ROOT);
log('👀 Esperando cambios...');
