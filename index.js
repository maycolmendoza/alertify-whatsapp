import express from "express";
import * as baileys from "@whiskeysockets/baileys";

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

const app = express();
const PORT = process.env.PORT || 8080;

let ultimoQR = null;

// ========================================
//   INICIAR SESIÓN WHATSAPP
// ========================================
async function iniciarSesion() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      ultimoQR = qr;
      console.log("Nuevo QR generado");
    }

    if (connection === "open") {
      console.log("WhatsApp conectado ✔️");
      ultimoQR = null;
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log("Conexión cerrada, reintentando…");

      if (shouldReconnect) iniciarSesion();
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

iniciarSesion();

// ========================================
//   MOSTRAR QR EN /qr
// ========================================
app.get("/qr", (req, res) => {
  if (!ultimoQR) return res.send("QR no disponible todavía");
  res.send(`<pre>${ultimoQR}</pre>`);
});

// ========================================
//   INICIAR SERVIDOR HTTP
// ========================================
app.listen(PORT, () => {
  console.log(`Servidor listo en puerto ${PORT}`);
});
