const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { ALLOWED_CONTRACT_CHANNELS, ALLOWED_COMMAND_ROLES, ROSTER_CAP, CONTRACT_GUILD_ID, CONTRACT_ANNOUNCEMENT_CHANNEL } = require('../config/constants');
const { getTransferWindow } = require('../systems/transferWindow');
const { pendingContracts, activeContracts, generateContractId } = require('../systems/contracts');
const { getTeamRoles } = require('../systems/teamRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contract')
    .setDescription('Propor um contrato para um jogador')
    .addUserOption(opt => opt.setName('jogador').setDescription('O jogador que vai assinar').setRequired(true))
    .addStringOption(opt => opt.setName('posicao').setDescription('Posição do jogador (ex: cb, st, gk)').setRequired(true))
    .addStringOption(opt => opt.setName('role').setDescription('Role do jogador (ex: Titular, Subs)').setRequired(true)),
  async execute(interaction, client) {
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
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Sem Permissão').setDescription('Você não tem permissão para usar este comando.\n\nApenas membros autorizados podem criar contratos.').setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    const signee = interaction.options.getUser('jogador');
    const position = interaction.options.getString('posicao');
    const role = interaction.options.getString('role');
    const contractor = interaction.user;

    const teamRoles = getTeamRoles(interaction.member);

    if (teamRoles.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Time Não Identificado')
          .setDescription('Você precisa ter um cargo de time autorizado para criar um contrato.')
          .setFooter({ text: 'TCSF ' })
          .setTimestamp()]
      });
    }

    if (teamRoles.length > 1) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Mais de um Time Identificado')
          .setDescription('Você possui mais de um cargo de time autorizado. Remova os cargos extras antes de criar o contrato.')
          .setFooter({ text: 'TCSF ' })
          .setTimestamp()]
      });
    }

    const teamRole = teamRoles[0];

    const existingContract = [...activeContracts.values()].find(c => c.signee.id === signee.id);
    if (existingContract) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('❌ Contrato Já Existente').setDescription(`${signee} já possui um contrato ativo com **${existingContract.teamName}**.`).setFooter({ text: 'TCSF ' }).setTimestamp()]
      });
    }

    // Verificar se o jogador já tem cargo de time no servidor
    const signeeMember = await interaction.guild.members.fetch(signee.id).catch(() => null);
    if (signeeMember) {
      const signeeTeamRole = getTeamRoles(signeeMember)[0];
      if (signeeTeamRole) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('❌ Jogador Já em um Time')
            .setDescription(`**${signee.username}** já pertence ao time **${signeeTeamRole.name}** e não pode receber um novo contrato.`)
            .setFooter({ text: 'TCSF  • Use /release-player antes de contratar' })
            .setTimestamp()]
        });
      }
    }

    const transferWindow = getTransferWindow();
    if (!transferWindow.clubs) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🚫 Janela de Clubs Fechada').setDescription('A janela de transferências para **clubes** está fechada no momento.').setFooter({ text: 'TCSF  • Janela de transferências fechada para clubes' }).setTimestamp()]
      });
    }

    const rosterCount = teamRole.members.size;
    if (rosterCount >= ROSTER_CAP) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🚫 Roster Cheio')
          .setDescription(`O time **${teamRole.name}** já possui **${rosterCount}/${ROSTER_CAP}** jogadores. Este contrato não pode ser criado.`)
          .setFooter({ text: 'TCSF  • Limite de roster atingido' })
          .setTimestamp()]
      });
    }

    if (
      teamRole.permissions.has(PermissionFlagsBits.Administrator) ||
      teamRole.permissions.has(PermissionFlagsBits.ManageGuild) ||
      teamRole.permissions.has(PermissionFlagsBits.ManageRoles)
    ) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🔒 Cargo Administrativo Bloqueado').setDescription(`Por segurança, cargos com permissões administrativas não podem ser usados em contratos.`).setFooter({ text: 'TCSF ' }).setTimestamp()]
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
      proposedAt: new Date(),
      channelId: interaction.channelId,
      guildId: interaction.guildId,
    };

    pendingContracts.set(contractId, contractData);

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle('📋 Agreement Contract')
      .setDescription(`By signing this contract, you commit to representing the Contractor and their team with dedication throughout the tournament, competing to the best of your abilities and upholding team loyalty.`)
      .addFields(
        { name: 'Signee', value: `${signee}\n${signee.username}`, inline: true },
        { name: 'Contractor', value: `${contractor}\n${contractor.username}`, inline: true },
        { name: 'Team', value: teamRole.name, inline: true },
        { name: 'Position', value: position, inline: true },
        { name: 'Role', value: role, inline: true },
        { name: 'Roster', value: `${rosterCount}/${ROSTER_CAP}`, inline: true },
      )
      .setFooter({ text: `TCSF  • ${new Date().toLocaleDateString('pt-BR')}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${contractId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${contractId}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
    );

    try {
      const channel = await interaction.guild.channels.fetch(CONTRACT_ANNOUNCEMENT_CHANNEL);
      if (channel) {
        await channel.send({
          content: `🔔 ${signee}, um contrato foi proposto por ${contractor}.`,
          embeds: [embed],
          components: [row]
        });
      }
    } catch (err) {
      console.error('❌ Erro ao enviar contract no canal de anúncios:', err);
    }

    await interaction.editReply({ content: '✅ Contrato enviado para o canal de contratos!' });

    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📋 Contract Recebido!')
        .setDescription(`Você recebeu um **offer de contract** na liga **TCSF **!`)
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
      console.log(`✅ DM de contrato enviada para ${signee.username}`);
    } catch (err) {
      console.log(`⚠️ Não foi possível enviar DM para ${signee.username}: ${err.message}`);
    }
  }
};
