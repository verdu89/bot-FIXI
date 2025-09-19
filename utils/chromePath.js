const fs = require("fs");

function getChromePath() {
  const paths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  console.warn("⚠️ Chromium non trovato!");
  return null;
}

module.exports = { getChromePath };
