const { Events } = require('discord.js');
const { notifyTicketOwnerLeft } = require('../systems/tickets');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      await notifyTicketOwnerLeft(member);
    } catch (error) {
      console.error('Erro ao localizar tickets do membro que saiu:', error);
    }
  }
};
