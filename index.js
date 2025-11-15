import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { PORT, AUTH_TOKEN } from "./config.js";

const app = express();
app.use(cors());
app.use(express.json());

// Guardamos el QR temporalmente
let qrGlobal = null;

// Socket WhatsApp global
let sock;

/******************************************************
 * INICIAR SESIÓN DE WHATSAPP
 ******************************************************/
async function iniciarSesion() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    printQRInTerminal: false,
    auth: state,
    browser: ["Chrome (Linux)", "Chrome", "110.0.0.0"],
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  /******************************************************
   * EVENTOS DE CONEXIÓN
   ******************************************************/
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    // Si Baileys genera un QR → lo guardamos
    if (qr) {
      qrGlobal = qr;
      console.log("QR listo ✔ Escanéalo en /qr");
    }

    // Si se conecta -> limpiamos QR
    if (connection === "open") {
      console.log("WhatsApp conectado ✔");
      qrGlobal = null;
    }

    // Reconexión automática
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconectando...");
        iniciarSesion();
      } else {
        console.log("Sesión cerrada. Debes escanear QR nuevamente.");
      }
    }
  });
}

// Iniciar proceso
iniciarSesion();

/******************************************************
 * ENDPOINT: MOSTRAR QR
 ******************************************************/
app.get("/qr", async (req, res) => {
  try {
    if (!qrGlobal) return res.send("QR no disponible (esperando reconexión)");

    const qrCodeImage = await QRCode.toDataURL(qrGlobal);
    res.send(`<img src="${qrCodeImage}" style="width:300px" />`);
  } catch (e) {
    res.send("Error generando QR");
  }
});

/******************************************************
 * AUTORIZACIÓN (TOKEN)
 ******************************************************/
app.use((req, res, next) => {
  if (req.headers.authorization !== AUTH_TOKEN) {
    return res.status(403).json({ error: "Token inválido" });
  }
  next();
});

/******************************************************
 * ENDPOINT: ENVIAR MENSAJE INDIVIDUAL
 ******************************************************/
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message)
    return res.status(400).json({ error: "Faltan parámetros" });

  try {
    await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
    return res.json({ status: "ok" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * ENDPOINT: ENVIAR BROADCAST A LISTA DE USUARIOS
 ******************************************************/
app.post("/broadcastCiudad", async (req, res) => {
  const { users, message } = req.body;

  if (!users || !message)
    return res.status(400).json({ error: "Faltan parámetros" });

  try {
    for (let u of users) {
      await sock.sendMessage(u.phone + "@s.whatsapp.net", { text: message });
      await new Promise((r) => setTimeout(r, 200)); // evita bloqueo
    }

    return res.json({ enviados: users.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * INICIAR SERVIDOR
 ******************************************************/
app.listen(PORT, () => {
  console.log(`Servidor WhatsApp listo en puerto ${PORT}`);
});
