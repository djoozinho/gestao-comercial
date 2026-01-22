const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

// Simple local print helper that tries multiple strategies on Windows.
// - Preferred: PowerShell Out-Printer (supports specifying printer name)
// - Fallback: notepad /p (prints to default printer)
// For raw ESC/POS/Elgin behavior, consider installing native libs (escpos) and updating this module.

function printFileWindows(filePath, printerName) {
  return new Promise((resolve, reject) => {
    // First, try PowerShell Out-Printer (recommended)
    const psCmd = `powershell -NoProfile -NonInteractive -Command "Get-Content -Raw -Path '${filePath.replace(/'/g, "''")}' | Out-Printer ${printerName ? `-Name ${JSON.stringify(printerName)}` : ''}"`;
    exec(psCmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return resolve({ method: 'powershell', ok: true, stdout, stderr });

      // Fallback to notepad /p which prints to default printer
      const notepadCmd = `notepad /p ${JSON.stringify(filePath)}`;
      exec(notepadCmd, { windowsHide: true }, (err2, so2, se2) => {
        if (!err2) return resolve({ method: 'notepad', ok: true, stdout: so2, stderr: se2 });
        // Final fallback: return error with both attempts
        return reject({ method: 'failed', errors: [ { method: 'powershell', err, stderr }, { method: 'notepad', err2, stderr: se2 } ] });
      });
    });
  });
}

async function printFile(filePath, opts = {}) {
  const printerName = opts.printerName || process.env.ELGIN_PRINTER_NAME || null;
  if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);

  if (process.platform === 'win32') {
    return await printFileWindows(filePath, printerName);
  }

  // For *nix systems, attempt lp or lpr
  return new Promise((resolve, reject) => {
    const lpCmd = printerName ? `lpr -P ${printerName} ${JSON.stringify(filePath)}` : `lpr ${JSON.stringify(filePath)}`;
    exec(lpCmd, (err, stdout, stderr) => {
      if (!err) return resolve({ method: 'lpr', ok: true, stdout, stderr });
      return reject({ method: 'lpr', err, stderr });
    });
  });
}

module.exports = { printFile };
