const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const {
  ALLOWED_CONTRACT_CHANNELS,
  ALLOWED_COMMAND_ROLES,
  ROSTER_CAP,
  EMERGENCY_CONTRACT_LIMIT,
  CONTRACT_GUILD_ID,
  CONTRACT_ANNOUNCEMENT_CHANNEL
} = require('../config/constants');
const { pendingContracts, activeContracts, generateContractId, countActiveEmergencyContracts } = require('../systems/contracts');
const { getTeamRoles } = require('../systems/teamRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emergency_sign')
    .setDescription('Propor um contrato de emergência para um jogador')
    .addUserOption(opt => opt.setName('jogador').setDescription('O jogador que vai assinar').setRequired(true))
    .addStringOption(opt => opt.setName('posicao').setDescription('Posição do jogador (ex: cb, st, gk)').setRequired(true))
    .addStringOption(opt => opt.setName('role').setDescription('Role do jogador (ex: Titular, Subs)').setRequired(true)),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const isAllowedChannel = ALLOWED_CONTRACT_CHANNELS.includes(interaction.channelId) ||
      ALLOWED_CONTRACT_CHANNELS.includes(interaction.channel?.parentId);
    if (!isAllowedChannel) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Canal Não Permitido').setDescription('Este comando só pode ser utilizado em canais específicos.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const hasCommandPermission = ALLOWED_COMMAND_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasCommandPermission) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Você não tem permissão para usar este comando. Apenas membros autorizados podem criar contratos de emergência.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const signee = interaction.options.getUser('jogador');
    const position = interaction.options.getString('posicao');
    const role = interaction.options.getString('role');
    const contractor = interaction.user;
    const teamRoles = getTeamRoles(interaction.member);

    if (teamRoles.length !== 1) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Time Indefinido')
          .setDescription('Você precisa ter exatamente um cargo de time autorizado para criar um contrato de emergência.')
          .setFooter({ text: 'TCSF ' })
          .setTimestamp()]
      });
    }

    const teamRole = teamRoles[0];
    const emergencyCount = countActiveEmergencyContracts(teamRole.id);
    if (emergencyCount >= EMERGENCY_CONTRACT_LIMIT) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🚫 Limite de Emergências Atingido')
          .setDescription(`O time **${teamRole.name}** já possui **${emergencyCount}/${EMERGENCY_CONTRACT_LIMIT}** contratos de emergência ativos.`)
          .setFooter({ text: 'TCSF • Limite de contratos de emergência' })
          .setTimestamp()]
      });
    }

    const existingContract = [...activeContracts.values()].find(contract => contract.signee.id === signee.id);
    if (existingContract) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Contrato Já Existente').setDescription(`${signee} já possui um contrato ativo com **${existingContract.teamName}**.`).setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const signeeMember = await interaction.guild.members.fetch(signee.id).catch(() => null);
    if (signeeMember) {
      const signeeTeamRole = getTeamRoles(signeeMember)[0];
      if (signeeTeamRole) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Jogador Já em um Time')
            .setDescription(`**${signee.username}** já pertence ao time **${signeeTeamRole.name}** e não pode receber um novo contrato.`)
            .setFooter({ text: 'TCSF • Use /release-player antes de contratar' })
            .setTimestamp()]
        });
      }
    }

    const rosterCount = teamRole.members.size;
    if (rosterCount >= ROSTER_CAP) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🚫 Roster Cheio')
          .setDescription(`O time **${teamRole.name}** já possui **${rosterCount}/${ROSTER_CAP}** jogadores. Este contrato não pode ser criado.`)
          .setFooter({ text: 'TCSF • Limite de roster atingido' })
          .setTimestamp()]
      });
    }

    if (
      teamRole.permissions.has(PermissionFlagsBits.Administrator) ||
      teamRole.permissions.has(PermissionFlagsBits.ManageGuild) ||
      teamRole.permissions.has(PermissionFlagsBits.ManageRoles)
    ) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Cargo Administrativo Bloqueado').setDescription('Por segurança, cargos com permissões administrativas não podem ser usados em contratos.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const contractId = generateContractId(signee.id, contractor.id);
    const contractData = {
      contractId,
      signee,
      contractor,
      teamName: teamRole.name,
      teamRoleId: teamRole.id,
      position,
      role,
      emergency: true,
      proposedAt: new Date(),
      channelId: interaction.channelId,
      guildId: interaction.guildId,
    };
    pendingContracts.set(contractId, contractData);

    const embed = new EmbedBuilder()
      .setColor(0xf0c030)
      .setTitle('🚨 Emergency Agreement Contract')
      .setDescription('Contrato de emergência. O jogador ainda precisa aceitar ou rejeitar a proposta.')
      .addFields(
        { name: 'Signee', value: `${signee}\n${signee.username}`, inline: true },
        { name: 'Contractor', value: `${contractor}\n${contractor.username}`, inline: true },
        { name: 'Team', value: teamRole.name, inline: true },
        { name: 'Position', value: position, inline: true },
        { name: 'Role', value: role, inline: true },
        { name: 'Emergências ativas', value: `${emergencyCount}/${EMERGENCY_CONTRACT_LIMIT}`, inline: true },
        { name: 'Roster', value: `${rosterCount}/${ROSTER_CAP}`, inline: true },
      )
      .setFooter({ text: `TCSF • ${new Date().toLocaleDateString('pt-BR')}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${contractId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${contractId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
    );

    try {
      const channel = await interaction.guild.channels.fetch(CONTRACT_ANNOUNCEMENT_CHANNEL);
      if (!channel) throw new Error(`Canal de contratos ${CONTRACT_ANNOUNCEMENT_CHANNEL} não encontrado.`);
      await channel.send({
        content: `🚨 ${signee}, um contrato de emergência foi proposto por ${contractor}.`,
        embeds: [embed],
        components: [row]
      });
    } catch (error) {
      console.error('❌ Erro ao enviar contrato de emergência no canal de anúncios:', error);
      pendingContracts.delete(contractId);
      return interaction.editReply({ content: '❌ Não foi possível publicar o contrato de emergência. Tente novamente mais tarde.' });
    }

    await interaction.editReply({ content: '✅ Contrato de emergência enviado! A janela de transferências não impede esta proposta.' });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xf0c030)
        .setTitle('🚨 Contrato de Emergência Recebido!')
        .setDescription('Você recebeu uma proposta de contrato de emergência. Ela ainda depende da sua aceitação.')
        .addFields(
          { name: '👕 Time', value: teamRole.name, inline: true },
          { name: '⚽ Posição', value: position, inline: true },
          { name: '👤 Enviado por', value: contractor.username, inline: false },
          { name: 'Ação Necessária', value: `Confira os detalhes e aceite ou rejeite o contrato no canal:\n\n🔗 [Ir para o Canal de Contratos](https://discord.com/channels/${CONTRACT_GUILD_ID}/${CONTRACT_ANNOUNCEMENT_CHANNEL})`, inline: false }
        )
        .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
        .setFooter({ text: 'TCSF • Responda o mais rápido possível!' })
        .setTimestamp();

      await signee.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.error(`⚠️ Não foi possível enviar DM para ${signee.username}:`, error);
    }
  }
};
