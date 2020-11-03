/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Replies with the user's information from the database, if any.
 * @param {Context} context
 */
export async function whoami(context) {
  const result = await context.postgres.query(`
      SELECT COUNT(*)
      FROM "MoshpitUser"
      WHERE discord_user_id = '${context.message.author.id}';
  `);

  if (result.rows[0].count > 0) {
    context.message.reply('You are listed as a moshpit user!');
  } else {
    context.message.reply('You are not listed as a moshpit user.');
  }
}
