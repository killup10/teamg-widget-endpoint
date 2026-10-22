const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const isWin = process.platform === 'win32';
const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const binDir = path.join(__dirname, '..', 'bin');
const binPath = path.join(binDir, binName);

function downloadFile(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Demasiadas redirecciones'));
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode + ' al descargar ' + url));
      }
      const tmpPath = dest + '.tmp.' + Date.now();
      const file = fs.createWriteStream(tmpPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            if (!isWin) fs.chmodSync(tmpPath, 0o755);
            fs.renameSync(tmpPath, dest);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
      file.on('error', (err) => {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
    }).on('error', reject);
  });
}

async function ensureYtDlp() {
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Si ya existe y es ejecutable, verificar versión
  if (fs.existsSync(binPath)) {
    try {
      const ver = execFileSync(binPath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
      console.log('[yt-dlp] Binario existente verificado:', ver, 'en', binPath);
      return binPath;
    } catch (e) {
      console.warn('[yt-dlp] Binario existente inválido, descargando versión fresca...');
      try { fs.unlinkSync(binPath); } catch (_) {}
    }
  }

  // Si existe en raíz (compatibilidad local)
  const rootBin = path.join(__dirname, '..', binName);
  if (fs.existsSync(rootBin)) {
    try {
      const ver = execFileSync(rootBin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
      console.log('[yt-dlp] Binario en raíz verificado:', ver);
      return rootBin;
    } catch (_) {}
  }

  const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + binName;
  console.log('[yt-dlp] Descargando motor de audio de estudio desde GitHub...', downloadUrl);
  await downloadFile(downloadUrl, binPath);
  if (!isWin) fs.chmodSync(binPath, 0o755);

  const ver = execFileSync(binPath, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  console.log('[yt-dlp] Descarga e instalación completada con éxito. Versión:', ver);
  return binPath;
}

if (require.main === module) {
  ensureYtDlp().catch((err) => {
    console.error('[yt-dlp] Error al asegurar binario:', err.message);
    // No romper build de npm si hay fallo transitorio
    process.exit(0);
  });
}

module.exports = {
  ensureYtDlp,
  getYtDlpPath: () => {
    if (fs.existsSync(binPath)) return binPath;
    const rootBin = path.join(__dirname, '..', binName);
    if (fs.existsSync(rootBin)) return rootBin;
    return binName;
  }
};
