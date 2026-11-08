const { Events } = require('discord.js');
const { LEAGUE_JOIN_CHANNEL_ID } = require('../config/constants');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      const channel = await client.channels.fetch(LEAGUE_JOIN_CHANNEL_ID);

      if (!channel || channel.guildId !== member.guild.id) return;
      if (!channel.isTextBased() || typeof channel.send !== 'function') {
        console.error(`Canal de entrada ${LEAGUE_JOIN_CHANNEL_ID} não aceita mensagens.`);
        return;
      }

      const message = await channel.send({
        content: `<@${member.id}>`,
        allowedMentions: { parse: [], users: [member.id] }
      });

      setTimeout(() => {
        message.delete().catch(error => {
          console.error('Erro ao apagar menção de entrada:', error);
        });
      }, 2000);
    } catch (error) {
      console.error('Erro ao enviar menção de entrada:', error);
    }
  }
};
