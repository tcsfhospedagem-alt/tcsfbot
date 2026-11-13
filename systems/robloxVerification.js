const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const crypto = require('node:crypto');
const {
  CONTRACT_GUILD_ID,
  LIMITED_ACCESS_ROLE_ID,
  ROBLOX_VERIFICATION_CHANNEL_ID,
  ROBLOX_VERIFIED_ROLE_IDS
} = require('../config/constants');

const PANEL_BUTTON_ID = 'roblox_verify_start';
const USERNAME_MODAL_ID = 'roblox_verify_username';
const USERNAME_INPUT_ID = 'roblox_username';
const VERIFY_BUTTON_PREFIX = 'roblox_verify_check:';
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const pendingVerifications = new Map();

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Verificação de conta Roblox')
    .setDescription([
      'Vincule sua conta Roblox para receber os cargos de verificado.',
      '',
      '1. Clique no botão abaixo e informe seu **nome de usuário Roblox**.',
      '2. Coloque o código temporário recebido na **descrição da sua conta Roblox**.',
      '3. Clique em **Verificar bio** para confirmar.'
    ].join('\n'));

  const button = new ButtonBuilder()
    .setCustomId(PANEL_BUTTON_ID)
    .setLabel('Verificar conta Roblox')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(button)]
  };
}

async function loadRobloxVerificationPanel(client) {
  const channel = await client.channels.fetch(ROBLOX_VERIFICATION_CHANNEL_ID);
  if (
    !channel ||
    channel.guildId !== CONTRACT_GUILD_ID ||
    !channel.isTextBased() ||
    !channel.messages
  ) {
    throw new Error(`Canal do painel de verificação inválido: ${ROBLOX_VERIFICATION_CHANNEL_ID}`);
  }

  let before;
  let existingPanel;
  while (!existingPanel) {
    const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    existingPanel = messages.find(message =>
      message.author.id === client.user.id &&
      message.components.some(row =>
        row.components.some(component => component.customId === PANEL_BUTTON_ID)
      )
    );
    if (existingPanel || messages.size < 100) break;
    before = messages.last().id;
  }

  if (existingPanel) {
    await existingPanel.edit(buildPanelPayload());
  } else {
    await channel.send(buildPanelPayload());
  }
}

async function fetchRobloxJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error('Não foi possível acessar a API do Roblox. Tente novamente em alguns instantes.', { cause: error });
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('A API do Roblox está recebendo muitas consultas. Aguarde um pouco e tente novamente.');
    }
    throw new Error(`A API do Roblox respondeu com erro (${response.status}). Tente novamente mais tarde.`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error('A API do Roblox retornou uma resposta inválida.', { cause: error });
  }
}

async function fetchRobloxUser(username) {
  const lookup = await fetchRobloxJson('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const user = lookup.data?.find(entry =>
    entry.name?.toLowerCase() === username.toLowerCase()
  );

  if (!user) return null;

  const [profile, thumbnail] = await Promise.all([
    fetchRobloxJson(`https://users.roblox.com/v1/users/${user.id}`),
    fetchRobloxJson(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
    )
  ]);

  return {
    id: user.id,
    username: user.name,
    displayName: user.displayName,
    description: profile.description || '',
    avatarUrl: thumbnail.data?.find(entry => entry.targetId === user.id)?.imageUrl || null
  };
}

async function fetchAssignableRoles(guild) {
  const botMember = await guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('O bot precisa da permissão **Gerenciar cargos** para concluir a verificação.');
  }

  const [roles, restrictedRole] = await Promise.all([
    Promise.all(ROBLOX_VERIFIED_ROLE_IDS.map(roleId => guild.roles.fetch(roleId))),
    guild.roles.fetch(LIMITED_ACCESS_ROLE_ID)
  ]);
  if (roles.some(role => !role) || !restrictedRole) {
    throw new Error('Um ou mais cargos de verificação não foram encontrados no servidor.');
  }

  const unmanageableRole = [...roles, restrictedRole].find(role =>
    role.managed || botMember.roles.highest.comparePositionTo(role) <= 0
  );
  if (unmanageableRole) {
    throw new Error(`Mova o cargo do bot acima de <@&${unmanageableRole.id}> para que ele possa gerenciá-lo.`);
  }

  return { roles, restrictedRole };
}

