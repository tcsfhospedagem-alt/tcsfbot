const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ALLOWED_RELEASE_CHANNELS, ALLOWED_COMMAND_ROLES, FREE_AGENT_ROLE_ID } = require('../config/constants');
const { activeContracts, saveContracts } = require('../systems/contracts');
const { getTeamRoles } = require('../systems/teamRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('release-player')
    .setDescription('Liberar um jogador do seu time')
    .addUserOption(opt =>
      opt.setName('jogador')
        .setDescription('Jogador que será liberado')
        .setRequired(true)
    ),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const isAllowedChannel = ALLOWED_RELEASE_CHANNELS.includes(interaction.channelId) ||
      ALLOWED_RELEASE_CHANNELS.includes(interaction.channel?.parentId);
    if (!isAllowedChannel) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Canal Não Permitido').setDescription('Este comando só pode ser utilizado em canais específicos.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const hasCommandPermission = ALLOWED_COMMAND_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasCommandPermission) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Apenas membros com um cargo autorizado podem usar este comando.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const technicianTeamRoles = getTeamRoles(interaction.member);
    if (technicianTeamRoles.length !== 1) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Time do Técnico Indefinido').setDescription('Você precisa ter exatamente um cargo de time autorizado para liberar jogadores.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const targetUser = interaction.options.getUser('jogador');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.editReply({ content: '❌ Não foi possível encontrar esse jogador no servidor.' });
    }

    const technicianTeamRole = technicianTeamRoles[0];
    if (!getTeamRoles(targetMember).some(role => role.id === technicianTeamRole.id)) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Jogador de Outro Time').setDescription('Você só pode liberar jogadores que tenham o mesmo cargo de time que você.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const targetTeamRoles = getTeamRoles(targetMember);

    try {
      await targetMember.roles.remove(targetTeamRoles.map(role => role.id));

      for (const [id, contract] of activeContracts) {
        if (contract.signee.id === targetUser.id) {
          activeContracts.delete(id);
        }
      }
      saveContracts();
      await targetMember.roles.add(FREE_AGENT_ROLE_ID);

      const releaseEmbed = new EmbedBuilder()
        .setColor(0xf0c030)
        .setTitle('🔓 Você foi liberado do time!')
        .setDescription(`Você foi liberado de **${technicianTeamRole?.name || 'seu time'}** por ${interaction.user}.`)
        .addFields(
          { name: 'Time', value: technicianTeamRole?.name || 'N/A', inline: true },
          { name: 'Liberado por', value: interaction.user.username, inline: true },
          { name: 'Status', value: '🟡 Free Agent', inline: true },
        )
        .setFooter({ text: `TCSF  • ${new Date().toLocaleDateString('pt-BR')}` })
        .setTimestamp();

      // Envia DM para o jogador liberado
      try {
        await targetUser.send({ embeds: [releaseEmbed] });
        console.log(`✅ DM de release enviada para ${targetUser.username}`);
      } catch (err) {
        console.log(`⚠️ Não foi possível enviar DM para ${targetUser.username}`);
      }

      await interaction.editReply({
        content: `✅ **${targetUser.username}** foi liberado de **${technicianTeamRole?.name}** e receberá uma DM de notificação.`
      });

    } catch (err) {
      console.error('❌ Erro ao liberar jogador:', err);
      await interaction.editReply({ content: '❌ Não foi possível liberar o jogador. Verifique se o bot pode gerenciar os cargos.' });
    }
  }
};
