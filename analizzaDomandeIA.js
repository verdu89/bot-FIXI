const fs = require('fs');
const path = 'log_domande_ia.txt';
const outputFile = 'faq_generate.txt';

if (!fs.existsSync(path)) {
    console.log('❌ Nessun log trovato.');
    process.exit(0);
}

const contenuto = fs.readFileSync(path, 'utf-8');

// Estrae solo le domande (senza numeri e date)
const righe = contenuto
    .split('\n')
    .map(r => r.trim())
    .filter(r => r.includes(':')) // solo righe valide
    .map(r => r.split(':').slice(1).join(':').trim().toLowerCase());

// Conta le occorrenze
const conteggio = {};
for (const domanda of righe) {
    if (!domanda) continue;
    conteggio[domanda] = (conteggio[domanda] || 0) + 1;
}

// Ordina per frequenza
const domandeFrequenza = Object.entries(conteggio)
    .sort((a, b) => b[1] - a[1]);

console.log('📊 Domande frequenti gestite dall’IA:\n');
domandeFrequenza.slice(0, 10).forEach(([domanda, n], i) => {
    console.log(`${i + 1}. "${domanda}" → ${n} volte`);
});

// Genera blocco FAQ
let faqBlock = '\n📌 Domande frequenti (se la domanda è molto simile, rispondi direttamente):\n\n';
domandeFrequenza.slice(0, 10).forEach(([domanda]) => {
    const domandaFormattata = domanda.charAt(0).toUpperCase() + domanda.slice(1);
    faqBlock += `- “${domandaFormattata}”\n➡️ [Scrivi qui la risposta]\n\n`;
});

// Salva su file
fs.writeFileSync(outputFile, faqBlock.trim());
console.log(`\n✅ FAQ generate salvate in: ${outputFile}`);
