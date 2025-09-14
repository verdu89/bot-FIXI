const axios = require('axios');

// Inserisci qui l'URL del tuo Google Apps Script Webhook
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDNXZVLliqu9TVLAV5s0EsXW5fzTfHNRTjcE4dt4Dn9wDxfF4zwLHpPsGE--MGHEwnlQ/exec";

async function inviaEmailAlert(oggetto, messaggio) {
  try {
    const res = await axios.post(APPS_SCRIPT_URL, {
      tipo: "alert",
      oggetto,
      messaggio
    });
    console.log("📧 Email inviata:", res.data);
  } catch (err) {
    console.error("❌ Errore invio email:", err.response?.data || err.message);
  }
}

async function inviaMessaggioProprietario(testo) {
  // Se vuoi attivare anche l'alert via WhatsApp, inserisci qui client.sendMessage(...)
  console.log("🔔 Alert anche su WhatsApp (placeholder):", testo);
}

module.exports = {
  inviaEmailAlert,
  inviaMessaggioProprietario
};
