// ✅ SaverBot – versione robusta con coda “a prova di riavvio” e monitor stato
require("dotenv").config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const OpenAI = require("openai");
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { ottieniProvinciaCorretta } = require("./ai");
const { setClientPronto } = require("./statoBot");
const { DateTime } = require("luxon");

let clientPronto = false;
let primoAvvio = Date.now();

// 🕐 Controllo orario e chiusura ferie
const CHIUSURA_FORZATA = false; // 👉 true = chiuso sempre (ignora calendario)
const dateChiuse = [
  // ==== 2025 ====
  "2025-01-01", // Capodanno
  "2025-01-06", // Epifania
  "2025-04-20", // Pasqua
  "2025-04-21", // Lunedì dell'Angelo
  "2025-04-25", // Festa della Liberazione
  "2025-05-01", // Festa dei Lavoratori
  "2025-06-02", // Festa della Repubblica
  "2025-08-15", // Ferragosto
  "2025-11-01", // Tutti i Santi
  "2025-12-08", // Immacolata Concezione
  "2025-12-25", // Natale
  "2025-12-26", // Santo Stefano

  // ==== 2026 ====
  "2026-01-01", // Capodanno
  "2026-01-06", // Epifania
  "2026-04-05", // Pasqua
  "2026-04-06", // Lunedì dell'Angelo
  "2026-04-25", // Festa della Liberazione
  "2026-12-26", // Santo Stefanoncezionea
];

function isOrarioLavorativo() {
  if (CHIUSURA_FORZATA) return false;

  const nowRome = DateTime.now().setZone("Europe/Rome");
  const giorno = nowRome.weekday; // 1 = Lunedì ... 7 = Domenica
  const orarioDec = nowRome.hour + nowRome.minute / 60;
  const oggi = nowRome.toISODate();

  const lavorativo = giorno >= 1 && giorno <= 5 && !dateChiuse.includes(oggi);
  const fascia = orarioDec >= 9.5 && orarioDec < 16.0; // 09:30–16:00
  return lavorativo && fascia;
}

const MESSAGGIO_CORTESIA = `👋 Grazie per averci contattato.

Siamo operativi in questo momento: un nostro operatore ti risponderà appena possibile.
📞 Per urgenze, chiama il *070 247362*`;

let ultimoMessaggioRicevuto = Date.now();

// ───────────────────────────────────────────────────────────
// Express API
// ───────────────────────────────────────────────────────────
const app = express();
app.use(bodyParser.json());

// path Chromium
function getChromePath() {
  const paths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  console.warn("⚠️ Chromium non trovato!");
  return null;
}

// WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./session" }),
  puppeteer: {
    executablePath: getChromePath(),
    headless: true,
    detached: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--remote-debugging-port=9222",
    ],
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ───────────────────────────────────────────────────────────
// Stato conversazioni + coda invii
// ───────────────────────────────────────────────────────────
const utentiInAttesa = {};
const chatManuale = {};
const ultimaAttivita = {};
const haRicevutoCortesia = {};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// 🧰 Helper stato client
async function getClientStateSafe() {
  try {
    return await client.getState();
  } catch {
    return null;
  }
}
async function waitForConnected(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const st = await getClientStateSafe();
    if (st === "CONNECTED" && clientPronto) return true;
    await delay(800);
  }
  return false;
}

// Coda invii robusta
const sendQueue = [];
let sending = false;

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

setInterval(() => {
  console.log(
    `[🧭 STATO] sendQueue: ${sendQueue.length}, sending: ${sending}, clientPronto: ${clientPronto}`
  );
}, 60000);

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
      try {
        await delay(Math.random() * 1200 + 800);
        await client.sendMessage(item.to, item.message);
        console.log(`✅ Messaggio inviato a ${item.to}`);
        sendQueue.shift(); // rimuovi SOLO dopo successo
      } catch (err) {
        console.error(`❌ Errore invio a ${item.to}: ${err.message}`);
        if (
          /Session closed|Target closed|Execution context was destroyed/i.test(
            err.message
          )
        ) {
          console.error(
            "💥 Sessione/Target chiuso durante l'invio. Attendo riconnessione..."
          );
          await delay(2500);
          continue; // non shiftare → retry
        }
        await delay(1500); // backoff e retry, non shiftare
      }
    }
  } catch (err) {
    console.error("💥 Errore generale in processQueue:", err);
  } finally {
    sending = false;
    console.log("⏹️ Coda messaggi svuotata.");
  }
}

