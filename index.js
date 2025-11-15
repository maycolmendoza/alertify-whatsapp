import express from 'express';
import { Boom } from '@hapi/boom';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';

const app = express();
const PORT = process.env.PORT || 3000;

let ultimoQR = null;

// ========= INICIAR SESIÓN WHATSAPP =========
async function iniciarSesion() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('Nuevo QR generado.');
      ultimoQR = qr;
    }

    if (connection === 'open') {
      console.log('WhatsApp conectado ✔️');
      ultimoQR = null;
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('Conexión cerrada. Reintentando...', shouldReconnect);

      if (shouldReconnect) iniciarSesion();
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

iniciarSesion();

// ========= ENDPOINT PARA QR =========
app.get('/qr', (req, res) => {
  if (!ultimoQR) return res.send('QR no disponible');
  res.send(`<pre>${ultimoQR}</pre>`);
});

// ========= INICIAR SERVIDOR =========
app.listen(PORT, () => {
  console.log(`Servidor listo en puerto ${PORT}`);
});
