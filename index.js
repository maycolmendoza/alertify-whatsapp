import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import express from "express";
import cors from "cors";
import { PORT, AUTH_TOKEN } from "./config.js";
import QRCode from "qrcode";

const app = express();
app.use(cors());
app.use(express.json());

// Socket WhatsApp global
let sock;

// Iniciar sesión WhatsApp
async function iniciarSesion() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("QR generado. Escanéalo desde /qr");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconectando...");
        iniciarSesion();
      } else {
        console.log("Sesión cerrada. Requiere nuevo QR.");
      }
    }

    if (connection === "open") {
      console.log("WhatsApp conectado ✔");
    }
  });
}

iniciarSesion();

/******************************************************
 * QR Endpoint
 ******************************************************/
app.get("/qr", async (req, res) => {
  try {
    if (!sock?.connection?.qr) return res.send("QR no disponible");
    const code = await QRCode.toDataURL(sock.connection.qr);
    res.send(`<img src="${code}" />`);
  } catch (err) {
    res.send("Error mostrando QR");
  }
});

/******************************************************
 * Seguridad por TOKEN
 ******************************************************/
app.use((req, res, next) => {
  if (req.headers.authorization !== AUTH_TOKEN) {
    return res.status(403).json({ error: "Token incorrecto" });
  }
  next();
});

/******************************************************
 * Enviar mensaje a un número
 ******************************************************/
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
    return res.json({ status: "ok" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/******************************************************
 * Broadcast por ciudad
 ******************************************************/
app.post("/broadcastCiudad", async (req, res) => {
  const { users, message } = req.body;

  if (!users || !message) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  try {
    for (let u of users) {
      await sock.sendMessage(u.phone + "@s.whatsapp.net", { text: message });
      await new Promise(r => setTimeout(r, 200));
    }

    return res.json({ enviados: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor WhatsApp listo en puerto ${PORT}`);
});
