const { safeSendMessage } = require("../queue");
const { delay } = require("../utils/dateUtils");
const { CHIUSURA_FORZATA } = require("../utils/dateUtils");
function inviaMenuPrincipale(to) {
  const messaggio = `
🌙 *I nostri uffici sono chiusi*  
io sono *FIXI, l'assistente AI 🤖*. 
Come posso aiutarti?

1️⃣ Richiedi un preventivo  
2️⃣ Scopri i prodotti  
3️⃣ Assistenza post-vendita  
4️⃣ Dove siamo (sedi e orari)  

ℹ️ scrivi *annulla* per interrompere.

  `.trim();

  return safeSendMessage(to, messaggio);
}

async function inviaSedi(to) {
  const sedi = [
    `🏢 *Assemini* - Stabilimento/Uffici
📌 Quinta Strada Z.I. Macchiareddu
🕒 Lun–Ven 9:30–13 | 14–16
🔗 https://maps.app.goo.gl/UbEqci5Pw7EJXkUx8`,

    `🏢 *Cagliari* - Showroom
📌 Via della Pineta 96
🕒 Lun–Ven 10–13 | 15–18
🕒 Sab 10–13
🔗 https://maps.app.goo.gl/oWxbGF114TvYiYqk9`,

    `🏢 *Nuoro* - Showroom
📌 Via Badu e Carros
🕒 Lun–Ven 10–12:30 | 16–19
🔗 https://maps.app.goo.gl/EKHihgg3ghfhj2THA`,
  ];

  for (const sede of sedi) {
    await safeSendMessage(to, sede);
    await delay(800);
  }

  return safeSendMessage(to, `☎️ Info/Appuntamenti: *070 247362*`);
}

module.exports = {
  inviaMenuPrincipale,
  inviaSedi,
};

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

module.exports = {
  inviaMenuPrincipale,
  inviaSedi,
};
