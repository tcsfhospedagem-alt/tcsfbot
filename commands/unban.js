const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { ALLOWED_SANCTION_ROLES, SANCTION_CHANNEL_ID, STJD_LINK } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Registra o desbanimento de um usuário.')
    .addUserOption(option =>
      option.setName('jogador')
        .setDescription('Usuário a ser desbanido')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('motivo')
        .setDescription('Motivo do desbanimento')
        .setMaxLength(500)
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply({ content: '❌ Este comando só pode ser usado em um servidor.' });
    }

    const memberRoles = interaction.member?.roles?.cache;
    const hasCommandPermission = memberRoles
      ? ALLOWED_SANCTION_ROLES.some(roleId => memberRoles.has(roleId))
      : false;
    const isAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

    if (!hasCommandPermission && !isAdministrator) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Sem Permissão')
            .setDescription('Você não tem permissão para usar este comando.')
            .setFooter({ text: 'TCSF (The Classic Soccer Federation)' })
        ]
      });
    }

    const jogador = interaction.options.getUser('jogador');
    const motivo = interaction.options.getString('motivo');

    let channel;
    try {
      channel = await interaction.guild.channels.fetch(SANCTION_CHANNEL_ID);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error(`Canal de sanctions inválido: ${SANCTION_CHANNEL_ID}`);
      }
    } catch (error) {
      console.error('Erro ao localizar o canal de unban:', error);
      return interaction.editReply({
        content: '❌ Não foi possível acessar o canal de Sanctions. Verifique as permissões e o ID do canal.'
      });
    }

    try {
      await interaction.guild.members.unban(jogador.id, `TCSF UNBAN: ${motivo}`);
    } catch (error) {
      console.error(`Erro ao desbanir ${jogador.tag}:`, error);
      return interaction.editReply({
        content: `❌ Não foi possível desbanir ${jogador}. Verifique se ele está banido e se o bot tem permissão para desbanir membros.`
      });
    }

    const unbanEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('TCSF UNBAN')
      .setDescription(
        `⬜ **Nome do usuário desbanido:** ${jogador.username}\n` +
        `⬜ **Motivo do desbanimento:** ${motivo}\n` +
        `⬜ **Discord ID:** ${jogador.id}\n\n` +
        'O usuário teve seu banimento revogado e está liberado para retornar à liga.\n\n' +
        `**TCSF STJD**\n${STJD_LINK}`
      );

    const guildIcon = interaction.guild.iconURL({ dynamic: true });
    if (guildIcon) {
      unbanEmbed.setThumbnail(guildIcon);
    }

    try {
      await channel.send({
        content: `Desbanimento registrado por: ${interaction.user}`,
        embeds: [unbanEmbed],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      console.error('Erro ao enviar log de unban:', error);
      return interaction.editReply({
        content: `⚠️ ${jogador} foi desbanido, mas não foi possível registrar o log no canal de Sanctions.`
      });
    }

    return interaction.editReply({
      content: `✅ Unban aplicado ao jogador ${jogador}. Ele foi desbanido do servidor.`
    });
  }
};
