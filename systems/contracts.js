const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { 
  FREE_AGENT_ROLE_ID, 
  CONTRACT_ANNOUNCEMENT_CHANNEL 
} = require('../config/constants');

const CONTRACTS_FILE = path.join(__dirname, '../../contratos.json');

const pendingContracts = new Map();
const activeContracts = new Map();

function saveContracts() {
  const data = {};
  for (const [id, c] of activeContracts) {
    data[id] = {
      contractId: c.contractId,
      signee: { id: c.signee.id, username: c.signee.username },
      contractor: { id: c.contractor.id, username: c.contractor.username },
      teamName: c.teamName,
      teamRoleId: c.teamRoleId,
      position: c.position,
      role: c.role,
      emergency: c.emergency === true,
      proposedAt: c.proposedAt,
      signedAt: c.signedAt,
      channelId: c.channelId,
      guildId: c.guildId,
    };
  }
  fs.writeFileSync(CONTRACTS_FILE, JSON.stringify(data, null, 2));
}

function formatDate(date) {
  return date.toLocaleString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function loadContracts(client) {
  if (!fs.existsSync(CONTRACTS_FILE)) return;
  try {
    const contents = fs.readFileSync(CONTRACTS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(contents);
    for (const [id, c] of Object.entries(data)) {
      const contractData = {
        ...c,
        signee: c.signee,
        contractor: c.contractor,
        proposedAt: new Date(c.proposedAt),
        signedAt: new Date(c.signedAt),
      };
      activeContracts.set(id, contractData);
      console.log(`📂 Contrato carregado: ${c.signee.username} — ${c.teamName}`);
    }
    console.log(`✅ ${activeContracts.size} contrato(s) carregado(s) do disco.`);
  } catch (err) {
    console.error('Erro ao carregar contratos:', err);
  }
}

function generateContractId(signeeId, contractorId) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000000000);
  return `T${timestamp}_${random}`;
}

function countActiveEmergencyContracts(teamRoleId) {
  return [...activeContracts.values()].filter(contract =>
    contract.emergency === true && contract.teamRoleId === teamRoleId
  ).length;
}

module.exports = {
  pendingContracts,
  activeContracts,
  saveContracts,
  loadContracts,
  generateContractId,
  countActiveEmergencyContracts
};
