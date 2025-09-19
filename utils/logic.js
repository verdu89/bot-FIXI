const { isOrarioLavorativo } = require("../utils/dateUtils");

// Stato globale condiviso (importati da index.js)
let chatManuale = {};
let utentiInAttesa = {};
let haRicevutoCortesia = {};

function initState(refs) {
  chatManuale = refs.chatManuale;
  utentiInAttesa = refs.utentiInAttesa;
  haRicevutoCortesia = refs.haRicevutoCortesia;
}

function shouldSendCortesia(from) {
  if (!isOrarioLavorativo()) return false;

  // già gestito da operatore → muto
  if (chatManuale[from]) return false;

  // già in attesa operatore → muto
  if (utentiInAttesa[from]?.fase === "operatore") return false;

  // già in un flusso (preventivo, assistenza, ecc.) → muto
  if (utentiInAttesa[from] && utentiInAttesa[from].fase !== "menu")
    return false;

  // controllo ultima cortesia (3 giorni)
  const last = haRicevutoCortesia[from];
  if (last && Date.now() - last < 3 * 24 * 60 * 60 * 1000) return false;

  // ok → invio
  haRicevutoCortesia[from] = Date.now();
  return true;
}

function shouldSendMenu(from, body, paroleChiave) {
  if (isOrarioLavorativo()) return false; // in orario → niente menu

  // già gestito da operatore → muto
  if (chatManuale[from]) return false;

  // già in attesa operatore → muto
  if (utentiInAttesa[from]?.fase === "operatore") return false;

  // già in un flusso (preventivo, assistenza, ecc.) → muto
  if (utentiInAttesa[from] && utentiInAttesa[from].fase !== "menu")
    return false;

  // parola chiave valida
  return paroleChiave.some((p) => body.includes(p));
}

module.exports = {
  initState,
  shouldSendCortesia,
  shouldSendMenu,
};