// ───────────────────────────────────────────────────────────
// Flussi messaggi
// ───────────────────────────────────────────────────────────
const domandePreventivo = [
  "Qual è il tuo *Nome e Cognome / Ragione sociale*?",
  "Il tuo *numero di telefono*?",
  "La tua *email*?",
  "Dove si trova il *luogo di consegna*?",
  "In quale *provincia*?",
  "Descrivi la richiesta con *misure orientative (larghezza x altezza)*, se ancora non le hai indicaci a quale prodotto sei interessato.",
];

const assistenzaDomande = [
  "Qual è il *Nome e Cognome / Ragione sociale* dell'intestatario del contratto?",
  "In che anno hai acquistato gli infissi?",
  "Dove deve essere effettuato l'intervento? (Via e numero civico, Comune, Provincia)",
  "Descrivi il problema che hai riscontrato.",
  "Se possibile, invia delle *foto* che mostrano il problema oppure scrivi 'no' se non hai immagini.",
];

const scriptPreventiviUrl = process.env.GOOGLE_PREVENTIVI_SCRIPT_URL;
const scriptAssistenzaUrl = process.env.GOOGLE_ASSISTENZA_SCRIPT_URL;

function inviaMenuPrincipale(to) {
  let messaggioIntro = "";
  if (CHIUSURA_FORZATA) {
    messaggioIntro = `
🏖 *Siamo chiusi per ferie! Torneremo il 1° settembre*
⏳ Risponderemo appena torniamo operativi.

Nel frattempo posso aiutarti con queste opzioni:
`;
  } else {
    messaggioIntro = `
👋 *Ciao!* In questo momento i nostri uffici sono chiusi.

Io sono *FIXI*, l'assistente virtuale: posso aiutarti anche adesso!
`;
  }

  return safeSendMessage(
    to,
    `
${messaggioIntro.trim()}

Scrivi il numero corrispondente alla tua richiesta:

1️⃣ *Richiedi un preventivo*  
📝 Compila una richiesta guidata in pochi secondi.

2️⃣ *Scopri i nostri prodotti*  
3️⃣ *Lascia un messaggio per un operatore*  
📨 Ti risponderemo appena saremo di nuovo operativi.

4️⃣ *Richiedi assistenza post-vendita*  
🛠️ Compila una richiesta guidata per segnalare il problema.

5️⃣ *Scopri dove siamo*

ℹ️ Scrivi *"menu"* per riaprire questo elenco, oppure *"annulla"* per annullare l’operazione in corso.
`
  );
}

async function inviaSedi(to) {
  const sede1 = `
🏢 *Assemini - Stabilimento e Uffici*  
📌 Quinta Strada Z.I. Macchiareddu, Assemini (CA)  
🕒 *Lun–Ven:* 9:30–13:00 | 14:00–16:00  
🔗 Mappa 👉 https://maps.app.goo.gl/UbEqci5Pw7EJXkUx8
  `.trim();

  const sede2 = `
🏢 *Cagliari - Showroom*  
📌 Via della Pineta 96, Cagliari (CA)  
🕒 *Lun–Ven:* 10:00–13:00 | 15:00–18:00  
🕒 *Sab:* 10:00–13:00  
🔗 Mappa 👉 https://maps.app.goo.gl/oWxbGF114TvYiYqk9
  `.trim();

  const sede3 = `
🏢 *Nuoro - Showroom*  
📌 Via Badu e Carros, Nuoro (NU)  
🕒 *Lun–Ven:* 10:00–12:30 | 16:00–19:00  
🔗 Mappa 👉 https://maps.app.goo.gl/EKHihgg3ghfhj2THA
  `.trim();

  const infoFinale = `✨ *Hai bisogno di info o vuoi fissare un appuntamento?*  
☎️ Chiama lo *070 247362*`;

  await safeSendMessage(to, sede1);
  await delay(1200);
  await safeSendMessage(to, sede2);
  await delay(1200);
  await safeSendMessage(to, sede3);
  await delay(1500);
  await safeSendMessage(to, infoFinale);
}

