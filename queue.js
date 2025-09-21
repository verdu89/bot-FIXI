const { delay } = require("./utils/dateUtils");
const { getClientPronto } = require("./utils/statoBot");

let client = null;
const sendQueue = [];
let sending = false;

// tempo massimo di validità dei messaggi in coda (10 minuti)
const MAX_MSG_AGE = 10 * 60 * 1000;

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
  // ⏱️ aggiungiamo il timestamp al messaggio
  sendQueue.push({ to, message, timestamp: Date.now() });
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

      // ⏱️ scarto messaggi troppo vecchi
      if (Date.now() - item.timestamp > MAX_MSG_AGE) {
        console.warn(
          `⏱️ Scarto messaggio vecchio (${(
            (Date.now() - item.timestamp) /
            1000
          ).toFixed(0)}s) per ${item.to}`
        );
        sendQueue.shift();
        continue;
      }

      let success = false;
      let attempts = 0;

      while (!success && attempts < 3) {
        attempts++;
        try {
          console.log(`📤 Tentativo ${attempts} invio a ${item.to}`);

          // 🔎 Normalizza il numero con getNumberId
          const rawNumber = item.to.replace("@c.us", "").replace("+", "");
          console.log(`ℹ️ Normalizzo numero: ${rawNumber}`);

          const wid = await client.getNumberId(rawNumber);

          if (!wid) {
            console.error(`❌ Numero ${rawNumber} NON è su WhatsApp`);
            break; // esce dal retry loop
          }

          console.log(`✅ Numero valido: ${wid._serialized}`);

          // ⏱️ Piccola attesa anti-ban
          await delay(Math.random() * 1200 + 800);

          // 📩 Invio messaggio
          await client.sendMessage(wid._serialized, item.message);
          console.log(`✅ Messaggio inviato a ${wid._serialized}`);

          // 🆕 Segna la chat come NON letta (pallino verde)
          try {
            const chat = await client.getChatById(wid._serialized);
            if (chat) {
              await chat.markUnread();
              console.log(
                `📍 Chat con ${wid._serialized} segnata come NON letta dopo risposta bot`
              );
            }
          } catch (e) {
            console.warn(
              `⚠️ Impossibile marcare come NON letta la chat con ${wid._serialized}:`,
              e.message
            );
          }

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
