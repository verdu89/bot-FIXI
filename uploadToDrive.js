const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

// 👉 Inserisci qui l'ID della cartella su Drive dove caricare le foto
const FOLDER_ID = '1BQ06s-B5v-pD2YEq1AKlLTPrl1N4hzM8'; // Assistenza Foto - Whatsapp

// 🔐 Caricamento delle credenziali
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

function authorize() {
    const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, 'service-account.json')));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    return auth;
  }
  

async function uploadToDrive(media) {
  const auth = authorize();
  const drive = google.drive({ version: 'v3', auth });

  // Salva il file temporaneamente in locale
  const buffer = Buffer.from(media.data, 'base64');
  const fileName = `foto_${uuidv4()}.jpg`;
  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, buffer);

  try {
    const fileMetadata = {
      name: fileName,
      parents: [FOLDER_ID],
    };

    const mediaData = {
      mimeType: media.mimetype,
      body: fs.createReadStream(filePath),
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: mediaData,
      fields: 'id',
    });

    // Rendi il file pubblico
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    const result = await drive.files.get({
      fileId: file.data.id,
      fields: 'webViewLink',
    });

    return result.data.webViewLink;
  } catch (error) {
    throw error;
  } finally {
    // Cancella il file temporaneo
    fs.unlinkSync(filePath);
  }
}

module.exports = uploadToDrive;
