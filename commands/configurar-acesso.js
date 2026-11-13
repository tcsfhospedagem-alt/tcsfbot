const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const {
  CONTRACT_GUILD_ID,
  READ_ONLY_ACCESS_ROLE_ID,
  STAFF_CATEGORY_IDS
} = require('../config/constants');

const READ_ONLY_PERMISSIONS = {
  ViewChannel: true,
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('configurar-acesso')
    .setDescription('Configura o cargo de acesso somente para leitura nos canais.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== CONTRACT_GUILD_ID) {
      return interaction.reply({
        content: '❌ Este comando só pode ser usado no servidor configurado.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        content: '❌ Você precisa da permissão **Gerenciar canais** para usar este comando.',
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply({
        content: '❌ O bot precisa da permissão **Gerenciar canais** para configurar o acesso.'
      });
    }

    const role = await interaction.guild.roles.fetch(READ_ONLY_ACCESS_ROLE_ID);
    if (!role) {
      return interaction.editReply({
        content: `❌ Não encontrei o cargo configurado (<@&${READ_ONLY_ACCESS_ROLE_ID}>).`
      });
    }

    const channels = await interaction.guild.channels.fetch();
    const missingCategories = STAFF_CATEGORY_IDS.filter(categoryId => {
      const channel = channels.get(categoryId);
      return !channel || channel.type !== ChannelType.GuildCategory;
    });

    if (missingCategories.length > 0) {
      return interaction.editReply({
        content: `❌ Não encontrei estas categorias de staff: ${missingCategories.map(id => `\`${id}\``).join(', ')}. Nenhuma permissão foi alterada.`
      });
    }

    const staffCategoryIds = new Set(STAFF_CATEGORY_IDS);
    let configuredCount = 0;
    let staffChannelCount = 0;
    const failedChannelIds = [];

    for (const channel of channels.values()) {
      const isStaffChannel = staffCategoryIds.has(channel.id) || staffCategoryIds.has(channel.parentId);
      const permissions = isStaffChannel
        ? { ...READ_ONLY_PERMISSIONS, ViewChannel: false }
        : READ_ONLY_PERMISSIONS;

      try {
        await channel.permissionOverwrites.edit(role, permissions, {
          reason: `Configuração de acesso somente para leitura por ${interaction.user.tag}`
        });
        configuredCount += 1;
        if (isStaffChannel) staffChannelCount += 1;
      } catch (error) {
        console.error(`Erro ao configurar permissões no canal ${channel.id}:`, error);
        failedChannelIds.push(channel.id);
      }
    }

    const result = [
      `${failedChannelIds.length === 0 ? '✅' : '⚠️'} Cargo <@&${role.id}> configurado em **${configuredCount}** canais.`,
      `Canais de staff sem acesso: **${staffChannelCount}**.`
    ];

    if (failedChannelIds.length > 0) {
      result.push(`⚠️ Falha ao configurar ${failedChannelIds.length} canal(is): ${failedChannelIds.slice(0, 10).map(id => `\`${id}\``).join(', ')}${failedChannelIds.length > 10 ? ', ...' : ''}.`);
    }

    result.push('O cargo não poderá enviar mensagens, conversar em tópicos, criar tópicos públicos/privados ou reagir. Membros com **Administrador** ignoram essas restrições do Discord.');
    return interaction.editReply({ content: result.join('\n') });
  }
};
