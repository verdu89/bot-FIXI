const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { setClientPronto } = require("./utils/statoBot");

let clientPronto = false;
let lastConnectedTs = Date.now();

// inizializzazione client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./session" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

// QR
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

// ready
client.on("ready", () => {
  console.log("✅ Bot pronto");
  setClientPronto(true);
  clientPronto = true;
  lastConnectedTs = Date.now();
});

// disconnected
client.on("disconnected", (reason) => {
  console.log("❌ Disconnesso da WhatsApp:", reason);
  setClientPronto(false);
  clientPronto = false;
});

// funzione sicura per stato
async function getClientStateSafe() {
  try {
    return await client.getState();
  } catch {
    return null;
  }
}

// monitor riconnessione
setInterval(async () => {
  const st = await getClientStateSafe();
  if (st === "CONNECTED" && clientPronto) {
    lastConnectedTs = Date.now();
    return;
  }
  const downFor = (Date.now() - lastConnectedTs) / 1000;
  if (downFor > 180) {
    // >3 minuti non connesso
    console.warn(
      `🚨 Stato="${st}" da ${downFor.toFixed(0)}s → riavvio client...`
    );
    try {
      await client.destroy().catch(() => {});
    } finally {
      clientPronto = false;
      client.initialize();
      lastConnectedTs = Date.now();
    }
  }
}, 30 * 1000);

module.exports = {
  client,
  getClientStateSafe,
};
