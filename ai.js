const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Assicurati che la tua chiave sia in .env
});

async function ottieniProvinciaCorretta(localita) {
  const prompt = `
Restituisci solo il nome della provincia italiana attuale associata alla località: "${localita}".
✔️ Se è un comune, restituisci la provincia.
✔️ Se è una sigla (es. "CA", "ss"), restituisci la provincia.
✔️ Se è una provincia non più esistente (es. "Olbia"), restituisci la provincia attuale (es. "Sassari").
❌ NON scrivere altro. Niente spiegazioni. Nessun "Provincia:". Nessuna frase completa.
✅ SOLO il nome della provincia. Esempio valido: Cagliari
`;

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4", // o "gpt-3.5-turbo" per versioni più economiche
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const risposta = chat.choices[0].message.content;
    return risposta.trim().replace(/["']/g, '');
  } catch (error) {
    console.error("Errore AI:", error.message);
    return null;
  }
}

module.exports = { ottieniProvinciaCorretta };
