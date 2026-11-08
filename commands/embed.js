const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ALLOWED_MS_EMBED_ROLES } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Cria um embed personalizado.')
    .addStringOption(option =>
      option.setName('descricao')
        .setDescription('Descrição principal do embed')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal onde o embed será enviado')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('titulo')
        .setDescription('Título do embed')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('cor')
        .setDescription('Cor do embed em HEX (ex.: FF0000 ou #FF0000)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('mencionar')
        .setDescription('Tipo de menção para incluir no embed')
        .setRequired(false)
        .addChoices(
          { name: 'Nenhum', value: 'none' },
          { name: '@everyone', value: 'everyone' },
          { name: '@here', value: 'here' }
        )
    )
    .addStringOption(option =>
      option.setName('imagem_url')
        .setDescription('URL da imagem principal do embed')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('imagem_anexo')
        .setDescription('Arquivo para usar como imagem do embed')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('thumb_url')
        .setDescription('URL da thumbnail do embed')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('thumb_anexo')
        .setDescription('Arquivo para usar como thumbnail do embed')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hasPermission = ALLOWED_MS_EMBED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    if (!hasPermission) {
      return interaction.editReply({
        content: '❌ Você não tem permissão para usar este comando.'
      });
    }

    const targetChannel = interaction.options.getChannel('canal') ?? interaction.channel;
    const title = interaction.options.getString('titulo');
    const description = interaction.options.getString('descricao');
    const color = interaction.options.getString('cor');
    const mentionChoice = interaction.options.getString('mencionar');
    const imageUrl = interaction.options.getString('imagem_url');
    const thumbUrl = interaction.options.getString('thumb_url');
    const imageAttachment = interaction.options.getAttachment('imagem_anexo');
    const thumbAttachment = interaction.options.getAttachment('thumb_anexo');

    if (!targetChannel || typeof targetChannel.send !== 'function') {
      return interaction.editReply({
        content: '❌ Canal inválido para enviar o embed.'
      });
    }

    let embedColor;
    if (color) {
      const normalizedColor = color.replace(/^#/, '');
      if (!/^[\da-fA-F]{6}$/.test(normalizedColor)) {
        return interaction.editReply({
          content: '❌ Cor inválida. Use o formato HEX de seis caracteres, por exemplo `FF0000`.'
        });
      }
      embedColor = Number.parseInt(normalizedColor, 16);
    }

    const embed = new EmbedBuilder().setDescription(description);

    if (title) embed.setTitle(title);
    if (embedColor !== undefined) embed.setColor(embedColor);
    if (imageAttachment) {
      embed.setImage(imageAttachment.url);
    } else if (imageUrl) {
      embed.setImage(imageUrl);
    }
    if (thumbAttachment) {
      embed.setThumbnail(thumbAttachment.url);
    } else if (thumbUrl) {
      embed.setThumbnail(thumbUrl);
    }

    const payload = {
      embeds: [embed],
      allowedMentions: {
        parse: mentionChoice === 'everyone' || mentionChoice === 'here' ? ['everyone'] : []
      }
    };

    if (mentionChoice === 'everyone') {
      payload.content = '@everyone';
    } else if (mentionChoice === 'here') {
      payload.content = '@here';
    }

    await targetChannel.send(payload);

    return interaction.editReply({
      content: `✅ Embed enviado em ${targetChannel}.`
    });
  }
};
