const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const {
  ALLOWED_SANCTION_ROLES,
  CONTRACT_GUILD_ID,
  TICKET_CATEGORY_ID,
  TICKET_CLOSE_OVERRIDE_ROLE_IDS,
  TICKET_PANEL_CHANNEL_ID,
  TICKET_TRANSCRIPT_CHANNEL_ID,
  TICKET_VIEW_ROLE_IDS
} = require('../config/constants');

const TICKET_STAFF_ROLE_IDS = [...new Set([
  ...ALLOWED_SANCTION_ROLES,
  ...TICKET_CLOSE_OVERRIDE_ROLE_IDS,
  ...TICKET_VIEW_ROLE_IDS
])];

const OPEN_TICKET_MENU_ID = 'ticket_open';
const CLAIM_TICKET_BUTTON_ID = 'ticket_claim';
const CLOSE_TICKET_BUTTON_ID = 'ticket_close';
const TICKET_TYPES = [
  { label: 'Suporte Geral', value: 'suporte-geral', description: 'Tire dúvidas e peça ajuda.', emoji: '❓' },
  { label: 'Compras', value: 'compras', description: 'Ajuda com compras e pagamentos.', emoji: '🛒' },
  { label: 'Reports', value: 'reports', description: 'Envie uma denúncia ou report.', emoji: '🚨' },
  { label: 'Outros', value: 'outros', description: 'Outro assunto.', emoji: '📌' },
  { label: 'Ownar', value: 'ownar', description: 'Solicitações relacionadas a ownar.', emoji: '👑' }
];

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('TCSF Support')
    .setDescription([
      '**Precisa de ajuda?**',
      'Abra um ticket e nossa equipe irá atendê-lo assim que possível.',
      '',
      'Para appeals e denúncias, utilize o servidor do STJD.'
    ].join('\n'));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(OPEN_TICKET_MENU_ID)
    .setPlaceholder('Escolha uma opção...')
    .addOptions(TICKET_TYPES.map(type => ({
      label: type.label,
      value: type.value,
      description: type.description,
      emoji: type.emoji
    })));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

function buildTicketButtons(claimed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLAIM_TICKET_BUTTON_ID)
      .setLabel(claimed ? 'Ticket assumido' : 'Assumir ticket')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId(CLOSE_TICKET_BUTTON_ID)
      .setLabel('Fechar ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

async function loadTicketSystem(client) {
  const panelChannel = await client.channels.fetch(TICKET_PANEL_CHANNEL_ID);
  if (!panelChannel || panelChannel.guildId !== CONTRACT_GUILD_ID || !panelChannel.isTextBased()) {
    throw new Error(`Canal do painel inválido: ${TICKET_PANEL_CHANNEL_ID}`);
  }

  let before;
  let existingPanel;
  while (!existingPanel) {
    const messages = await panelChannel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    existingPanel = messages.find(message =>
      message.author.id === client.user.id &&
      message.components.some(row => row.components.some(component => component.customId === OPEN_TICKET_MENU_ID))
    );
    if (existingPanel || messages.size < 100) break;
    before = messages.last().id;
  }
  const payload = buildPanelPayload();

  if (existingPanel) {
    await existingPanel.edit(payload);
  } else {
    await panelChannel.send(payload);
  }
}

function getTicketMetadata(channel) {
  const match = channel.topic?.match(/^ticket-owner:(\d+);ticket-type:([^;]+);ticket-claimed:([^;]+)$/);
  if (!match) return null;
  return { ownerId: match[1], type: match[2], claimedBy: match[3] === 'none' ? null : match[3] };
}

function isTicketChannel(channel) {
  const metadata = channel ? getTicketMetadata(channel) : null;
  return Boolean(
    channel?.type === ChannelType.GuildText &&
    channel.guildId === CONTRACT_GUILD_ID &&
    channel.parentId === TICKET_CATEGORY_ID &&
    metadata &&
    TICKET_TYPES.some(type => type.value === metadata.type)
  );
}

async function addMemberToTicket(channel, member) {
  if (!isTicketChannel(channel)) {
    throw new Error('O canal informado não é um ticket válido.');
  }

  await channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true
  }, { reason: `Adicionado ao ticket por ${member.user.tag}` });
}

