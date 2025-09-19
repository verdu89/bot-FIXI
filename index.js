require("dotenv").config();
const fs = require("fs"); // 🆕 per log su file
const { client } = require("./client");
const { initQueue, safeSendMessage } = require("./queue");
const { isOrarioLavorativo } = require("./utils/dateUtils");
const { getClientPronto } = require("./utils/statoBot");
const { inviaMenuPrincipale, inviaSedi } = require("./flows/menu");
const { domandePreventivo, gestisciPreventivo } = require("./flows/preventivo");
const { assistenzaDomande, gestisciAssistenza } = require("./flows/assistenza");
const {
  chiediProdottiOpenAI,
  rispostaIA,
  spiegaDomandaIA,
} = require("./ai-utils");
const { app, chatManuale } = require("./api");

// 🆕 soglia max età messaggi sincronizzati (default 5 minuti)
const SYNC_OLD_MSG_MAX_AGE_MS = parseInt(
  process.env.SYNC_OLD_MSG_MAX_AGE_MS || "300000",
  10
);

// Stato runtime
let utentiInAttesa = {};
let ultimaAttivita = {};
let haRicevutoCortesia = {};
let primoAvvio = Date.now();

// Messaggio di cortesia
const MESSAGGIO_CORTESIA = `👋 Grazie per averci contattato.

Siamo operativi in questo momento: un nostro operatore ti risponderà appena possibile.
📞 Per urgenze, chiama il *070 247362*`;

// Init queue
initQueue(client);

// Evento messaggi ricevuti
client.on("message", async (msg) => {
  console.log("📩 Ricevuto messaggio:", {
    from: msg.from,
    body: msg.body,
    type: msg.type,
  });

  const from = msg.from;

  // Ignora status
  if (from === "status@broadcast") {
    console.log("⚠️ Ignorato messaggio di stato");
    return;
  }

  // Modalità manuale → FIXI non risponde
  if (chatManuale[from]) {
    console.log(`✋ Utente ${from} è in manuale → FIXI non interviene`);
    return;
  }

  // 🆕 ⏱️ Guardia anti-sync: ignora messaggi RECEIVED troppo vecchi
  const msgTsMs =
    typeof msg.timestamp === "number" ? msg.timestamp * 1000 : Date.now();
  const ageMs = Date.now() - msgTsMs;
  if (ageMs > SYNC_OLD_MSG_MAX_AGE_MS) {
    const log = `[${new Date().toISOString()}] [IGNORA_SYNC] FROM: ${from} age=${Math.round(
      ageMs / 1000
    )}s type=${msg.type}\nBODY: ${String(msg.body || "").slice(0, 200)}\n\n`;
    try {
      fs.appendFileSync("log_sync_ignored.txt", log);
    } catch (e) {
      console.warn("⚠️ Impossibile scrivere log_sync_ignored.txt:", e.message);
    }
    console.log(
      `⏱️ Ignoro messaggio vecchio (${Math.round(ageMs / 1000)}s) da ${from}`
    );
    return;
  }

  // (spostato qui) aggiorna ultima attività SOLO per messaggi “freschi”
  ultimaAttivita[from] = Date.now();

  const body = msg.body?.trim().toLowerCase() || "";
  const utente = utentiInAttesa[from];

  // Orario lavorativo → messaggio cortesia solo 1 volta
  if (isOrarioLavorativo()) {
    if (!haRicevutoCortesia[from]) {
      console.log(`🕒 Orario lavorativo → invio messaggio cortesia a ${from}`);
      haRicevutoCortesia[from] = Date.now();
      return safeSendMessage(from, MESSAGGIO_CORTESIA);
    } else {
      console.log(`🕒 Orario lavorativo → ${from} ha già ricevuto cortesia`);
      return;
    }
  }

  // Attivazione menu
  const paroleChiave = [
    "menu",
    "ciao",
    "salve",
    "buongiorno",
    "preventivo",
    "aiuto",
    "assistenza",
    "prodotti",
    "infissi",
  ];

  if (!utentiInAttesa[from]) {
    const messaggioValido = paroleChiave.some((p) => body.includes(p));
    const tempoMessaggio = msg.timestamp * 1000;
    if (messaggioValido && tempoMessaggio > primoAvvio - 10000) {
      console.log(`📋 Attivazione menu per ${from}`);
      utentiInAttesa[from] = { fase: "menu" };
      return inviaMenuPrincipale(from);
    } else {
      console.log(`🤷‍♂️ Messaggio non valido per attivare menu: "${body}"`);
    }
  }

  // Comandi operatore
  if (body === "/manuale") {
    chatManuale[from] = true;
    console.log(`🟠 Attivata modalità manuale per ${from}`);
    return safeSendMessage(from, "✅ Chat impostata su *manuale*.");
  }
  if (body === "/automatico") {
    delete chatManuale[from];
    utentiInAttesa[from] = { fase: "menu" };
    console.log(`🟢 Riattivata modalità automatica per ${from}`);
    await safeSendMessage(from, "✅ Chat impostata su *automatica*.");
    return inviaMenuPrincipale(from);
  }
  if (body === "annulla") {
    delete utentiInAttesa[from];
    console.log(`⛔ Conversazione annullata per ${from}`);
    return safeSendMessage(
      from,
      "🔴 Operazione annullata. Scrivi *ciao* per ricominciare."
    );
  }

  // Routing fasi
  if (utente?.fase === "menu") {
    console.log(`📂 Routing: menu per ${from} (scelta=${body})`);
    if (body === "1") {
      utentiInAttesa[from] = { fase: "preventivo", step: 0, dati: {} };
      return safeSendMessage(from, domandePreventivo[0]);
    } else if (body === "2") {
      const risposta = await chiediProdottiOpenAI();
      return safeSendMessage(from, risposta);
    } else if (body === "3") {
      utentiInAttesa[from] = {
        fase: "assistenza",
        step: 0,
        dati: {},
        foto: [],
      };
      return safeSendMessage(from, assistenzaDomande[0]);
    } else if (body === "4") {
      return inviaSedi(from);
    } else {
      console.log(`💬 Risposta IA per input libero: "${body}"`);
      const risposta = await rispostaIA(body);
      return safeSendMessage(from, risposta);
    }
  }

  // --- Flusso preventivo ---
  if (utente?.fase === "preventivo") {
    const sessione = utentiInAttesa[from];

    // Caso: sessione inesistente (già chiusa)
    if (!sessione) {
      const lower = msg.body.trim().toLowerCase();
      if (lower === "ciao") {
        console.log(
          `👋 Utente ${from} ha scritto ciao → torno al menu principale.`
        );
        utentiInAttesa[from] = { fase: "menu" };
        return inviaMenuPrincipale(from);
      }
      console.log(
        `⚠️ Utente ${from} ha scritto dopo preventivo chiuso → solo reminder menu.`
      );
      return safeSendMessage(
        from,
        "👉 Scrivi *ciao* per tornare al menu principale."
      );
    }

    // Caso: preventivo completato o step finiti
    if (sessione.step >= domandePreventivo.length || sessione.completato) {
      delete utentiInAttesa[from];
      const lower = msg.body.trim().toLowerCase();
      if (lower === "ciao") {
        console.log(
          `👋 Utente ${from} ha scritto ciao → torno al menu principale.`
        );
        utentiInAttesa[from] = { fase: "menu" };
        return inviaMenuPrincipale(from);
      }
      console.log(
        `⚠️ Utente ${from} ha scritto dopo preventivo completato → solo reminder menu.`
      );
      return safeSendMessage(
        from,
        "👉 Scrivi *ciao* per tornare al menu principale."
      );
    }

    // Caso normale: preventivo ancora in corso
    console.log(`📝 Gestione preventivo (step ${sessione.step}) per ${from}`);
    return gestisciPreventivo(
      msg,
      sessione,
      from,
      process.env.GOOGLE_PREVENTIVI_SCRIPT_URL,
      spiegaDomandaIA
    );
  }

  // --- Flusso assistenza ---
  if (utente?.fase === "assistenza") {
    const sessione = utentiInAttesa[from];

    // Caso: sessione inesistente (già chiusa)
    if (!sessione) {
      const lower = msg.body.trim().toLowerCase();
      if (lower === "ciao") {
        console.log(
          `👋 Utente ${from} ha scritto ciao → torno al menu principale.`
        );
        utentiInAttesa[from] = { fase: "menu" };
        return inviaMenuPrincipale(from);
      }
      console.log(
        `⚠️ Utente ${from} ha scritto dopo assistenza chiusa → solo reminder menu.`
      );
      return safeSendMessage(
        from,
        "👉 Scrivi *ciao* per tornare al menu principale."
      );
    }

    // Caso: assistenza completata (già inviata al Google Sheet)
    if (sessione.completato) {
      delete utentiInAttesa[from];
      const lower = msg.body.trim().toLowerCase();
      if (lower === "ciao") {
        console.log(
          `👋 Utente ${from} ha scritto ciao → torno al menu principale.`
        );
        utentiInAttesa[from] = { fase: "menu" };
        return inviaMenuPrincipale(from);
      }
      console.log(
        `⚠️ Utente ${from} ha scritto dopo assistenza completata → solo reminder menu.`
      );
      return safeSendMessage(
        from,
        "👉 Scrivi *ciao* per tornare al menu principale."
      );
    }

    // Caso normale: assistenza ancora in corso
    console.log(`🛠️ Gestione assistenza (step ${sessione.step}) per ${from}`);
    return gestisciAssistenza(
      msg,
      sessione,
      from,
      process.env.GOOGLE_ASSISTENZA_SCRIPT_URL,
      spiegaDomandaIA
    );
  }

  console.log(`⚠️ Nessuna fase trovata per ${from}, body="${body}"`);
});

