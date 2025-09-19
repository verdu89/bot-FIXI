// Stato conversazioni condiviso

const utentiInAttesa = {}; // utenti che stanno compilando un flusso (preventivo, assistenza, operatore…)
const chatManuale = {}; // utenti presi in carico manualmente dall’operatore
const ultimaAttivita = {}; // timestamp ultimo messaggio ricevuto
const haRicevutoCortesia = {}; // memorizza chi ha ricevuto messaggi di cortesia

module.exports = {
  utentiInAttesa,
  chatManuale,
  ultimaAttivita,
  haRicevutoCortesia,
};
