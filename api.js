const express = require("express");
const bodyParser = require("body-parser");
const { safeSendMessage, sendQueue } = require("./queue");
const { getClientPronto } = require("./utils/statoBot");
const fs = require("fs");

// ✅ importa lo stato condiviso
const { chatManuale, haRicevutoCortesia } = require("./state");

const app = express();
app.use(bodyParser.json());

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

// Stato bot
app.get("/stato-bot", (req, res) => {
  res.json({
    clientPronto: getClientPronto(),
    codaMessaggi: sendQueue.length,
    oraServer: new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" }),
  });
});

app.post("/richiedi-recensione", async (req, res) => {
  const { numero } = req.body;

  try {
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Numero mancante" });
    }

    // 🔎 normalizza numero
    const { normalizzaNumero } = require("./flows/preventivo");
    const num = normalizzaNumero(numero);

    const messaggio = `🌟 Gentile cliente,
    grazie di cuore per averci scelto! La tua opinione per noi è preziosa 💙

    Se ti sei trovato bene con il nostro servizio, ci farebbe davvero piacere ricevere una tua recensione positiva ✍️✨

    👉 Lascia la tua recensione qui: https://maps.app.goo.gl/UbEqci5Pw7EJXkUx8

    Il tuo feedback ci aiuta a crescere e a offrire sempre il meglio 🙏`;

    // Manda in coda
    await safeSendMessage(num, messaggio);

    // Log su file
    const log = `[${new Date().toISOString()}] [RECENSIONE QUEUED] TO: ${num}\n${messaggio}\n\n`;
    fs.appendFileSync("log_recensioni.txt", log);

    return res.json({ ok: true, queuedAt: new Date().toISOString() });
  } catch (err) {
    console.error("❌ Errore invio recensione WA:", err);
    const log = `[${new Date().toISOString()}] [ERRORE RECENSIONE] TO: ${numero}\n${
      err.message
    }\n\n`;
    fs.appendFileSync("log_recensioni.txt", log);

    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/benvenuto", async (req, res) => {
  const { numero, nome } = req.body;

  try {
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Numero mancante" });
    }

    // 🔎 normalizza numero
    const { normalizzaNumero } = require("./flows/preventivo");
    const num = normalizzaNumero(numero);

    const messaggio = `Grazie per averci contattato! Abbiamo ricevuto la tua richiesta e un nostro consulente ti ricontatterà al più presto per fornirti tutte le informazioni di cui hai bisogno.

Nel frattempo, puoi esplorare la nostra gamma completa di prodotti sul nostro sito web: https://www.infissipvcsardegna.com/
`;

    // Manda in coda
    await safeSendMessage(num, messaggio);

    // 🔒 segna subito la cortesia → evita doppio invio
    haRicevutoCortesia[num] = Date.now();

    // Log su file
    const log = `[${new Date().toISOString()}] [BENVENUTO QUEUED] TO: ${num}\n${messaggio}\n\n`;
    fs.appendFileSync("log_benvenuti.txt", log);

    return res.json({ ok: true, queuedAt: new Date().toISOString() });
  } catch (err) {
    console.error("❌ Errore invio benvenuto WA:", err);
    const log = `[${new Date().toISOString()}] [ERRORE BENVENUTO] TO: ${numero}\n${
      err.message
    }\n\n`;
    fs.appendFileSync("log_benvenuti.txt", log);

    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = { app, chatManuale };
