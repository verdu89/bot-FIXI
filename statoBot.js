const fs = require('fs');
const path = './client_status.json';

function setClientPronto(val) {
  const nuovoStato = {
    clientPronto: val,
    timestamp: Date.now(),
    alertInviato: false // resettiamo il flag quando il bot torna attivo
  };
  fs.writeFileSync(path, JSON.stringify(nuovoStato));
}

function getStatoBot() {
  try {
    const data = fs.readFileSync(path);
    return JSON.parse(data);
  } catch (err) {
    return {
      clientPronto: false,
      timestamp: 0,
      alertInviato: false
    };
  }
}

module.exports = { setClientPronto, getStatoBot };
