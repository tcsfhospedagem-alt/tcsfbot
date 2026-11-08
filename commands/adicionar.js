const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { addMemberToTicket, isTicketChannel } = require('../systems/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adicionar')
    .setDescription('Adiciona uma pessoa a este ticket.')
    .addUserOption(option =>
      option.setName('pessoa')
        .setDescription('Pessoa que terá acesso ao ticket')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.inGuild() || !isTicketChannel(interaction.channel)) {
      return interaction.editReply({ content: '❌ Este comando só pode ser usado em um ticket válido.' });
    }

    const user = interaction.options.getUser('pessoa', true);
    let member;
    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch (error) {
      if (error.code === 10007) {
        return interaction.editReply({ content: '❌ Essa pessoa não faz parte deste servidor.' });
      }
      throw error;
    }

    try {
      await addMemberToTicket(interaction.channel, member);
    } catch (error) {
      console.error('Erro ao adicionar pessoa ao ticket:', error);
      return interaction.editReply({
        content: '❌ Não foi possível adicionar essa pessoa. Verifique as permissões do bot e tente novamente.'
      });
    }

    return interaction.editReply({ content: `✅ ${member} agora tem acesso a este ticket.` });
  }
};
