const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ALLOWED_RELEASE_CHANNELS } = require('../config/constants');
const { activeContracts, saveContracts } = require('../systems/contracts');
const { getTeamRoles } = require('../systems/teamRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('force-release')
    .setDescription('Forçar sua saída do time atual')
    .addStringOption(option =>
      option.setName('motivo')
        .setDescription('Explique o motivo da sua saída do time')
        .setRequired(true)
        .setMaxLength(1000)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const reason = interaction.options.getString('motivo', true).trim();

    if (!reason) {
      return interaction.editReply({ content: '❌ Você precisa informar o motivo da saída.' });
    }

    const isAllowedChannel = ALLOWED_RELEASE_CHANNELS.includes(interaction.channelId) ||
      ALLOWED_RELEASE_CHANNELS.includes(interaction.channel?.parentId);
    if (!isAllowedChannel) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Canal Não Permitido')
          .setDescription('Este comando só pode ser utilizado em canais específicos.')
          .setFooter({ text: 'TCSF' })
          .setTimestamp()]
      });
    }

    const teamRoles = getTeamRoles(interaction.member);
    if (teamRoles.length !== 1) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Time Indefinido')
          .setDescription('Você precisa ter exatamente um cargo de time para usar este comando.')
          .setFooter({ text: 'TCSF' })
          .setTimestamp()]
      });
    }

    const teamRole = teamRoles[0];
    const managerRole = interaction.guild.roles.cache.find(role =>
      role.name.toLowerCase() === 'manager'
    );
    if (!managerRole) {
      return interaction.editReply({
        content: '❌ Não encontrei o cargo **Manager**. Avise a administração para configurar o cargo do manager.'
      });
    }

    let managers;
    try {
      await interaction.guild.members.fetch();
      managers = [...managerRole.members.values()].filter(manager =>
        manager.roles.cache.has(teamRole.id)
      );
    } catch (error) {
      console.error(`❌ Erro ao buscar os managers de ${teamRole.name}:`, error);
      return interaction.editReply({
        content: '❌ Não foi possível localizar os managers do seu time. Tente novamente mais tarde.'
      });
    }

    if (managers.length === 0) {
      return interaction.editReply({
        content: `❌ Não encontrei nenhum membro com os cargos **Manager** e **${teamRole.name}**. Avise a administração do servidor.`
      });
    }

    try {
      await interaction.member.roles.remove(teamRole);

      for (const [id, contract] of activeContracts) {
        if (contract.signee.id === interaction.user.id) {
          activeContracts.delete(id);
        }
      }
      saveContracts();
    } catch (error) {
      console.error('❌ Erro ao processar force release:', error);
      return interaction.editReply({
        content: '❌ Não foi possível concluir sua saída. Verifique as permissões e a configuração dos cargos.'
      });
    }

    const managerNotification = new EmbedBuilder()
      .setColor(0xf0c030)
      .setTitle('⚠️ Jogador forçou a saída do time')
      .setDescription(`${interaction.user} (**${interaction.user.username}**) forçou sua saída de **${teamRole.name}**.`)
      .addFields(
        { name: 'Jogador', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
        { name: 'Time', value: teamRole.name, inline: true },
        { name: 'Motivo informado', value: reason, inline: false }
      )
      .setFooter({ text: 'TCSF • Force Release' })
      .setTimestamp();

    const failedNotifications = [];
    for (const manager of managers) {
      try {
        await manager.send({ embeds: [managerNotification] });
      } catch (error) {
        console.error(`❌ Não foi possível enviar DM ao manager ${manager.user.tag}:`, error);
        failedNotifications.push(manager.user.username);
      }
    }

    const notificationStatus = failedNotifications.length === 0
      ? 'Os managers do time foram avisados por DM.'
      : `Não foi possível enviar DM para: ${failedNotifications.join(', ')}.`;

    return interaction.editReply({
      content: `✅ Você saiu de **${teamRole.name}** e seu contrato ativo foi removido. ${notificationStatus}`
    });
  }
};