// QR & ready/disconnect
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => {
  console.log("✅ Bot pronto");
  setClientPronto(true);
  clientPronto = true;
  lastConnectedTs = Date.now(); // monitor connessione
});
client.on("disconnected", (reason) => {
  console.log("❌ Disconnesso da WhatsApp:", reason);
  setClientPronto(false);
  clientPronto = false;
});

// Messaggi
client.on("message", async (msg) => {
  ultimoMessaggioRicevuto = Date.now();

  // ignora status e speciali
  if (
    msg.type === "ephemeral" ||
    msg.type === "protocol" ||
    msg.from === "status@broadcast"
  )
    return;

  const from = msg.from;
  const body = msg.body?.trim().toLowerCase() || "";
  console.log(
    `[${new Date().toLocaleTimeString()}] Messaggio da ${from}: ${body}`
  );
  ultimaAttivita[from] = Date.now();

  // Orario lavorativo → messaggio di cortesia (una volta) e stop
  // Orario lavorativo → messaggio di cortesia (una volta ogni 3 giorni per cliente)
  if (isOrarioLavorativo()) {
    if (chatManuale[from]) return;
    if (
      !haRicevutoCortesia[from] ||
      Date.now() - haRicevutoCortesia[from] > 3 * 24 * 60 * 60 * 1000
    ) {
      haRicevutoCortesia[from] = Date.now(); // salvo timestamp ultimo invio
      return safeSendMessage(from, MESSAGGIO_CORTESIA);
    }
    return;
  }

  // Parole chiave per attivare menu
  const paroleChiave = [
    "menu",
    "ciao",
    "salve",
    "buongiorno",
    "buonasera",
    "preventivo",
    "vetrata",
    "infissi",
    "aiuto",
    "assistenza",
    "contatto",
    "informazioni",
    "parlare",
    "richiesta",
    "problema",
    "montaggio",
    "detrazione",
  ];

  if (!chatManuale[from] && !utentiInAttesa[from]) {
    const messaggioValido = paroleChiave.some((p) => body.includes(p));
    const tempoMessaggio = msg.timestamp * 1000;
    const tempoAvvio = primoAvvio || Date.now();
    if (tempoMessaggio < tempoAvvio - 10000) return; // no vecchi messaggi
    if (messaggioValido) {
      utentiInAttesa[from] = { fase: "menu" };
      return inviaMenuPrincipale(from);
    } else {
      return;
    }
  }

  // Operatore risponde da WA Web? (messaggio “da me” nel thread utente)
  if (!msg.fromMe && msg.id.fromMe) {
    chatManuale[from] = true;
    console.log(`✋ Operatore ha risposto → modalità manuale per ${from}`);
    return;
  }
  if (chatManuale[from]) return;

  // comandi
  if (body === "/manuale") {
    chatManuale[from] = true;
    return safeSendMessage(
      from,
      "✅ Chat impostata su *manuale*. Il bot non risponderà più."
    );
  }
  if (body === "/automatico") {
    delete chatManuale[from];
    utentiInAttesa[from] = { fase: "menu" };
    await safeSendMessage(
      from,
      "✅ Chat impostata su *automatica*. Il bot è nuovamente attivo."
    );
    return inviaMenuPrincipale(from);
  }
  if (
    !chatManuale[from] &&
    (!utentiInAttesa[from] || body.includes("menu") || body.includes("salve"))
  ) {
    utentiInAttesa[from] = { fase: "menu" };
    return inviaMenuPrincipale(from);
  }

  if (body === "annulla") {
    delete utentiInAttesa[from];
    return safeSendMessage(
      from,
      "🔴 Operazione annullata. Scrivi *ciao* per ricominciare."
    );
  }

  const utente = utentiInAttesa[from];

  // ====== OpenAI utilities ======
  async function chiediProdottiOpenAI() {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Sei *FIXI* un assistente aziendale di Saverplast. 
Rispondi sempre in modo chiaro, educato e professionale. 
Non inventare prodotti o servizi: i prodotti offerti sono:

- Infissi in PVC
- Persiane e scuri in PVC
- Zanzariere a rullo e scorrevoli
- Tapparelle
- Scorrevoli 
- Porte blindate
- Vetrate panoramiche
- Tende oscuranti e filtranti
- Cassonetti monoblocco

Non menzionare altri prodotti. Rispondi con tono adatto a WhatsApp e invita a visitare il sito https://infissipvcsardegna.com.`,
          },
          {
            role: "user",
            content: "Vorrei sapere di più sui vostri prodotti.",
          },
        ],
        temperature: 0.6,
        max_tokens: 500,
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.error("❌ Errore OpenAI:", err.message);
      return "⚠️ Al momento non riesco a recuperare le informazioni sui nostri prodotti. Riprova tra poco.";
    }
  }

  async function rispostaIA(testoUtente) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `
Sei *FIXI*, l’assistente WhatsApp ufficiale di *Saverplast*.

🎯 Obiettivo: aiutare l’utente in modo chiaro e guidarlo verso il menu.
(1 Preventivo, 2 Prodotti, 3 Operatore, 4 Assistenza, 5 Sedi)

📌 Copri solo: infissi PVC, persiane/scuri, zanzariere, tapparelle, scorrevoli,
porte blindate, vetrate panoramiche, tende oscuranti/filtranti, orari/showroom/assistenza.

✅ Se domanda frequente → rispondi breve e invita a digitare *1* o la voce giusta.
❌ Se argomento non pertinente → invita a scrivere *3* per un operatore.
Chiudi sempre con un’azione consigliata.`,
          },
          { role: "user", content: testoUtente },
        ],
        temperature: 0.6,
        max_tokens: 500,
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.error("❌ Errore IA in rispostaIA:", err.message);
      await safeSendMessage(
        "393465788657@c.us",
        "⚠️ La IA ha smesso di rispondere. Verifica credito OpenAI."
      );
      return "⚠️ Al momento non riesco a rispondere automaticamente. Scrivi *3* per parlare con un operatore.";
    }
  }

  async function spiegaDomandaIA(domanda, rispostaUtente) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Agisci come FIXI. L’utente non ha capito la domanda del modulo. Spiega in modo semplice e breve, con esempio se utile.`,
          },
          {
            role: "user",
            content: `Domanda: ${domanda}\nRisposta utente: ${rispostaUtente}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 300,
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.error("❌ Errore IA in spiegaDomandaIA:", err.message);
      await safeSendMessage(
        "393465788657@c.us",
        "⚠️ FIXI non riesce a spiegare una domanda. Controlla la IA."
      );
      return "⚠️ Scusa, non riesco a spiegarti meglio in questo momento. Scrivi *3* per parlare con un operatore.";
    }
  }

  async function classificaRichiestaOperatore(testoUtente) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Classifica il messaggio in una sola categoria: "Preventivo" | "Assistenza tecnica" | "Informazione generale" | "Altro". Solo la parola.`,
          },
          { role: "user", content: testoUtente },
        ],
        temperature: 0.2,
        max_tokens: 10,
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.error(
        "❌ Errore IA in classificaRichiestaOperatore:",
        err.message
      );
      await safeSendMessage(
        "393465788657@c.us",
        "⚠️ SaverBot non riesce a classificare una richiesta."
      );
      return "Altro";
    }
  }

  // ====== Router fasi ======
  if (utente?.fase === "menu") {
    if (body === "1") {
      utentiInAttesa[from] = { fase: "preventivo", step: 0, dati: {} };
      return safeSendMessage(from, domandePreventivo[0]);
    } else if (body === "2") {
      const risposta = await chiediProdottiOpenAI();
      return safeSendMessage(from, risposta);
    } else if (body === "3") {
      utentiInAttesa[from] = { fase: "operatore", step: 0, dati: {} };
      if (isOrarioLavorativo()) {
        return safeSendMessage(
          from,
          `📩 Scrivi qui sotto il motivo della tua richiesta.
