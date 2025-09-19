const { DateTime } = require("luxon");

// Giorni festivi
const dateChiuse = [
  // ==== 2025 ====
  "2025-01-01",
  "2025-01-06",
  "2025-04-20",
  "2025-04-21",
  "2025-04-25",
  "2025-05-01",
  "2025-06-02",
  "2025-08-15",
  "2025-11-01",
  "2025-12-08",
  "2025-12-25",
  "2025-12-26",
  // ==== 2026 ====
  "2026-01-01",
  "2026-01-06",
  "2026-04-05",
  "2026-04-06",
  "2026-04-25",
  "2026-12-26",
];

const CHIUSURA_FORZATA = true;

function isOrarioLavorativo() {
  if (CHIUSURA_FORZATA) return false;

  const nowRome = DateTime.now().setZone("Europe/Rome");
  const giorno = nowRome.weekday; // 1 = Lunedì ... 7 = Domenica
  const orarioDec = nowRome.hour + nowRome.minute / 60;
  const oggi = nowRome.toISODate();

  const lavorativo = giorno >= 1 && giorno <= 5 && !dateChiuse.includes(oggi);
  const fascia = orarioDec >= 9.5 && orarioDec < 16.0; // 09:30–16:00
  return lavorativo && fascia;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = {
  isOrarioLavorativo,
  delay,
  dateChiuse,
  CHIUSURA_FORZATA,
};
