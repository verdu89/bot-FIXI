#!/bin/bash

echo "🚀 Inizio installazione del bot WhatsApp..."

# Aggiorna pacchetti
sudo apt update && sudo apt upgrade -y

# Installa dipendenze di sistema (incluso Chromium)
sudo apt install -y git curl wget unzip build-essential \
libatk-bridge2.0-0 libatk1.0-0 libgbm1 libnspr4 libnss3 libxss1 \
libasound2 libxcomposite1 libxdamage1 libxrandr2 libdrm2 xdg-utils \
fonts-liberation chromium-browser

# Installa Node.js LTS 18 + npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Installa PM2
sudo npm install -g pm2

# Installa le dipendenze del progetto
npm install

# Se non esiste il file .env, crea un esempio base
if [ ! -f .env ]; then
  echo "⚙️ Generazione file .env..."
  cat <<EOF > .env
OPENAI_API_KEY=INSERISCI_LA_TUA_CHIAVE
GOOGLE_PREVENTIVI_SCRIPT_URL=https://script.google.com/macros/s/XXX/exec
GOOGLE_ASSISTENZA_SCRIPT_URL=https://script.google.com/macros/s/YYY/exec
GSCRIPT_OPERATOR_URL=https://script.google.com/macros/s/ZZZ/exec
PORT=3000
ADMIN_API_KEY=supersegreto
EOF
  echo "⚠️ File .env generato. Ricordati di modificarlo con i tuoi dati!"
fi

# Avvia il bot con PM2
echo "🚀 Avvio del bot con PM2..."
pm2 start bot.js --name whatsapp-bot
pm2 save
pm2 startup | tail -n 1 | bash

echo "✅ Bot WhatsApp installato e avviato!"
echo "👉 Usa 'pm2 logs whatsapp-bot' per vedere i log."