Un nostro operatore ti risponderà al più presto!`
        );
      } else {
        utentiInAttesa[from].dati["fuoriOrario"] = true;
        return safeSendMessage(
          from,
          `🕒 In questo momento i nostri operatori non sono disponibili.
⏰ *Orari:* Lun–Ven 9:30–13:00, 14:00–16:00
✉️ Scrivi qui sotto il motivo della tua richiesta: ti ricontatteremo appena possibile.`
        );
      }
    } else if (body === "4") {
      utentiInAttesa[from] = {
        fase: "assistenza",
        step: 0,
        dati: {},
        foto: [],
      };
      return safeSendMessage(from, assistenzaDomande[0]);
    } else if (body === "5") {
      return inviaSedi(from);
    } else {
      const risposta = await rispostaIA(body);
      fs.appendFileSync(
        "log_domande_ia.txt",
        `[${new Date().toISOString()}] ${from}: ${body}\n`
      );
      return safeSendMessage(from, risposta);
    }
  }

  if (utente?.fase === "preventivo") {
    const chiavi = [
      "Nome",
      "Telefono",
      "Email",
      "Luogo di Consegna",
      "Provincia",
      "Messaggio",
    ];
    const risposta = msg.body?.trim();
    const rispostaLower = risposta?.toLowerCase();

    if (
      ["?", "non so", "che vuol dire", "boh", "non ho capito"].some((p) =>
        rispostaLower.includes(p)
      )
    ) {
      const spiegazione = await spiegaDomandaIA(
        domandePreventivo[utente.step],
        msg.body
      );
      if (spiegazione) {
        await safeSendMessage(from, spiegazione);
        return safeSendMessage(from, domandePreventivo[utente.step]);
      }
    }

    const campoCorrente = chiavi[utente.step];
    if (campoCorrente === "Provincia") {
      const provincia = await ottieniProvinciaCorretta(risposta);
      if (
        !provincia ||
        provincia.toLowerCase().includes("sconosciuta") ||
        provincia.length < 2
      ) {
        await safeSendMessage(
          from,
          "❌ Non ho riconosciuto la provincia. Scrivi il nome o la sigla (es: CA, SS)."
        );
        return;
      }
      utente.dati["Provincia"] = provincia;
    } else {
      if (utente.step < chiavi.length) utente.dati[campoCorrente] = msg.body;
    }

    utente.step++;
    if (utente.step < domandePreventivo.length) {
      return safeSendMessage(from, domandePreventivo[utente.step]);
    }

    // invio al Google Apps Script (doGet JSONP)
    try {
      const formData = new URLSearchParams({
        ...utente.dati,
        "Data e ora": new Date().toLocaleString("it-IT", {
          timeZone: "Europe/Rome",
        }),
        callback: "handleResponse",
      });
      await axios.get(`${scriptPreventiviUrl}?${formData.toString()}`);
      await safeSendMessage(
        from,
        "✅ La tua richiesta di preventivo è stata registrata! Ti contatteremo presto."
      );
    } catch (err) {
      await safeSendMessage(
        from,
        "❌ Errore nel salvataggio della richiesta. Riprova più tardi."
      );
    }
    delete utentiInAttesa[from];
  }

  if (utente?.fase === "assistenza") {
    if (!utente.step) utente.step = 0;
    const chiavi = [
      "Nome",
      "Anno Acquisto",
      "Indirizzo Intervento",
      "Descrizione",
    ];
    const risposta = msg.body?.trim().toLowerCase();

    // step 4: foto
    if (utente.step === 4) {
      if (!utente.foto) utente.foto = [];
      if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        const uploadToDrive = require("./uploadToDrive");
        try {
          const publicUrl = await uploadToDrive(media);
          utente.foto.push(publicUrl);
          return safeSendMessage(
            from,
            "📸 Foto caricata! Invia altre oppure scrivi *qualunque cosa* per concludere."
          );
        } catch (error) {
          console.error("Errore upload su Drive:", error);
          return safeSendMessage(
            from,
            "❌ Errore nel caricamento della foto. Riprova."
          );
        }
      } else {
        utente.step++; // chiusura
      }

      if (utente.step === 5) {
        try {
          await axios.post(scriptAssistenzaUrl, {
            tipo: "assistenza",
            nome: utente.dati["Nome"],
            anno: utente.dati["Anno Acquisto"],
            indirizzo: utente.dati["Indirizzo Intervento"],
            descrizione: utente.dati["Descrizione"],
            foto: utente.foto.length ? utente.foto.join(", ") : "Nessuna",
          });
          await safeSendMessage(
            from,
            "✅ La tua segnalazione è stata inserita con successo. Ti ricontatteremo."
          );
        } catch {
          await safeSendMessage(
            from,
            "❌ Errore nell'invio della richiesta. Riprova più tardi."
          );
        }
        delete utentiInAttesa[from];
        return;
      }
      return;
    }

    // spiegazioni (prima dello step foto)
    if (
      utente.step < 4 &&
      ["?", "non so", "che vuol dire", "boh", "non ho capito"].some((p) =>
        risposta.includes(p)
      )
    ) {
      const spiegazione = await spiegaDomandaIA(
        assistenzaDomande[utente.step],
        msg.body
      );
      if (spiegazione) {
        await safeSendMessage(from, spiegazione);
        return safeSendMessage(from, assistenzaDomande[utente.step]);
      }
    }

    if (utente.step < chiavi.length) {
      utente.dati[chiavi[utente.step]] = msg.body;
      utente.step++;
    }

    if (utente.step < assistenzaDomande.length) {
      return safeSendMessage(from, assistenzaDomande[utente.step]);
    }
  }

  if (utente?.fase === "operatore") {
    const testo = msg.body?.trim().toLowerCase();
    const vaghi = ["ciao", "ok", "devo parlare", "aiuto", "è urgente"];
    if (!utente.dati["Messaggio"] && vaghi.includes(testo)) {
      return safeSendMessage(
        from,
        `😊 Mi aiuti a capire meglio come possiamo aiutarti?