function hasTicketStaffRole(member) {
  return TICKET_STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function openTicket(interaction) {
  if (!interaction.guild || interaction.guild.id !== CONTRACT_GUILD_ID) {
    return interaction.reply({ content: 'Este painel não está disponível neste servidor.', flags: MessageFlags.Ephemeral });
  }

  const type = TICKET_TYPES.find(option => option.value === interaction.values[0]);
  if (!type) {
    return interaction.reply({ content: 'Essa opção de ticket não é válida.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let ticketChannel;

  try {
    const guild = interaction.guild;
    const category = await guild.channels.fetch(TICKET_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error(`Categoria de tickets inválida: ${TICKET_CATEGORY_ID}`);
    }

    await guild.roles.fetch();
    const requestedRoleIds = TICKET_STAFF_ROLE_IDS;
    const viewerRoleIds = requestedRoleIds.filter(roleId => guild.roles.cache.has(roleId));
    const missingRoles = requestedRoleIds.filter(roleId => !guild.roles.cache.has(roleId));
    if (missingRoles.length > 0) {
      console.warn(`Cargos de ticket ausentes; serão ignorados na criação: ${missingRoles.join(', ')}`);
    }

    const botMember = guild.members.me ?? await guild.members.fetchMe();
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels
        ]
      },
      ...viewerRoleIds.map(roleId => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      }))
    ];
    const username = interaction.user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || interaction.user.id;

    ticketChannel = await guild.channels.create({
      name: `ticket-${type.value}-${username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `ticket-owner:${interaction.user.id};ticket-type:${type.value};ticket-claimed:none`,
      permissionOverwrites: overwrites
    });

    const pingRoleIds = viewerRoleIds.filter(roleId => !TICKET_CLOSE_OVERRIDE_ROLE_IDS.includes(roleId));
    const roleMentions = pingRoleIds.map(roleId => `<@&${roleId}>`).join(' ');
    await ticketChannel.send({
      content: roleMentions || undefined,
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`Ticket • ${type.label}`)
          .setDescription(`${interaction.user} abriu este ticket. A equipe responderá aqui.\n\nUse os botões abaixo para assumir ou fechar o ticket.`)
          .setTimestamp()
      ],
      components: [buildTicketButtons()],
      allowedMentions: { parse: [], roles: pingRoleIds }
    });

    await interaction.editReply({ content: `✅ Seu ticket foi criado: ${ticketChannel}` });
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    if (ticketChannel) {
      await ticketChannel.delete('Falha ao concluir a criação do ticket').catch(deleteError => {
        console.error('Erro ao limpar canal de ticket incompleto:', deleteError);
      });
    }
    await interaction.editReply({
      content: '❌ Não foi possível criar o ticket. Verifique se o bot tem as permissões necessárias e tente novamente.'
    });
  }
}

async function claimTicket(interaction) {
  if (!interaction.guild || !interaction.channel || !getTicketMetadata(interaction.channel)) {
    return interaction.reply({ content: 'Este canal não é um ticket válido.', flags: MessageFlags.Ephemeral });
  }
  if (!hasTicketStaffRole(interaction.member)) {
    return interaction.reply({ content: '❌ Você não tem permissão para assumir tickets.', flags: MessageFlags.Ephemeral });
  }

  const metadata = getTicketMetadata(interaction.channel);
  if (metadata.claimedBy) {
    return interaction.reply({ content: `Este ticket já foi assumido por <@${metadata.claimedBy}>.`, flags: MessageFlags.Ephemeral });
  }

  try {
    await interaction.channel.setTopic(
      `ticket-owner:${metadata.ownerId};ticket-type:${metadata.type};ticket-claimed:${interaction.user.id}`
    );
    await interaction.update({
      content: interaction.message.content.replace(
        'A equipe responderá aqui.',
        `Ticket assumido por ${interaction.user}. A equipe responderá aqui.`
      ),
      components: [buildTicketButtons(true)]
    });
  } catch (error) {
    console.error('Erro ao assumir ticket:', error);
    const response = { content: '❌ Não foi possível assumir este ticket.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
}

async function buildTranscript(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  messages.reverse();
  const lines = messages.map(message => {
    const timestamp = message.createdAt.toISOString();
    const attachments = [...message.attachments.values()].map(file => file.url);
    const embeds = message.embeds.map(embed => [embed.title, embed.description].filter(Boolean).join('\n'));
    const body = [message.content, ...embeds, ...attachments].filter(Boolean).join('\n');
    return `[${timestamp}] ${message.author.tag}: ${body || '[sem texto]'}`;
  });

  return Buffer.from(
    `Transcript: #${channel.name}\nCriado em: ${channel.createdAt.toISOString()}\n\n${lines.join('\n\n')}\n`,
    'utf8'
  );
}

async function closeTicket(interaction) {
  const metadata = interaction.channel ? getTicketMetadata(interaction.channel) : null;
  if (!interaction.guild || !interaction.channel || !metadata) {
    return interaction.reply({ content: 'Este canal não é um ticket válido.', flags: MessageFlags.Ephemeral });
  }
  if (!hasTicketStaffRole(interaction.member)) {
    return interaction.reply({ content: '❌ Você não tem permissão para fechar tickets.', flags: MessageFlags.Ephemeral });
  }
  const canCloseClaimedTicket = TICKET_CLOSE_OVERRIDE_ROLE_IDS.some(roleId =>
    interaction.member.roles.cache.has(roleId)
  );
  if (metadata.claimedBy && metadata.claimedBy !== interaction.user.id && !canCloseClaimedTicket) {
    return interaction.reply({
      content: `❌ Apenas quem assumiu este ticket (<@${metadata.claimedBy}>) pode fechá-lo.`,
      flags: MessageFlags.Ephemeral
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channel = interaction.channel;

  try {
    const transcriptChannel = await interaction.guild.channels.fetch(TICKET_TRANSCRIPT_CHANNEL_ID);
    if (!transcriptChannel || transcriptChannel.guildId !== interaction.guild.id || !transcriptChannel.isTextBased()) {
      throw new Error(`Canal de transcripts inválido: ${TICKET_TRANSCRIPT_CHANNEL_ID}`);
    }

    const transcript = await buildTranscript(channel);
    const filename = `${channel.name}-transcript.txt`;
    await transcriptChannel.send({
      content: `Transcript do ticket **#${channel.name}**\nCriado por: <@${metadata.ownerId}>${metadata.claimedBy ? `\nAssumido por: <@${metadata.claimedBy}>` : ''}\nFechado por: <@${interaction.user.id}>`,
      files: [new AttachmentBuilder(transcript, { name: filename })],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error('Erro ao gerar ou enviar transcript do ticket:', error);
    return interaction.editReply({
      content: '❌ Não foi possível enviar o transcript. O ticket continua aberto; confira as permissões e tente novamente.'
    });
  }

  await interaction.editReply({ content: '✅ Transcript enviado. O ticket será fechado.' });
  try {
    await channel.delete(`Ticket fechado por ${interaction.user.tag}`);
  } catch (error) {
    console.error('Transcript enviado, mas não foi possível excluir o ticket:', error);
    await interaction.followUp({
      content: '⚠️ O transcript foi enviado, mas não consegui apagar o canal. Remova-o manualmente.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleTicketInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === OPEN_TICKET_MENU_ID) {
    await openTicket(interaction);
    return true;
  }
  if (interaction.isButton() && interaction.customId === CLAIM_TICKET_BUTTON_ID) {
    await claimTicket(interaction);
    return true;
  }
  if (interaction.isButton() && interaction.customId === CLOSE_TICKET_BUTTON_ID) {
    await closeTicket(interaction);
    return true;
  }
  return false;
}

module.exports = { loadTicketSystem, handleTicketInteraction, isTicketChannel, addMemberToTicket };
