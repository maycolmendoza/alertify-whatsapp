import { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason 
} from "@whiskeysockets/baileys";

import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import { PORT, AUTH_TOKEN } from "./config.js";

const app = express();
app.use(cors());
app.use(express.json());

let qrGlobal = null;
let sock;

/******************************************************
 * INICIAR SESIÓN
 ******************************************************/
async function iniciarSesion() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    printQRInTerminal: false,
    auth: state,
    browser: ["Chrome (Linux)", "Chrome", "110.0"],
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      qrGlobal = qr;
      console.log("📲 Nuevo QR generado. Ver en /qr");
    }

    if (connection === "open") {
      console.log("✔ WhatsApp conectado");
      qrGlobal = null;
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;

      if (reason !== DisconnectReason.loggedOut) {
        console.log("♻️ Reconectando...");
        iniciarSesion();
      } else {
        console.log("⛔ Sesión cerrada. Necesitas escanear un nuevo QR.");
      }
    }
  });
}

iniciarSesion();

/******************************************************
 * QR
 ******************************************************/
app.get("/qr", async (req, res) => {
  try {
    if (!qrGlobal) return res.send("QR no disponible todavía");

    const img = await QRCode.toDataURL(qrGlobal);
    res.send(`<img src="${img}" style="width:280px">`);
  } catch (e) {
    res.send("Error generando QR");
  }
});

/******************************************************
 * TOKEN DE AUTORIZACIÓN
 ******************************************************/
app.use((req, res, next) => {
  if (req.headers.authorization !== AUTH_TOKEN) {
    return res.status(403).json({ error: "Token inválido" });
  }
  next();
});

/******************************************************
 * ENVIAR MENSAJE
 ******************************************************/
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message)
    return res.status(400).json({ error: "Faltan parámetros" });

  try {
    await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * BROADCAST
 ******************************************************/
app.post("/broadcastCiudad", async (req, res) => {
  const { users, message } = req.body;
  if (!users || !message)
    return res.status(400).json({ error: "Faltan parámetros" });

  try {
    for (let u of users) {
      await sock.sendMessage(`${u.phone}@s.whatsapp.net`, { text: message });
      await new Promise((r) => setTimeout(r, 200));
    }
    res.json({ enviados: users.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * SERVIDOR
 ******************************************************/
app.listen(PORT, () =>
  console.log(`🚀 Servidor WhatsApp listo en puerto ${PORT}`)
);