Scrivimi se hai bisogno di un preventivo, assistenza o altre info.`
      );
    }

    if (!utente.dati["Messaggio"]) {
      const messaggioUtente = msg.body;
      utente.dati["Messaggio"] = messaggioUtente;

      await safeSendMessage(
        from,
        "✅ Il tuo messaggio è stato ricevuto. Ti risponderemo appena possibile!"
      );

      try {
        const categoria = await classificaRichiestaOperatore(messaggioUtente);
        await axios.post(process.env.GSCRIPT_OPERATOR_URL, {
          numero: from,
          ora: new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
          testo: messaggioUtente,
          categoria,
        });
      } catch (e) {
        console.error("❌ Errore invio email operatore:", e.message);
      }

      if (!utente.dati["fuoriOrario"]) chatManuale[from] = true;
      delete utentiInAttesa[from];
    }
  }
});

// Comandi dall’operatore (da WA Web)
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  const to = msg.id.remote;

  if (msg.body === "/manuale") {
    chatManuale[to] = true;
    console.log(`🟠 Modalità manuale attivata per ${to}`);
    await safeSendMessage(
      to,
      "✅ Chat impostata su *manuale*. Il bot non risponderà più."
    );
  }
  if (msg.body === "/automatico") {
    delete chatManuale[to];
    utentiInAttesa[to] = { fase: "menu" };
    console.log(`🟢 Modalità automatica riattivata per ${to}`);
    await safeSendMessage(
      to,
      "✅ Chat impostata su *automatica*. Il bot è nuovamente attivo."
    );
    await inviaMenuPrincipale(to);
  }
});

// API per switch manuale/automatico
app.post("/modalita-set", (req, res) => {
  const { numero, stato } = req.body;
  if (stato === "manuale") chatManuale[numero] = true;
  else delete chatManuale[numero];
  res.json({ manuale: !!chatManuale[numero] });
});
app.get("/modalita-stato/:numero", (req, res) => {
  const numero = req.params.numero;
  res.json({ numero, stato: chatManuale[numero] ? "manuale" : "automatica" });
});

// Pulizia settimanale cache
setInterval(() => {
  console.log("🧹 Pulizia settimanale in corso...");
  const c1 = Object.keys(chatManuale).length;
  const c2 = Object.keys(utentiInAttesa).length;
  const c3 = Object.keys(ultimaAttivita).length;
  Object.keys(chatManuale).forEach((k) => delete chatManuale[k]);
  Object.keys(utentiInAttesa).forEach((k) => delete utentiInAttesa[k]);
  Object.keys(ultimaAttivita).forEach((k) => delete ultimaAttivita[k]);
  console.log(
    `✅ Pulizia completata. Rimossi ${c1} chatManuale, ${c2} utentiInAttesa, ${c3} ultimaAttivita`
  );
}, 7 * 24 * 60 * 60 * 1000);

// Reset flag messaggi di cortesia (ogni 12h elimina record più vecchi di 3 giorni)
setInterval(() => {
  console.log("♻️ Pulizia flag haRicevutoCortesia (3 giorni)");
  for (const numero in haRicevutoCortesia) {
    if (Date.now() - haRicevutoCortesia[numero] > 3 * 24 * 60 * 60 * 1000) {
      delete haRicevutoCortesia[numero];
    }
  }
}, 12 * 60 * 60 * 1000);

// Timeout inattività utenza (3 giorni) – non riavvia il client
setInterval(() => {
  if (!clientPronto) return;
  const now = Date.now();
  let scaduti = 0;

  for (const numero in ultimaAttivita) {
    if (chatManuale[numero]) continue;
    const inattivoDa = now - ultimaAttivita[numero];
    if (inattivoDa > 3 * 24 * 60 * 60 * 1000) {
      const utente = utentiInAttesa[numero];
      if (
        utente &&
        ["preventivo", "assistenza", "operatore"].includes(utente.fase)
      ) {
        safeSendMessage(
          numero,
          "⏳ La conversazione è scaduta per inattività.\nScrivi *ciao* o *menu* per ricominciare 😊"
        );
      }

      delete utentiInAttesa[numero];
      delete ultimaAttivita[numero];
      scaduti++;
    }
  }
  if (scaduti > 0)
    console.log(`🕓 Timeout: ${scaduti} utenti rimossi per inattività.`);
}, 60 * 1000);

// Stato bot
app.get("/stato-bot", (req, res) => {
  res.json({
    clientPronto,
    utentiInAttesa: Object.keys(utentiInAttesa).length,
    chatManuale: Object.keys(chatManuale).length,
    codaMessaggi: sendQueue.length,
    invioInCorso: sending,
    oraServer: new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
  });
});

// ───────────────────────────────────────────────────────────
// Monitor stato connessione (riavvia SOLO se davvero down)
// ───────────────────────────────────────────────────────────
let lastConnectedTs = Date.now();

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

// ───────────────────────────────────────────────────────────
// Avvio
// ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🌐 API in ascolto su http://localhost:${PORT}`)
);

client.initialize();
