const fs = require('fs');
const path = require('path');

const TRANSFER_WINDOW_FILE = path.join(__dirname, '../../transfer_window.json');

let transferWindow = {
  clubs: false,
  freeAgent: true
};

function saveTransferWindow() {
  fs.writeFileSync(TRANSFER_WINDOW_FILE, JSON.stringify(transferWindow, null, 2));
}

function loadTransferWindow() {
  if (!fs.existsSync(TRANSFER_WINDOW_FILE)) {
    saveTransferWindow();
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(TRANSFER_WINDOW_FILE, 'utf8'));
    transferWindow.clubs = data.clubs ?? false;
    transferWindow.freeAgent = data.freeAgent ?? true;
    console.log(`📂 Janelas carregadas — Clubs: ${transferWindow.clubs ? '🟢 Aberta' : '🔴 Fechada'} | Free Agent: ${transferWindow.freeAgent ? '🟢 Aberta' : '🔴 Fechada'}`);
  } catch (err) {
    console.error('Erro ao carregar transfer window:', err);
    saveTransferWindow();
  }
}

function getTransferWindow() {
  return transferWindow;
}

function setTransferWindow(key, value) {
  transferWindow[key] = value;
  saveTransferWindow();
}

module.exports = {
  loadTransferWindow,
  getTransferWindow,
  setTransferWindow
};
