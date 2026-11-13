const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const {
  CONTRACT_GUILD_ID,
  LIMITED_ACCESS_CHANNEL_IDS,
  LIMITED_ACCESS_ROLE_ID,
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.inGuild() || interaction.guildId !== CONTRACT_GUILD_ID) {
      return interaction.editReply('❌ Este comando só pode ser usado no servidor configurado.');
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.editReply('❌ Você precisa da permissão **Gerenciar canais** para usar este comando.');
    }

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

    const limitedRole = await interaction.guild.roles.fetch(LIMITED_ACCESS_ROLE_ID);
    if (!limitedRole) {
      return interaction.editReply({
        content: `❌ Não encontrei o cargo de acesso limitado (<@&${LIMITED_ACCESS_ROLE_ID}>). Nenhuma permissão foi alterada.`
      });
    }

    const channels = await interaction.guild.channels.fetch();
    const missingCategories = STAFF_CATEGORY_IDS.filter(categoryId => {
      const channel = channels.get(categoryId);
      return !channel || channel.type !== ChannelType.GuildCategory;
    });

    const missingAllowedChannels = LIMITED_ACCESS_CHANNEL_IDS.filter(channelId => !channels.has(channelId));

    if (missingCategories.length > 0 || missingAllowedChannels.length > 0) {
      const missingItems = [
        ...missingCategories.map(id => `categoria de staff \`${id}\``),
        ...missingAllowedChannels.map(id => `canal permitido \`${id}\``)
      ];
      return interaction.editReply({
        content: `❌ Não encontrei ${missingItems.join(', ')}. Nenhuma permissão foi alterada.`
      });
    }

    const staffCategoryIds = new Set(STAFF_CATEGORY_IDS);
    const limitedAccessChannelIds = new Set(LIMITED_ACCESS_CHANNEL_IDS);
    let configuredCount = 0;
    let staffChannelCount = 0;
    let limitedRoleCount = 0;
    let everyoneCount = 0;
    const failedOverwrites = [];

    for (const channel of channels.values()) {
      const isStaffChannel = staffCategoryIds.has(channel.id) || staffCategoryIds.has(channel.parentId);
      const isLimitedAccessChannel = limitedAccessChannelIds.has(channel.id);
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
        console.error(`Erro ao configurar o cargo de leitura no canal ${channel.id}:`, error);
        failedOverwrites.push(`${channel.id} (cargo de leitura)`);
      }

      try {
        await channel.permissionOverwrites.edit(limitedRole, {
          ViewChannel: isLimitedAccessChannel
        }, {
          reason: `Restrição de visibilidade do cargo por ${interaction.user.tag}`
        });
        limitedRoleCount += 1;
      } catch (error) {
        console.error(`Erro ao configurar o cargo de acesso limitado no canal ${channel.id}:`, error);
        failedOverwrites.push(`${channel.id} (cargo limitado)`);
      }

      try {
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
          ViewChannel: isLimitedAccessChannel
        }, {
          reason: `Restrição de visibilidade de @everyone por ${interaction.user.tag}`
        });
        everyoneCount += 1;
      } catch (error) {
        console.error(`Erro ao configurar @everyone no canal ${channel.id}:`, error);
        failedOverwrites.push(`${channel.id} (@everyone)`);
      }
    }

    const result = [
      `${failedOverwrites.length === 0 ? '✅' : '⚠️'} Cargo <@&${role.id}> configurado em **${configuredCount}** canais; staff sem acesso: **${staffChannelCount}**.`,
      `Cargo <@&${limitedRole.id}> e @everyone: visíveis somente em <#${LIMITED_ACCESS_CHANNEL_IDS.join('> e <#')}> (**${limitedRoleCount}** e **${everyoneCount}** permissões aplicadas).`
    ];

    if (failedOverwrites.length > 0) {
      result.push(`⚠️ Falha em ${failedOverwrites.length} configuração(ões): ${failedOverwrites.slice(0, 10).map(item => `\`${item}\``).join(', ')}${failedOverwrites.length > 10 ? ', ...' : ''}.`);
    }

    result.push('O cargo de leitura não poderá enviar mensagens, conversar em tópicos, criar tópicos públicos/privados ou reagir. No Discord, permissões de visualização concedidas por outros cargos podem prevalecer sobre a restrição de @everyone; cargos com **Administrador** sempre ignoram restrições.');
    return interaction.editReply({ content: result.join('\n') });
  }
};
