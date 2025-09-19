let clientPronto = false;

function setClientPronto(stato) {
  clientPronto = stato;
}

function getClientPronto() {
  return clientPronto;
}

module.exports = {
  setClientPronto,
  getClientPronto,
};
