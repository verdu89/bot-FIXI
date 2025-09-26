const axios = require("axios");
const { safeSendMessage } = require("../queue");
const { utentiInAttesa } = require("../state");

// 🔧 Normalizza il numero WhatsApp in formato internazionale
function normalizzaNumero(from) {
  let numero = from.replace("@c.us", "");

  if (numero.startsWith("+")) return numero;
  if (numero.startsWith("39")) return "+" + numero;
  if (numero.startsWith("3")) return "+39" + numero;
  if (numero.startsWith("0")) return "+39" + numero;
  return "+" + numero;
}

// 🔹 Domande del flusso preventivo
const domandePreventivo = [
  "Qual è il tuo *Nome e Cognome / Ragione sociale*?",
  "La tua *email*?",
  "In quale *provincia va effettuato il lavoro*?",
  "In quale *comune*?",
  "Descrivi la richiesta con *misure orientative (larghezza x altezza)*.\nSe non le hai ancora, indica almeno a quale prodotto sei interessato. N.B. invia tutto in un unico messaggio",
];

// 🔹 Gestione del flusso preventivo
async function gestisciPreventivo(
  msg,
  utente,
  from,
  scriptPreventiviUrl,
  spiegaDomandaIA
) {
  if (!utente.step) utente.step = 0;
  if (!utente.dati) utente.dati = {};

  const chiavi = ["Nome", "Email", "Provincia", "Comune", "Messaggio"];
  const risposta = msg.body?.trim() || "";
  const rispostaLower = risposta.toLowerCase();

  console.log("─────────────────────────────");
  console.log(
    `📩 [PREVENTIVO] Nuovo messaggio da ${from} | step=${
      utente.step
    } | completato=${utente.completato || false}`
  );
  console.log(`✉️ Testo ricevuto: "${risposta}"`);

  // ──────────────────────────────────────────────
  // Se l'utente ha già completato un preventivo
  // ──────────────────────────────────────────────
  if (utente.completato) {
    console.log(`⚠️ Utente ${from} ha già completato un preventivo.`);

    if (rispostaLower === "ciao") {
      console.log(`🔄 Utente ${from} ha scelto di ricominciare.`);
      delete utentiInAttesa[from];
      return safeSendMessage(
        from,
        "👋 Ciao! Ripartiamo da capo.\n\n" + domandePreventivo[0]
      );
    }

    if (rispostaLower === "annulla") {
      console.log(
        `⛔ Utente ${from} ha annullato la conversazione post-completamento.`
      );
      delete utentiInAttesa[from];
      return safeSendMessage(
        from,
        "🔴 Conversazione annullata. Scrivi *ciao* per ricominciare."
      );
    }

    console.log(
      `ℹ️ Utente ${from} ha scritto dopo il completamento, nessun reinvio a Google Sheet.`
    );
    return safeSendMessage(
      from,
      "✅ Hai già inviato una richiesta di preventivo.\nUn nostro operatore ti ricontatterà presto.\n\n👉 Scrivi *ciao* per ricominciare."
    );
  }

  // ──────────────────────────────────────────────
  // Comando annulla
  // ──────────────────────────────────────────────
  if (rispostaLower === "annulla") {
    console.log(`⛔ Preventivo annullato da ${from} allo step=${utente.step}`);
    delete utentiInAttesa[from];
    return safeSendMessage(
      from,
      "🔴 Preventivo annullato. Scrivi *ciao* per ricominciare."
    );
  }

  // ──────────────────────────────────────────────
  // Spiegazione AI (solo prima della chiusura)
  // ──────────────────────────────────────────────
  if (
    utente.step < chiavi.length &&
    ["?", "non so", "che vuol dire", "boh", "non ho capito"].some((p) =>
      rispostaLower.includes(p)
    )
  ) {
    console.log(
      `🤖 Utente ${from} non ha capito la domanda step=${utente.step}`
    );
    const spiegazione = await spiegaDomandaIA(
      domandePreventivo[utente.step],
      msg.body
    );

    if (spiegazione) {
      console.log(`📖 Invio spiegazione AI all'utente ${from}`);
      await safeSendMessage(from, spiegazione);
      return safeSendMessage(from, domandePreventivo[utente.step]);
    }
  }

  // ──────────────────────────────────────────────
  // Step 0–4: raccolta risposte
  // ──────────────────────────────────────────────
  if (utente.step < chiavi.length) {
    utente.dati[chiavi[utente.step]] = risposta;
    console.log(
      `✅ [SALVATAGGIO] ${
        chiavi[utente.step]
      } = "${risposta}" per utente ${from}`
    );
    utente.step++;
  }

  // se ci sono ancora domande → chiedi la prossima
  if (utente.step < domandePreventivo.length) {
    console.log(`👉 Invio prossima domanda step=${utente.step} a ${from}`);
    return safeSendMessage(from, domandePreventivo[utente.step]);
  }

  // ──────────────────────────────────────────────
  // Step finale: invio preventivo a Google Script
  // ──────────────────────────────────────────────
  if (utente.step === chiavi.length) {
    console.log(`📤 Invio preventivo a Google Script per ${from}`);

    try {
      const formData = new URLSearchParams({
        "Data e ora": new Date().toLocaleString("it-IT", {
          timeZone: "Europe/Rome",
        }),
        Nome: utente.dati["Nome"] || "",
        Telefono: normalizzaNumero(from),
        Email: utente.dati["Email"] || "",
        Provincia: utente.dati["Provincia"] || "",
        "Luogo di Consegna": utente.dati["Comune"] || "",
        Messaggio: utente.dati["Messaggio"] || "",
        callback: "handleResponse",
      });

      console.log(
        `🌍 Chiamata GET a: ${scriptPreventiviUrl}?${formData.toString()}`
      );
      await axios.get(`${scriptPreventiviUrl}?${formData.toString()}`);

      await safeSendMessage(
        from,
        "✅ La tua richiesta di preventivo è stata registrata con successo.\nUn nostro operatore ti ricontatterà al più presto 🙏\n\n👉 Scrivi *ciao* per tornare al menu principale."
      );
    } catch (err) {
      console.error(`❌ Errore invio preventivo per ${from}:`, err.message);
      await safeSendMessage(
        from,
        "❌ Errore nell'invio della richiesta. Riprova più tardi."
      );
    }

    // 🔴 CHIUDI davvero la conversazione
    delete utentiInAttesa[from];
    console.log(`🏁 Preventivo completato e conversazione chiusa per ${from}`);
  }
}

module.exports = {
  domandePreventivo,
  gestisciPreventivo,
  normalizzaNumero,
};
