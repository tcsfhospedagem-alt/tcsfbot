const { Events, PermissionFlagsBits } = require('discord.js');
const { ALLOWED_COMMAND_ROLES, ALLOWED_FA_CHANNELS, ALLOWED_CONTRACT_CHANNELS, ALLOWED_SCOUTING_CHANNELS, ALLOWED_RELEASE_CHANNELS } = require('../config/constants');

const INVITE_REGEX = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
const DIVULGACAO_REGEX = /^algu[eé]m\s+quer\s+entrar/i;

const AUTO_RESPONSES = [
  {
    keywords: [
      'como uso fa', 'como usar fa', 'como faço fa', 'como faz fa',
      'como anuncio fa', 'como ser fa', 'como postar fa', 'como manda fa',
      'onde uso fa', 'onde faço fa', 'onde fica o fa', 'cade o fa',
      'o que e fa', 'oque e fa', 'pra que serve fa', 'como funciona fa',
      'free agent como', 'como viro fa', 'quero ser fa', 'como posto fa',
      'como uso free agent', 'como usar free agent', 'como faço free agent',
      'como faz free agent', 'como anuncio free agent', 'como ser free agent',
      'como postar free agent', 'como manda free agent', 'como mando free agent',
      'onde uso free agent', 'onde faço free agent', 'cade o free agent',
      'o que e free agent', 'oque e free agent', 'pra que serve free agent',
      'como funciona free agent', 'como viro free agent', 'quero ser free agent',
      'como coloco free agent', 'como posto free agent', 'como anunciar free agent',
    ],
    response: `📢 Para se anunciar como **Free Agent**, use o comando \`/fa "mensagem"\` no canal <#${ALLOWED_FA_CHANNELS[0]}>!`
  },
  {
    keywords: [
      'como uso contract', 'como usar contract', 'como faço contract', 'como faz contract',
      'como envio contrato', 'como mando contrato', 'como criar contrato',
      'onde uso contract', 'onde faço contract', 'cade o contract',
      'como funciona contract', 'pra que serve contract', 'o que e contract',
      'como contratar jogador', 'como contratar alguem', 'quero contratar',
      'como propor contrato', 'como fazer contrato', 'como assinar contrato',
      'como manda contract', 'como mando contract',
    ],
    response: `📋 Para propor um **Contrato**, use o comando \`/contract\` no canal <#${ALLOWED_CONTRACT_CHANNELS[0]}>!`
  },
  {
    keywords: [
      'como uso scouting', 'como usar scouting', 'como faço scouting', 'como faz scouting',
      'como anuncio scouting', 'como postar scouting', 'onde uso scouting',
      'cade o scouting', 'como funciona scouting', 'pra que serve scouting',
      'o que e scouting', 'oque e scouting', 'quero fazer scouting',
      'como recrutar jogador', 'como procurar jogador', 'como buscar jogador',
      'como manda scouting', 'como mando scouting',
    ],
    response: `🔍 Para anunciar um **Scouting**, use o comando \`/scouting\` no canal <#${ALLOWED_SCOUTING_CHANNELS[0]}>!`
  },
  {
    keywords: [
      'como uso release', 'como usar release', 'como faço release', 'como faz release',
      'como sair do time', 'como saio do time', 'como me liberar', 'como se liberar',
      'onde uso release', 'cade o release', 'como funciona release',
      'pra que serve release', 'o que e release', 'oque e release',
      'quero sair do time', 'como deixar o time', 'como largar o time',
      'como dar release', 'quero dar release', 'quero me liberar',
      'como manda release', 'como mando release',
    ],
    response: `🔓 Para se **liberar de um time**, use o comando \`/release\` no canal <#${ALLOWED_RELEASE_CHANNELS[0]}>!`
  },
];

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const msgLower = message.content.toLowerCase().trim();

    if (
      message.member &&
      !message.member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      if (INVITE_REGEX.test(message.content)) {
        try {
          await message.delete();
          const warning = await message.channel.send({
            content: `🚫 ${message.author}, **convites de outros servidores não são permitidos aqui!**`,
          });
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          console.log(`🚫 Convite deletado de ${message.author.tag} em #${message.channel.name}`);
        } catch (err) {
          console.error('Erro ao deletar convite:', err);
        }
        return;
      }
    }

    if (DIVULGACAO_REGEX.test(msgLower)) {
      const temPermissao = message.member && ALLOWED_COMMAND_ROLES.some(id => message.member.roles.cache.has(id));
      if (!temPermissao) {
        try {
          await message.delete();
          const warning = await message.channel.send({
            content: `🚫 ${message.author}, **divulgações não são permitidas aqui!** Apenas membros autorizados podem fazer este tipo de anúncio.`,
          });
          setTimeout(() => warning.delete().catch(() => {}), 5000);
          console.log(`🚫 Divulgação bloqueada de ${message.author.tag} em #${message.channel.name}`);
        } catch (err) {
          console.error('Erro ao deletar divulgação:', err);
        }
        return;
      }
    }

    // Auto-respostas
    for (const entry of AUTO_RESPONSES) {
      const matched = entry.keywords.some(keyword => msgLower.includes(keyword));
      if (matched) {
        try {
          await message.reply({ content: entry.response });
        } catch (err) {
          console.error('Erro ao enviar resposta automática:', err);
        }
        return;
      }
    }
  },
};
