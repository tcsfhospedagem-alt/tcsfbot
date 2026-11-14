const { Events } = require('discord.js');
const {
  VERIFIED_ROLE_ID,
  UNVERIFIED_ROLE_ID,
  MEMBER_ROLE_ID
} = require('../config/constants');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    const isVerified = newMember.roles.cache.has(VERIFIED_ROLE_ID);
    const isUnverified = newMember.roles.cache.has(UNVERIFIED_ROLE_ID);

    if (!isVerified) return;

    if (!newMember.roles.cache.has(MEMBER_ROLE_ID)) {
      try {
        await newMember.roles.add(
          MEMBER_ROLE_ID,
          'Membro recebeu Verified pelo Bloxlink'
        );

        console.log(`Cargo Membro adicionado a ${newMember.user.tag}`);
      } catch (error) {
        console.error('Erro ao adicionar Membro:', error);
      }
    }

    if (isUnverified) {
      try {
        await newMember.roles.remove(
          UNVERIFIED_ROLE_ID,
          'Membro verificou a conta pelo Bloxlink'
        );

        console.log(`Cargo Unverified removido de ${newMember.user.tag}`);
      } catch (error) {
        console.error('Erro ao remover Unverified:', error);
      }
    }
  }
};
