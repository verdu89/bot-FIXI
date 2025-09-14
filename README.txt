🤖 FIXI

Assistente WhatsApp aziendale basato su Node.js e whatsapp-web.js.  
Gestisce preventivi, assistenza e messaggi automatici per i clienti.  

------------------------------------------------------------
🚀 Funzionalità principali
------------------------------------------------------------
- Messaggio di cortesia intelligente → inviato massimo una volta ogni 3 giorni per cliente.  
- Menu interattivo con 5 opzioni (preventivo, prodotti, operatore, assistenza, sedi).  
- Gestione orari e festività.  
- Modalità manuale/automatica (quando risponde un operatore il bot si ferma).  
- Coda invii robusta (nessun messaggio perso, anche se si disconnette).  
- Integrazione con Google Apps Script (preventivi e assistenza).  
- API Express per controllare lo stato del bot.  
- Autoriavvio e riconnessione automatica in caso di disconnessione.  

------------------------------------------------------------
📦 Requisiti
------------------------------------------------------------
- Node.js >= 18  
- NPM  
- Chromium o Google Chrome installato sul server  
- WhatsApp Business/Personale su un numero dedicato  

------------------------------------------------------------
⚙️ Installazione
------------------------------------------------------------
1. Clona il progetto e installa le dipendenze:

   git clone https://github.com/tuo-user/saverbot.git
   cd saverbot
   npm install

2. Crea un file .env con le tue variabili:

   OPENAI_API_KEY=la_tua_api_key_openai
   GOOGLE_PREVENTIVI_SCRIPT_URL=url_google_script_preventivi
   GOOGLE_ASSISTENZA_SCRIPT_URL=url_google_script_assistenza
   GSCRIPT_OPERATOR_URL=url_google_script_operator
   PORT=3000

------------------------------------------------------------
▶️ Avvio locale
------------------------------------------------------------
Avvia il bot:

   node index.js

- Al primo avvio verrà mostrato un QR code in console → scansiona con WhatsApp.  
- La sessione viene salvata in ./session quindi non serve riscanalizzare ogni volta.  

------------------------------------------------------------
💬 Comandi WhatsApp (operatore)
------------------------------------------------------------
- /manuale → blocca il bot per quella chat.  
- /automatico → riattiva il bot e mostra il menu.  

------------------------------------------------------------
🖥️ API Express
------------------------------------------------------------
Il bot espone delle API locali (default http://localhost:3000):

- GET /stato-bot → stato del client (utenti attivi, coda messaggi, ecc.).  
- POST /modalita-set → forza manuale/automatica per un numero.  
- GET /modalita-stato/:numero → controlla se un numero è in manuale o automatico.  

------------------------------------------------------------
🔄 Avvio come servizio con PM2
------------------------------------------------------------
Per mantenere il bot sempre attivo in background:

1. Installa pm2:
   npm install -g pm2

2. Avvia SaverBot:
   pm2 start index.js --name saverbot

3. Controlla lo stato:
   pm2 status

4. Guarda i log:
   pm2 logs saverbot

5. Riavvia se serve:
   pm2 restart saverbot

6. Avvio automatico al boot del server:
   pm2 startup
   pm2 save

------------------------------------------------------------
🔧 Note operative
------------------------------------------------------------
- Il messaggio di cortesia viene inviato una sola volta ogni 3 giorni per cliente.  
- Le sessioni scadono dopo 3 giorni di inattività.  
- Se WhatsApp si disconnette, il bot tenta la riconnessione automatica.  
- Ogni settimana viene effettuata la pulizia cache.  

------------------------------------------------------------
📊 Monitoraggio
------------------------------------------------------------
Puoi interrogare /stato-bot per integrare il monitoraggio con sistemi esterni (Grafana, Healthcheck, ecc.).
