const { delay } = require("./utils/dateUtils");
const { getClientPronto } = require("./utils/statoBot");

let client = null;
const sendQueue = [];
let sending = false;

// inizializza la coda con il client di whatsapp-web.js
function initQueue(whatsappClient) {
  client = whatsappClient;
  global.client = whatsappClient; // 🔗 salviamo anche in globale
}

// safe wrapper per leggere lo stato del client
async function getClientStateSafe() {
  try {
    return await client.getState();
  } catch {
    return null;
  }
}

// controlla se il client è connesso davvero
async function waitForConnected(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const st = await getClientStateSafe();
    const pronto =
      (typeof getClientPronto === "function" && getClientPronto()) ||
      global.clientPronto === true;

    console.log("📡 Stato client:", st, "| clientPronto:", pronto);

    // considera valido anche se getState() non funziona, basta che clientPronto sia true
    if (pronto && (st === "CONNECTED" || st === null)) return true;

    await delay(800);
  }
  return false;
}

// aggiunge un messaggio in coda
async function safeSendMessage(to, message) {
  if (!to || typeof message !== "string" || message.trim() === "") {
    console.warn(
      `⚠️ safeSendMessage rifiutato: parametri non validi (to=${to})`
    );
    return;
  }
  sendQueue.push({ to, message });
  console.log(`📨 In coda → ${to}. Lunghezza coda: ${sendQueue.length}`);
  if (!sending) processQueue();
}

// elabora la coda
async function processQueue() {
  if (sending) return;
  sending = true;
  console.log("▶️ Avvio elaborazione messaggi in coda...");

  try {
    while (sendQueue.length > 0) {
      const ok = await waitForConnected(45000);
      if (!ok) {
        console.warn(
          "⏸️ Coda in pausa: client NON connesso. Riprovo tra poco."
        );
        await delay(2000);
        continue;
      }

      const item = sendQueue[0]; // peek
      let success = false;
      let attempts = 0;

      while (!success && attempts < 3) {
        attempts++;
        try {
          await delay(Math.random() * 1200 + 800); // piccola attesa anti-ban
          await client.sendMessage(item.to, item.message);
          console.log(`✅ Messaggio inviato a ${item.to}`);
          sendQueue.shift(); // rimuovi SOLO dopo successo
          success = true;
        } catch (err) {
          console.error(
            `❌ Errore invio a ${item.to} (tentativo ${attempts}): ${err.message}`
          );
          if (
            /Session closed|Target closed|Execution context was destroyed/i.test(
              err.message
            )
          ) {
            console.error(
              "💥 Sessione/Target chiuso durante l'invio. Attendo riconnessione..."
            );
            await delay(2500);
            break; // esci dal retry loop, riproverà nel prossimo giro
          }
          await delay(1500); // backoff prima del retry
        }
      }

      // se dopo i retry non ha inviato, scarta il messaggio
      if (!success) {
        console.error(
          `⚠️ Messaggio scartato dopo troppi tentativi: ${item.to}`
        );
        sendQueue.shift();
      }
    }
  } catch (err) {
    console.error("💥 Errore generale in processQueue:", err);
  } finally {
    sending = false;
    console.log("⏹️ Coda messaggi svuotata.");
  }
}

// log periodico stato coda
setInterval(() => {
  const pronto =
    (typeof getClientPronto === "function" && getClientPronto()) ||
    global.clientPronto === true;
  console.log(
    `[🧭 STATO] sendQueue: ${sendQueue.length}, sending: ${sending}, clientPronto: ${pronto}`
  );
}, 60000);

module.exports = {
  initQueue,
  safeSendMessage,
  processQueue,
  sendQueue,
};
