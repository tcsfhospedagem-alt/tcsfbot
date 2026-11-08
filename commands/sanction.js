const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { ALLOWED_SANCTION_ROLES, SANCTION_CHANNEL_ID, STJD_LINK } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sanction')
    .setDescription('Registra o banimento de um usuário e envia o aviso na DM.')
    .addUserOption(option =>
      option.setName('jogador')
        .setDescription('Usuário banido')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('motivo')
        .setDescription('Motivo do banimento')
        .setMaxLength(498)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('robux')
        .setDescription('Valor da Bail em Robux (ex: 2300)')
        .setMaxLength(100)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('volta')
        .setDescription('Condição de volta (ex: N/A)')
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
            .setFooter({ text: 'TCSF (The Classic Soccer Federation' })
        ]
      });
    }

    const jogador = interaction.options.getUser('jogador');
    const motivo = interaction.options.getString('motivo');
    const robux = interaction.options.getString('robux');
    const volta = interaction.options.getString('volta');

    let channel;
    try {
      channel = await interaction.guild.channels.fetch(SANCTION_CHANNEL_ID);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error(`Canal de sanctions inválido: ${SANCTION_CHANNEL_ID}`);
      }
    } catch (error) {
      console.error('Erro ao localizar o canal de sanction:', error);
      return interaction.editReply({
        content: '❌ Não foi possível acessar o canal de Sanctions. Verifique as permissões e o ID do canal.'
      });
    }

    try {
      await interaction.guild.members.ban(jogador.id, {
        reason: `TCSF SANCTION: ${motivo}`
      });
    } catch (error) {
      console.error(`Erro ao banir ${jogador.tag}:`, error);
      return interaction.editReply({
        content: `❌ Não foi possível banir ${jogador}. Verifique as permissões do bot e a hierarquia de cargos.`
      });
    }

    const sanctionEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('TCSF SANCTION')
      .setDescription(
        `**Nome do usuário banido:** ${jogador.username} (${jogador.id})\n` +
        `**Motivo do banimento:** ${motivo}\n` +
        `**Bail em Robux:** ${robux} <:robux:1558274554206359592>\n` +
        `**Volta:** ${volta}\n\n` +
        'Todo jogador punido por banimento poderá recorrer ao nosso STJD.\n' +
        'Caso apresente provas de que não infringiu nenhuma regra da liga, sua situação poderá ser reavaliada e a penalidade, consequentemente, revisada.\n\n' +
        `**TCSF STJD**\n${STJD_LINK}`
      );

    const guildIcon = interaction.guild.iconURL({ dynamic: true });
    if (guildIcon) {
      sanctionEmbed.setThumbnail(guildIcon);
    }

    const dmEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('TCSF SANCTION')
      .setDescription(
        'Você foi banido da TCSF / You were banned from TCSF\n\n' +
        `**Motivo/Reason:** ${motivo}\n` +
        `**Bail/Blacklist:** ${robux} Robux\n` +
        `**Volta/Return:** ${volta}\n\n` +
        `**TCSF STJD:**\n${STJD_LINK}`
      );

    let dmEnviada = true;
    try {
      await jogador.send({ embeds: [dmEmbed], allowedMentions: { parse: [] } });
    } catch (error) {
      dmEnviada = false;
      console.error(`Não foi possível enviar DM para ${jogador.tag}:`, error);
    }

    try {
      await channel.send({
        content: `Banimento registrado por: ${interaction.user}`,
        embeds: [sanctionEmbed],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      console.error('Erro ao enviar log de sanction:', error);
      return interaction.editReply({
        content: `⚠️ ${jogador} foi banido, mas não foi possível registrar o log no canal de Sanctions. DM enviada: ${dmEnviada ? 'Sim' : 'Não'}.`
      });
    }

    return interaction.editReply({
      content: `✅ Sanction aplicada ao jogador ${jogador}. DM enviada: ${dmEnviada ? 'Sim' : 'Não'}.`
    });
  }
};
