const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { ALLOWED_MS_EMBED_ROLES } = require('../config/constants');
const { getTransferWindow } = require('../systems/transferWindow');

function buildTransferWindowEmbed(transferWindow) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🪟 Janela de Transferências')
    .setDescription('Selecione qual janela deseja **abrir** ou **fechar**:')
    .addFields(
      {
        name: '🏟️ Clubs',
        value: transferWindow.clubs ? '🟢 **Aberta** — Clubes podem contratar jogadores' : '🔴 **Fechada** — Clubes não podem contratar jogadores',
        inline: false
      },
      {
        name: '🟡 Free Agent',
        value: transferWindow.freeAgent ? '🟢 **Aberta** — Jogadores podem se anunciar como FA' : '🔴 **Fechada** — Jogadores não podem se anunciar como FA',
        inline: false
      }
    )
    .setFooter({ text: 'TCSF  • Apenas Administradores' })
    .setTimestamp();
}

function buildTransferWindowSelectMenu(transferWindow) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('transfer_window_select')
      .setPlaceholder('Escolha qual janela deseja alternar...')
      .addOptions([
        {
          label: `Clubs — ${transferWindow.clubs ? 'Fechar' : 'Abrir'}`,
          value: 'clubs',
          description: transferWindow.clubs ? 'Fechar janela de clubes' : 'Abrir janela de clubes',
          emoji: '🏟️'
        },
        {
          label: `Free Agent — ${transferWindow.freeAgent ? 'Fechar' : 'Abrir'}`,
          value: 'freeAgent',
          description: transferWindow.freeAgent ? 'Fechar anúncios de Free Agent' : 'Abrir anúncios de Free Agent',
          emoji: '🟡'
        }
      ])
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('janela')
    .setDescription('Abre ou fecha a janela de transferências'),
  async execute(interaction, client) {
    const hasPermission = ALLOWED_MS_EMBED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasPermission) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('🔒 Acesso Negado')
            .setDescription('Apenas membros com um dos cargos autorizados podem usar este comando.')
            .setFooter({ text: 'TCSF ' })
            .setTimestamp()
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    const transferWindow = getTransferWindow();
    return interaction.reply({
      embeds: [buildTransferWindowEmbed(transferWindow)],
      components: [buildTransferWindowSelectMenu(transferWindow)],
      flags: MessageFlags.Ephemeral
    });
  },
  buildTransferWindowEmbed,
  buildTransferWindowSelectMenu
};
