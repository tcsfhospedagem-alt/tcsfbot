const { ALLOWED_TEAM_ROLE_NAMES } = require('../config/constants');

function getTeamRoles(member) {
  return [...member.roles.cache.values()].filter(role =>
    ALLOWED_TEAM_ROLE_NAMES.includes(role.name)
  );
}

module.exports = { getTeamRoles };