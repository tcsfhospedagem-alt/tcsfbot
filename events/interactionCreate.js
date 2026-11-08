const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { ROSTER_CAP, EMERGENCY_CONTRACT_LIMIT, FREE_AGENT_ROLE_ID, RELEASE_ANNOUNCEMENT_CHANNEL } = require('../config/constants');
const { pendingContracts, activeContracts, saveContracts, countActiveEmergencyContracts } = require('../systems/contracts');
const { getTransferWindow, setTransferWindow } = require('../systems/transferWindow');
const { buildTransferWindowEmbed, buildTransferWindowSelectMenu } = require('../commands/janela');
const { handleTicketInteraction } = require('../systems/tickets');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (await handleTicketInteraction(interaction)) return;

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', flags: MessageFlags.Ephemeral });
        }
      }
    } else if (interaction.isButton()) {
      const parts = interaction.customId.split('_');
      const action = parts[0];
      const contractId = parts.slice(1).join('_');

      const contractData = pendingContracts.get(contractId);
      if (!contractData) {
        if (action === 'disabled') return;
        return interaction.reply({ content: '❌ Contrato não encontrado ou já processado.', flags: MessageFlags.Ephemeral });
      }

      if (interaction.user.id !== contractData.signee.id) {
        return interaction.reply({ content: '❌ Apenas o jogador indicado pode aceitar ou rejeitar este contrato.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferUpdate();

      if (action === 'accept') {
        const teamRole = interaction.guild.roles.cache.get(contractData.teamRoleId);
        const rosterCount = teamRole ? teamRole.members.size : 0;

        if (contractData.emergency === true && countActiveEmergencyContracts(contractData.teamRoleId) >= EMERGENCY_CONTRACT_LIMIT) {
          pendingContracts.delete(contractId);
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
          );

          return interaction.editReply({
            content: `❌ O time **${contractData.teamName}** já atingiu o limite de **${EMERGENCY_CONTRACT_LIMIT} contratos de emergência ativos**. Este contrato não pode ser aceito.`,
            components: [disabledRow]
          });
        }

        if (rosterCount >= ROSTER_CAP) {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
          );

          return interaction.editReply({
            content: `❌ O time **${contractData.teamName}** já atingiu o limite de **${ROSTER_CAP} jogadores**. Este contrato não pode ser aceito.`,
            embeds: [
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle('🚫 Limite de Roster Atingido')
                .setDescription(`O contrato com **${contractData.teamName}** foi bloqueado porque o time já está com **${rosterCount}/${ROSTER_CAP}** jogadores.`)
                .setFooter({ text: 'TCSF - Season 1 • Limite de roster atingido' })
                .setTimestamp()
            ],
            components: [disabledRow]
          });
        }

        const now = new Date();

        const signedContract = { ...contractData, signedAt: now };

        activeContracts.set(contractId, signedContract);
        pendingContracts.delete(contractId);
        saveContracts();

        const guild = interaction.guild;
        const member = await guild.members.fetch(contractData.signee.id);

        try {
          await member.roles.remove(FREE_AGENT_ROLE_ID);
        } catch (err) {
          console.error('❌ Erro ao remover cargo Free Agent:', err);
        }

        try {
          if (contractData.teamRoleId) {
            await member.roles.add(contractData.teamRoleId);
          }
        } catch (err) {
          console.error('❌ Erro ao adicionar cargo do time:', err);
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('✅ Contract Accepted')
          .setDescription(`${contractData.signee} has successfully signed with **${contractData.teamName}**`)
          .addFields(
            { name: 'Signee', value: `${contractData.signee}\n${contractData.signee.username}`, inline: true },
            { name: 'Contractor', value: `${contractData.contractor}\n${contractData.contractor.username}`, inline: true },
            { name: 'Team', value: contractData.teamName, inline: true },
            { name: 'Position', value: contractData.position, inline: true },
            { name: 'Role', value: contractData.role, inline: true },
            {
              name: `Roster (${teamRole?.members.size ?? 0}/${ROSTER_CAP})`,
              value: teamRole?.members.map(rosterMember => `${rosterMember}`).join('\n') || 'Nenhum jogador no roster.',
              inline: false
            },
            { name: 'Signed on', value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: false },
          )
          .setFooter({ text: `TCSF - Season 1 • ${new Date().toLocaleDateString('pt-BR')}` })
          .setTimestamp();

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
        );

        await interaction.editReply({ content: `✅ ${contractData.signee} accepted the contract!`, embeds: [successEmbed], components: [disabledRow] });

      } else if (action === 'reject') {
        pendingContracts.delete(contractId);

        const rejectEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('❌ Contract Rejected')
          .setDescription(`${contractData.signee} rejected the contract proposed by ${contractData.contractor} for team **${contractData.teamName}**.`)
          .setFooter({ text: 'TCSF - Season 1' })
          .setTimestamp();

        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('disabled_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('disabled_reject').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
        );

        await interaction.editReply({ content: `❌ ${contractData.signee} rejected the contract.`, embeds: [rejectEmbed], components: [disabledRow] });
      }
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'transfer_window_select') {
        const selected = interaction.values[0];
        const transferWindow = getTransferWindow();
        
        setTransferWindow(selected, !transferWindow[selected]);

        const updatedWindow = getTransferWindow();
        const nomeLegivel = selected === 'clubs' ? '🏟️ Clubs' : '🟡 Free Agent';
        const novoEstado = updatedWindow[selected] ? '🟢 **Aberta**' : '🔴 **Fechada**';

        await interaction.update({
          embeds: [buildTransferWindowEmbed(updatedWindow)],
          components: [buildTransferWindowSelectMenu(updatedWindow)]
        });

        await interaction.followUp({
          embeds: [
            new EmbedBuilder()
              .setColor(updatedWindow[selected] ? 0x57f287 : 0xed4245)
              .setTitle('🪟 Janela Atualizada')
              .setDescription(`A janela **${nomeLegivel}** foi alterada para ${novoEstado}.`)
              .setFooter({ text: `TCSF - Season 1 • Alterado por ${interaction.user.username}` })
              .setTimestamp()
          ],
          flags: MessageFlags.Ephemeral
        });

        if (selected === 'clubs') {
          try {
            const channel = await interaction.guild.channels.fetch(require('../config/constants').CONTRACT_ANNOUNCEMENT_CHANNEL);
            if (channel) {
              await channel.send({ content: updatedWindow.clubs ? '🔓 Janela de contratos aberta.' : '🔒 Janela de contratos fechada.' });
            }
          } catch (err) {
            console.error('❌ Erro ao anunciar alteração da janela de contratos:', err);
          }
        }
      }
    }
  },
};
