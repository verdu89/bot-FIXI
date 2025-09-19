const axios = require("axios");

// 🔑 URL viene letto dalle variabili d’ambiente
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

async function inviaEmailAlert(oggetto, messaggio) {
  if (!APPS_SCRIPT_URL) {
    console.error("⚠️ Variabile APPS_SCRIPT_URL non configurata");
    return;
  }

  try {
    const res = await axios.post(APPS_SCRIPT_URL, {
      tipo: "alert",
      oggetto,
      messaggio,
    });
    console.log("📧 Email inviata:", res.data);
  } catch (err) {
    console.error("❌ Errore invio email:", err.response?.data || err.message);
  }
}

async function inviaMessaggioProprietario(testo) {
  // Puoi collegarlo al client WhatsApp se vuoi, per ora è placeholder
  console.log("🔔 Alert anche su WhatsApp (placeholder):", testo);
}

module.exports = {
  inviaEmailAlert,
  inviaMessaggioProprietario,
};
