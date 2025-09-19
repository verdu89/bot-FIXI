const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { v4: uuidv4 } = require("uuid");

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

function authorize() {
  // Usa direttamente il file service-account.json
  const keyFilePath = path.join(__dirname, "../service-account.json");

  if (!fs.existsSync(keyFilePath)) {
    throw new Error(
      `❌ File service-account.json non trovato in ${keyFilePath}`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  return auth;
}

async function uploadToDrive(media) {
  const auth = authorize();
  const drive = google.drive({ version: "v3", auth });

  // Salva il file temporaneamente in locale
  const buffer = Buffer.from(media.data, "base64");
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
      fields: "id",
    });

    // Rendi il file pubblico
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const result = await drive.files.get({
      fileId: file.data.id,
      fields: "webViewLink",
    });

    return result.data.webViewLink;
  } finally {
    // Cancella il file temporaneo
    fs.unlinkSync(filePath);
  }
}

module.exports = uploadToDrive;
