const fs = require('fs');
const path = './client_status.json';
const { getStatoBot } = require('./statoBot');
const { inviaEmailAlert, inviaMessaggioProprietario } = require('./alert');

function controllaStatoBot() {
  const stato = getStatoBot();
  const { clientPronto, alertInviato } = stato;

  if (!clientPronto) {
    if (!alertInviato) {
      console.log("❌ Bot disconnesso! Invio alert...");
      inviaEmailAlert("❌ Bot non connesso", "Il client WhatsApp non è attivo!");
      inviaMessaggioProprietario("⚠️ Il bot è disconnesso da WhatsApp.");

      stato.alertInviato = true;
      fs.writeFileSync(path, JSON.stringify(stato));
    } else {
      console.log("⚠️ Bot ancora disconnesso. Alert già inviato.");
    }
  } else {
    console.log("✅ Bot attivo, nessun problema.");
  }
}

controllaStatoBot();
