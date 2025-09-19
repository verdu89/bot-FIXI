const axios = require("axios");
const { safeSendMessage } = require("../queue");

// 🔧 Helper: normalizza il numero WhatsApp
function normalizzaNumero(from) {
  let numero = from.replace("@c.us", ""); // es. 393465788657

  if (numero.startsWith("+")) return numero;
  if (numero.startsWith("39")) return "+" + numero;
  if (numero.startsWith("3")) return "+39" + numero;
  if (numero.startsWith("0")) return "+39" + numero;
  return "+" + numero;
}

const assistenzaDomande = [
  "Come ti chiami? (Nome e Cognome)",
  "In che anno hai acquistato il prodotto?",
  "Qual è l'indirizzo dove serve l'intervento?",
  "Descrivi il problema riscontrato",
  // step 4 riservato a foto
];

async function gestisciAssistenza(
  msg,
  utente,
  from,
  scriptAssistenzaUrl,
  spiegaDomandaIA
) {
  if (!utente.step) utente.step = 0;
  const chiavi = [
    "Nome",
    "Anno Acquisto",
    "Indirizzo Intervento",
    "Descrizione",
  ];
  const risposta = msg.body?.trim();

  console.log(
    `🛠️ Assistenza step=${utente.step} da ${from}, body="${risposta}"`
  );

  // ──────────────────────────────────────────────
  // STEP 4: gestione foto e chiusura
  // ──────────────────────────────────────────────
  if (utente.step === 4) {
    if (!utente.foto) utente.foto = [];

    // chiusura con "fine"
    if (risposta?.toLowerCase() === "fine") {
      console.log(`📤 Invio segnalazione assistenza per ${from}`);

      try {
        const formData = new URLSearchParams({
          Data: new Date().toLocaleString("it-IT", {
            timeZone: "Europe/Rome",
          }),
          Nome: utente.dati["Nome"] || "",
          Telefono: normalizzaNumero(from),
          "Anno Acquisto": utente.dati["Anno Acquisto"] || "",
          "Indirizzo Intervento": utente.dati["Indirizzo Intervento"] || "",
          Descrizione: utente.dati["Descrizione"] || "",
          Foto: utente.foto.length ? utente.foto.join(", ") : "Nessuna",
        });

        console.log(
          `🌍 Invio richiesta assistenza a Google Script: ${scriptAssistenzaUrl}?${formData.toString()}`
        );

        await axios.get(`${scriptAssistenzaUrl}?${formData.toString()}`);

        console.log(`✅ Segnalazione assistenza registrata per ${from}`);
        await safeSendMessage(
          from,
          "✅ La tua segnalazione è stata registrata con successo.\n👉 Scrivi *ciao* per tornare al menu principale."
        );
      } catch (err) {
        console.error("❌ Errore invio assistenza:", err.message);
        await safeSendMessage(
          from,
          "❌ Errore nell'invio della richiesta. Riprova più tardi."
        );
      }

      // 🔴 Marca la sessione come completata
      utente.completato = true;
      utente.step = assistenzaDomande.length;
      console.log(`🏁 Assistenza completata e marcata per ${from}`);
      return;
    }

    // se arriva media → carica foto
    if (msg.hasMedia) {
      console.log(`📥 Foto ricevuta da ${from}`);
      const media = await msg.downloadMedia();
      const uploadToDrive = require("../utils/uploadToDrive");

      try {
        const publicUrl = await uploadToDrive(media);
        utente.foto.push(publicUrl);
        console.log(`📸 Foto caricata su Drive: ${publicUrl}`);

        return safeSendMessage(
          from,
          "📸 Foto ricevuta! Invia un’altra oppure scrivi *fine* per inviare la tua richiesta di assistenza."
        );
      } catch (error) {
        console.error("❌ Errore upload su Drive:", error);
        return safeSendMessage(
          from,
          "❌ Errore nel caricamento della foto. Riprova."
        );
      }
    }

    // se non è né fine né media
    console.log(`ℹ️ Input non valido allo step 4 da ${from}`);
    return safeSendMessage(
      from,
      "ℹ️ Invia una foto del problema, oppure scrivi *fine* per inviare la tua richiesta di assistenza."
    );
  }

  // ──────────────────────────────────────────────
  // Spiegazioni AI (solo prima delle foto)
  // ──────────────────────────────────────────────
  if (
    utente.step < 4 &&
    ["?", "non so", "che vuol dire", "boh", "non ho capito"].some((p) =>
      risposta?.toLowerCase().includes(p)
    )
  ) {
    console.log(`🤖 Utente ${from} non ha capito la domanda ${utente.step}`);
    const spiegazione = await spiegaDomandaIA(
      assistenzaDomande[utente.step],
      msg.body
    );

    if (spiegazione) {
      await safeSendMessage(from, spiegazione);
      return safeSendMessage(from, assistenzaDomande[utente.step]);
    }
  }

  // ──────────────────────────────────────────────
  // Step 0–3: domande testuali
  // ──────────────────────────────────────────────
  if (utente.step < chiavi.length) {
    utente.dati[chiavi[utente.step]] = msg.body;
    console.log(
      `📝 Salvo risposta [${chiavi[utente.step]}] = "${msg.body}" per ${from}`
    );
    utente.step++;
  }

  // se ci sono ancora domande → chiedi la prossima
  if (utente.step < assistenzaDomande.length) {
    console.log(`👉 Invio prossima domanda step=${utente.step} a ${from}`);
    return safeSendMessage(from, assistenzaDomande[utente.step]);
  } else {
    // arrivati allo step foto
    utente.step = 4;
    console.log(`📷 Inizio raccolta foto per ${from}`);
    return safeSendMessage(
      from,
      "📷 Ora puoi inviare una o più *foto* del problema.\n✅ Quando hai finito, scrivi *fine* per inviare la tua richiesta di assistenza."
    );
  }
}

module.exports = {
  assistenzaDomande,
  gestisciAssistenza,
};
