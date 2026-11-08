const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  ALLOWED_FRIENDLY_CHANNELS,
  FRIENDLY_ANNOUNCEMENT_CHANNEL,
  ALLOWED_COMMAND_ROLES
} = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('friendly')
    .setDescription('Publique um anúncio de Friendly.')
    .addStringOption(option =>
      option.setName('descricao')
        .setDescription('Descrição do seu anúncio')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.inGuild() || !ALLOWED_FRIENDLY_CHANNELS.includes(interaction.channelId)) {
      return interaction.editReply({
        content: `❌ Use este comando no canal <#${ALLOWED_FRIENDLY_CHANNELS[0]}>.`
      });
    }

    const hasAllowedRole = ALLOWED_COMMAND_ROLES.some(roleId =>
      interaction.member.roles.cache.has(roleId)
    );
    if (!hasAllowedRole) {
      return interaction.editReply({
        content: '❌ Você não tem permissão para usar este comando.'
      });
    }

    const description = interaction.options.getString('descricao');
    const displayName = interaction.member?.displayName ||
      interaction.user.globalName ||
      interaction.user.username;
    const avatarUrl = interaction.user.displayAvatarURL({ size: 256 });

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setAuthor({ name: displayName, iconURL: avatarUrl })
      .setDescription(description);

    try {
      const channel = await interaction.guild.channels.fetch(FRIENDLY_ANNOUNCEMENT_CHANNEL);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error(`Canal de anúncios Friendly inválido: ${FRIENDLY_ANNOUNCEMENT_CHANNEL}`);
      }

      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [embed],
        allowedMentions: { parse: [], users: [interaction.user.id] }
      });

      return interaction.editReply({ content: '✅ Seu anúncio de Friendly foi publicado!' });
    } catch (error) {
      console.error('❌ Erro ao publicar anúncio Friendly:', error);
      return interaction.editReply({
        content: '❌ Não foi possível publicar seu anúncio. Verifique as permissões do bot e tente novamente.'
      });
    }
  }
};
