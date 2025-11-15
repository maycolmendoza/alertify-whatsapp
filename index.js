import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { default as express } from "express";
import cors from "cors";
import { PORT, AUTH_TOKEN } from "./config.js";
import QRCode from "qrcode";

const app = express();
app.use(cors());
app.use(express.json());

// Estado global del socket
let sock;

// Inicializar WhatsApp
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
      console.log("QR generado. Escanéalo con tu WhatsApp.");
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconectando...");
        iniciarSesion();
      } else {
        console.log("Sesión cerrada. Se requiere QR nuevamente.");
      }
    }

    if (connection === "open") {
      console.log("WhatsApp conectado ✔");
    }
  });
}

iniciarSesion();

/******************************************************
 * ENDPOINT 1 — Obtener QR para iniciar sesión
 ******************************************************/
app.get("/qr", async (req, res) => {
  if (sock?.connection?.qr) {
    const code = await QRCode.toDataURL(sock.connection.qr);
    return res.send(`<img src="${code}" />`);
  } else {
    return res.send("No hay QR disponible.");
  }
});

/******************************************************
 * Validar TOKEN en cada request
 ******************************************************/
app.use((req, res, next) => {
  if (req.headers.authorization !== AUTH_TOKEN) {
    return res.status(403).json({ error: "Token inválido" });
  }
  next();
});

/******************************************************
 * ENDPOINT 2 — Enviar mensaje individual
 ******************************************************/
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: "Faltan parámetros" });
  }

  try {
    await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });
    return res.json({ status: "ok" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * ENDPOINT 3 — Enviar broadcast por ciudad
 ******************************************************/
app.post("/broadcastCiudad", async (req, res) => {
  const { city, users, message } = req.body;

  if (!city || !users || !message) {
    return res.status(400).json({ error: "Faltan parámetros" });
  }

  try {
    for (const u of users) {
      await sock.sendMessage(u.phone + "@s.whatsapp.net", { text: message });
      await new Promise(resolve => setTimeout(resolve, 200)); // evita spam detection
    }

    return res.json({ status: "ok", enviados: users.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/******************************************************
 * Servidor listo
 ******************************************************/
app.listen(PORT, () => {
  console.log(`Servidor WhatsApp listo en puerto ${PORT}`);
});