// Auto-detect operatore umano
client.on("message_create", (msg) => {
  if (!msg.fromMe) return;
  const isBotMessage = !msg._data?.author && !msg._data?.id?.participant;
  if (isBotMessage) {
    console.log("🤖 Messaggio inviato da FIXI → non cambio stato");
    return;
  }
  const to = msg.to || msg.id.remote;
  chatManuale[to] = true;
  console.log(`✋ Operatore umano ha risposto → modalità manuale per ${to}`);
});

// Pulizia flag cortesia
setInterval(() => {
  console.log("♻️ Pulizia flag cortesia");
  for (const numero in haRicevutoCortesia) {
    if (Date.now() - haRicevutoCortesia[numero] > 7 * 24 * 60 * 60 * 1000) {
      console.log(`🧹 Reset cortesia per ${numero}`);
      delete haRicevutoCortesia[numero];
    }
  }
}, 12 * 60 * 60 * 1000);

// Timeout inattività (3 giorni) → SOLO pulizia, nessun messaggio
setInterval(() => {
  if (!getClientPronto()) return;
  const now = Date.now();
  for (const numero in ultimaAttivita) {
    if (chatManuale[numero]) continue;
    const inattivoDa = now - ultimaAttivita[numero];
    if (inattivoDa > 3 * 24 * 60 * 60 * 1000) {
      console.log(`⌛ Timeout conversazione per ${numero} → pulizia memoria`);
      delete utentiInAttesa[numero];
      delete ultimaAttivita[numero];
    }
  }
}, 60 * 1000);

// Avvio server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌐 API in ascolto su http://localhost:${PORT}`)
);

// Avvio WhatsApp
client.initialize();