function createVerificationCode() {
  let code;
  do {
    code = `TCSF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  } while (pendingVerifications.has(code));
  return code;
}

function removeExpiredVerifications() {
  const now = Date.now();
  for (const [code, verification] of pendingVerifications) {
    if (verification.expiresAt <= now) pendingVerifications.delete(code);
  }
}

async function handleUsernameModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const username = interaction.fields.getTextInputValue(USERNAME_INPUT_ID).trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return interaction.editReply('❌ Informe um nome de usuário Roblox válido (3 a 20 letras, números ou `_`).');
  }

  try {
    await fetchAssignableRoles(interaction.guild);
    const user = await fetchRobloxUser(username);
    if (!user) {
      return interaction.editReply('❌ Não encontrei essa conta Roblox. Confira o nome de usuário e tente novamente.');
    }

    removeExpiredVerifications();
    const code = createVerificationCode();
    const expiresAt = Date.now() + VERIFICATION_TTL_MS;
    pendingVerifications.set(code, {
      discordUserId: interaction.user.id,
      robloxUserId: user.id,
      username: user.username,
      code,
      expiresAt
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Conta Roblox encontrada')
      .setDescription([
        `Conta: [${user.username}](https://www.roblox.com/users/${user.id}/profile)${user.displayName && user.displayName !== user.username ? ` (${user.displayName})` : ''}`,
        '',
        'Coloque este código na descrição (bio) do perfil Roblox e depois clique em **Verificar bio**:',
        `\`${code}\``,
        '',
        'O código é temporário e expira em 10 minutos.'
      ].join('\n'));

    if (user.avatarUrl) embed.setThumbnail(user.avatarUrl);

    const verifyButton = new ButtonBuilder()
      .setCustomId(`${VERIFY_BUTTON_PREFIX}${code}`)
      .setLabel('Verificar bio')
      .setStyle(ButtonStyle.Success);

    return interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(verifyButton)]
    });
  } catch (error) {
    console.error('Erro ao preparar verificação Roblox:', error);
    return interaction.editReply(`❌ ${error.message}`);
  }
}

async function handleVerifyButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const code = interaction.customId.slice(VERIFY_BUTTON_PREFIX.length);
  const verification = pendingVerifications.get(code);
  if (!verification || verification.expiresAt <= Date.now()) {
    pendingVerifications.delete(code);
    return interaction.editReply('❌ Esse código expirou. Inicie uma nova verificação pelo painel.');
  }

  if (verification.discordUserId !== interaction.user.id) {
    return interaction.editReply('❌ Só a pessoa que iniciou esta verificação pode confirmar o código.');
  }

  try {
    const profile = await fetchRobloxJson(`https://users.roblox.com/v1/users/${verification.robloxUserId}`);
    if (!profile.description?.includes(verification.code)) {
      return interaction.editReply('❌ Não encontrei o código na bio dessa conta. Adicione-o e tente novamente.');
    }

    const { roles, restrictedRole } = await fetchAssignableRoles(interaction.guild);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(
      roles,
      `Verificação da conta Roblox @${verification.username} concluída por ${interaction.user.tag}`
    );
    await member.roles.remove(
      restrictedRole,
      `Verificação da conta Roblox @${verification.username} concluída por ${interaction.user.tag}`
    );
    pendingVerifications.delete(code);

    return interaction.editReply(
      `✅ Conta Roblox **${verification.username}** verificada! Você recebeu ${roles.map(role => `<@&${role.id}>`).join(' e ')} e o cargo <@&${restrictedRole.id}> foi removido.`
    );
  } catch (error) {
    console.error('Erro ao confirmar verificação Roblox:', error);
    return interaction.editReply(`❌ Não foi possível concluir a verificação. ${error.message}`);
  }
}

async function handleRobloxVerificationInteraction(interaction) {
  if (
    interaction.isButton() &&
    interaction.customId === PANEL_BUTTON_ID
  ) {
    if (
      !interaction.inGuild() ||
      interaction.guildId !== CONTRACT_GUILD_ID ||
      interaction.channelId !== ROBLOX_VERIFICATION_CHANNEL_ID
    ) {
      await interaction.reply({
        content: '❌ Use o painel de verificação no canal configurado.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(USERNAME_MODAL_ID)
      .setTitle('Verificar conta Roblox');
    const usernameInput = new TextInputBuilder()
      .setCustomId(USERNAME_INPUT_ID)
      .setLabel('Nome de usuário Roblox')
      .setPlaceholder('Digite seu username, não o display name')
      .setStyle(TextInputStyle.Short)
      .setMinLength(3)
      .setMaxLength(20)
      .setRequired(true);

    if (interaction.replied || interaction.deferred) return true;

    await interaction.showModal(modal.addComponents(
      new ActionRowBuilder().addComponents(usernameInput)
    ));
    return true;
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId === USERNAME_MODAL_ID
  ) {
    if (!interaction.inGuild() || interaction.guildId !== CONTRACT_GUILD_ID) {
      await interaction.reply({
        content: '❌ Esta verificação só pode ser usada no servidor configurado.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    await handleUsernameModal(interaction);
    return true;
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith(VERIFY_BUTTON_PREFIX)
  ) {
    if (!interaction.inGuild() || interaction.guildId !== CONTRACT_GUILD_ID) {
      await interaction.reply({
        content: '❌ Esta verificação só pode ser usada no servidor configurado.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    await handleVerifyButton(interaction);
    return true;
  }

  return false;
}

module.exports = {
  buildPanelPayload,
  handleRobloxVerificationInteraction,
  loadRobloxVerificationPanel
};
