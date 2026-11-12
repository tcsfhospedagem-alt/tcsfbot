const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');

const blockedPermissions = {
  AddReactions: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  SendMessagesInThreads: false
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bloquear-interacoes')
    .setDescription('Bloqueia reações e criação/envio em tópicos para @everyone em todos os canais.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply({ content: '❌ Este comando só pode ser usado em um servidor.' });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: '❌ Apenas administradores podem usar este comando.' });
    }

    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply({
        content: '❌ Preciso da permissão **Gerenciar cargos** para alterar as permissões dos canais.'
      });
    }

    const channels = await interaction.guild.channels.fetch();
    const editableChannels = [...channels.values()].filter(channel =>
      channel?.permissionOverwrites && !channel.isThread?.()
    );
    const failures = [];
    let updated = 0;

    for (const channel of editableChannels) {
      try {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          blockedPermissions,
          { reason: `Bloqueio temporário de interações aplicado por ${interaction.user.tag}` }
        );
        updated++;
      } catch (error) {
        console.error(`Erro ao atualizar permissões do canal ${channel.id} (${channel.name}):`, error);
        failures.push(channel);
      }
    }

    const failureList = failures.length
      ? `\nFalhas: ${failures.slice(0, 10).map(channel => `#${channel.name}`).join(', ')}${failures.length > 10 ? ', ...' : ''}.`
      : '';

    return interaction.editReply({
      content: `✅ Permissões atualizadas em ${updated}/${editableChannels.length} canais.${failureList}\nAs threads existentes herdam as permissões do canal pai.`
    });
  }
};
