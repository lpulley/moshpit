/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Replies with "pong!"
 * @param {Context} context
 */
export async function ping(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);

  say('Pong!');
}

/**
 * Replies with the user's information from the database, if any.
 * @param {Context} context
 */
export async function whoami(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);
  const pg = context.postgres;

  const result = await pg.query(`
      SELECT *
      FROM "MoshpitUser"
      WHERE discord_user_id = '${context.message.member.user.id}';
  `);

  if (result.rows.length > 0) {
    say('You are listed as a moshpit user!');
  } else {
    say('You are not listed as a moshpit user.');
  }
}
