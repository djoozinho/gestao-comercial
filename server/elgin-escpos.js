// elgin-escpos.js
// Minimal ESC/POS printing helper using `escpos` package.
// Note: This module is optional and will throw if `escpos` is not installed.

async function printEscpos(couponText, opts = {}) {
  // opts: { printerName, usbVidPid, network: { host, port } }
  try {
    const escpos = require('escpos');
    // escpos encodings sometimes need iconv-lite
    escpos.USB = escpos.USB || escpos.USB;

    let device;
    if (opts.network && opts.network.host) {
      device = new escpos.Network(opts.network.host, opts.network.port || 9100);
    } else {
      if (opts.usbVidPid) {
        // expecting string like '04b8:0e15' (hex)
        const [vidHex, pidHex] = opts.usbVidPid.split(':');
        const vid = parseInt(vidHex, 16);
        const pid = parseInt(pidHex, 16);
        device = new escpos.USB(vid, pid);
      } else {
        // default USB
        device = new escpos.USB();
      }
    }

    const { Printer } = escpos;
    const printer = new Printer(device);

    return await new Promise((resolve, reject) => {
      device.open(function(err){
        if (err) return reject(err);
        try {
          // try to send coupon lines preserving layout
          printer
            .encode('UTF-8')
            .text(couponText)
            .cut()
            .close(() => resolve({ ok: true }));
        } catch (e) {
          return reject(e);
        }
      });
    });
  } catch (err) {
    // Re-throw with actionable message
    const message = (err && err.message) ? err.message : String(err);
    const detail = 'ESC/POS print failed. Ensure package `escpos` and USB drivers are installed (node-usb/libusb). ' + message;
    const e = new Error(detail);
    e.original = err;
    throw e;
  }
}

module.exports = { printEscpos };
