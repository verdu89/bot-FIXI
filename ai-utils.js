const OpenAI = require("openai");
const fs = require("fs");
const { safeSendMessage } = require("./queue");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Funzione helper per loggare tutte le interazioni IA
function logIA(tipo, from, input, output) {
  const log = `[${new Date().toISOString()}] [${tipo}] FROM: ${from}\nUSER: ${input}\nAI: ${output}\n\n`;
  fs.appendFileSync("log_ia_full.txt", log);
}

async function chiediProdottiOpenAI(from = "unknown") {
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
- Controcasse

Non menzionare altri prodotti. Rispondi con tono adatto a WhatsApp e invita a visitare il sito https://infissipvcsardegna.com.
Se pensi che l’utente debba tornare al menu principale o usare il menu, non spiegare nulla e restituisci SOLO il numero del menu corrispondente (es: "1", "2", "3", "4").


`,
        },
        { role: "user", content: "Vorrei sapere di più sui vostri prodotti." },
      ],
      temperature: 0.6,
      max_tokens: 500,
    });

    const risposta = completion.choices[0].message.content.trim();
    logIA(
      "Prodotti",
      from,
      "Vorrei sapere di più sui vostri prodotti.",
      risposta
    );
    return risposta;
  } catch (err) {
    console.error("❌ Errore OpenAI:", err.message);
    return "⚠️ Al momento non riesco a recuperare le informazioni sui nostri prodotti. Riprova tra poco.";
  }
}

async function rispostaIA(testoUtente, from = "unknown") {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `
          Sei *FIXI*, l’assistente WhatsApp ufficiale di *Saverplast*.

          🎯 Obiettivo: aiutare l’utente in modo chiaro e guidarlo verso il menu.

          📌 Menu principale (rispondi SOLO con il numero quando serve):
          1️⃣ Richiedi un preventivo  
          2️⃣ Scopri i prodotti  
          3️⃣ Assistenza post-vendita  
          4️⃣ Dove siamo (sedi e orari)

          📌 Copri solo: infissi PVC, persiane/scuri, zanzariere, tapparelle, scorrevoli,
          porte blindate, vetrate panoramiche, tende oscuranti/filtranti, orari/showroom/assistenza.

          ✅ Se l’utente ti chiede di usare il menu → restituisci SOLO il numero corrispondente (es: "1", "2", "3", "4").
          ✅ Se domanda frequente → rispondi breve e ricorda l’opzione del menu se utile.
          ❌ Se argomento non pertinente → invita a scrivere *1* per preventivo o *3* per assistenza.

          ⚠️ Importante: quando restituisci un numero, NON aggiungere altro testo. Solo "1", "2", "3" o "4".`,
        },

        { role: "user", content: testoUtente },
      ],
      temperature: 0.6,
      max_tokens: 500,
    });

    const risposta = completion.choices[0].message.content.trim();
    logIA("RispostaLibera", from, testoUtente, risposta);
    return risposta;
  } catch (err) {
    console.error("❌ Errore IA in rispostaIA:", err.message);
    await safeSendMessage(
      "393465788657@c.us",
      "⚠️ La IA ha smesso di rispondere. Verifica credito OpenAI."
    );
    logIA("RispostaLibera-Errore", from, testoUtente, `ERRORE: ${err.message}`);
    return "⚠️ Al momento non riesco a rispondere automaticamente. Scrivi *1* per un preventivo o *3* per assistenza.";
  }
}

async function spiegaDomandaIA(domanda, rispostaUtente, from = "unknown") {
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

    const risposta = completion.choices[0].message.content.trim();
    logIA(
      "Spiegazione",
      from,
      `${domanda} | Risposta: ${rispostaUtente}`,
      risposta
    );
    return risposta;
  } catch (err) {
    console.error("❌ Errore IA in spiegaDomandaIA:", err.message);
    await safeSendMessage(
      "393465788657@c.us",
      "⚠️ FIXI non riesce a spiegare una domanda. Controlla la IA."
    );
    logIA(
      "Spiegazione-Errore",
      from,
      `${domanda} | ${rispostaUtente}`,
      `ERRORE: ${err.message}`
    );
    return "⚠️ Scusa, non riesco a spiegarti meglio in questo momento. Scrivi *3* per assistenza.";
  }
}

async function classificaRichiestaOperatore(testoUtente, from = "unknown") {
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

    const risposta = completion.choices[0].message.content.trim();
    logIA("Classificazione", from, testoUtente, risposta);
    return risposta;
  } catch (err) {
    console.error("❌ Errore IA in classificaRichiestaOperatore:", err.message);
    await safeSendMessage(
      "393465788657@c.us",
      "⚠️ Fixi non riesce a classificare una richiesta."
    );
    logIA(
      "Classificazione-Errore",
      from,
      testoUtente,
      `ERRORE: ${err.message}`
    );
    return "Altro";
  }
}

module.exports = {
  chiediProdottiOpenAI,
  rispostaIA,
  spiegaDomandaIA,
  classificaRichiestaOperatore,
};
