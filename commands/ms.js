const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ALLOWED_MS_EMBED_ROLES } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ms')
    .setDescription('Envia uma mensagem simples em um canal específico.')
    .addStringOption(option =>
      option.setName('mensagem')
        .setDescription('Texto da mensagem')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal para enviar a mensagem')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hasPermission = ALLOWED_MS_EMBED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasPermission) {
      return interaction.editReply({
        content: '❌ Você não tem permissão para usar este comando.'
      });
    }

    const mensagem = interaction.options.getString('mensagem');
    const canal = interaction.options.getChannel('canal');

    if (!canal || typeof canal.send !== 'function') {
      return interaction.editReply({
        content: '❌ Canal inválido.'
      });
    }

    await canal.send(mensagem);

    return interaction.editReply({
      content: `✅ Mensagem enviada em ${canal}.`
    });
  }
};
