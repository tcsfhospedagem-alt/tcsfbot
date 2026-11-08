const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ALLOWED_TEAM_ROLE_NAMES } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('squadsheet')
    .setDescription('Mostra o elenco de um time com as menções dos jogadores.')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time cujo elenco deseja consultar')
        .setRequired(true)
        .addChoices(...ALLOWED_TEAM_ROLE_NAMES.map(name => ({ name, value: name })))
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const teamName = interaction.options.getString('time');
    const teamRole = interaction.guild.roles.cache.find(role => role.name === teamName);

    if (!teamRole) {
      return interaction.editReply({
        content: `❌ Não encontrei o cargo do time **${teamName}** neste servidor.`
      });
    }

    const members = [];
    let after;

    do {
      const page = await interaction.guild.members.list({
        after,
        limit: 1000,
        cache: false
      });

      members.push(...[...page.values()].filter(member => member.roles.cache.has(teamRole.id)));

      if (page.size < 1000) break;
      after = page.lastKey();
    } while (after);

    members.sort((a, b) => a.user.username.localeCompare(b.user.username));

    const lines = members.length
      ? members.map(member => `• <@${member.id}>`)
      : ['Nenhum jogador está no elenco deste time.'];
    const pages = [];
    let currentPage = [];
    let currentLength = 0;

    for (const line of lines) {
      if (currentLength + line.length + (currentPage.length ? 1 : 0) > 3500) {
        pages.push(currentPage.join('\n'));
        currentPage = [];
        currentLength = 0;
      }

      currentPage.push(line);
      currentLength += line.length + (currentPage.length > 1 ? 1 : 0);
    }

    if (currentPage.length) pages.push(currentPage.join('\n'));

    const embeds = pages.map((roster, index) =>
      new EmbedBuilder()
        .setColor(teamRole.color || 0x5865f2)
        .setTitle(`📋 Elenco — ${teamName}`)
        .setDescription(roster)
        .setFooter({
          text: `${members.length} jogador(es)${pages.length > 1 ? ` • Página ${index + 1}/${pages.length}` : ''}`
        })
        .setTimestamp()
    );

    await interaction.editReply({
      embeds: [embeds[0]],
      allowedMentions: { parse: [] }
    });

    for (const embed of embeds.slice(1)) {
      await interaction.followUp({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    }
  }
};
