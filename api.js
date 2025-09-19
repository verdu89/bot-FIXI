const express = require("express");
const bodyParser = require("body-parser");
const { safeSendMessage, sendQueue } = require("./queue");
const { getClientPronto } = require("./utils/statoBot");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());

// API per switch manuale/automatico
const chatManuale = {}; // stato locale delle chat manuali

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
    const { normalizzaNumero } = require("./flows/preventivo");
    const num = normalizzaNumero(numero);
    const chatId = num + "@c.us";

    const messaggio = `Gentile cliente, grazie per aver scelto la nostra azienda! 
                      Ci farebbe piacere ricevere una sua recensione. 
                      👉 Può lasciarla qui: https://maps.app.goo.gl/UbEqci5Pw7EJXkUx8`;

    try {
      // safeSendMessage ora deve ritornare un esito vero/falso
      const result = await safeSendMessage(chatId, messaggio);

      if (!result.ok) {
        const log = `[${new Date().toISOString()}] [RECENSIONE FALLITA] TO: ${num}\n${
          result.error
        }\n\n`;
        fs.appendFileSync("log_recensioni.txt", log);

        return res.json({
          ok: false,
          error: result.error || "Invio fallito",
          message: messaggio,
        });
      }

      const log = `[${new Date().toISOString()}] [RECENSIONE] TO: ${num}\n${messaggio}\n\n`;
      fs.appendFileSync("log_recensioni.txt", log);

      return res.json({ ok: true, sentAt: new Date().toISOString() });
    } catch (err) {
      const log = `[${new Date().toISOString()}] [RECENSIONE FALLITA] TO: ${num}\n${
        err.message
      }\n\n`;
      fs.appendFileSync("log_recensioni.txt", log);

      return res.json({
        ok: false,
        error: "Serve chat attiva",
        message: messaggio,
      });
    }
  } catch (err) {
    console.error("❌ Errore invio recensione WA:", err);
    const log = `[${new Date().toISOString()}] [ERRORE RECENSIONE] TO: ${numero}\n${
      err.message
    }\n\n`;
    fs.appendFileSync("log_recensioni.txt", log);

    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = { app, chatManuale };
