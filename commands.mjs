/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Replies with "pong!"
 * @param {Context} context The context from which this command was called
 */
export async function ping(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);

  say('Pong!');
}

/**
 * Replies with nothing useful.
 * @param {Context} context The context from which this command was called
 */
export async function link(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);
  const pg = context.postgres;

  const result = await pg.query(`
      Update "MoshpitUser"
      SET spotify_access_token = 'ACCESS_TOKEN_HERE',
        spotify_refresh_token = 'REFRESH_TOKEN_HERE'
      WHERE discord_user_id = '${context.message.member.user.id}'
      RETURNING *;
  `);

  if (result.rows.length > 0) {
    say('Success! Your Spotify tokens have been updated.');
    console.log(result)
  } else {
    say('Fail :(');
  }
}

/**
 * Replies with nothing useful.
 * @param {Context} context The context from which this command was called
 */
export async function start(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);
  const pg = context.postgres;

  const result = await pg.query(`
      INSERT INTO "Moshpit" (discord_channel_id, owner_discord_id, join_secret)
      VALUES ('${context.message.channel.id}', '${context.message.channel.id}', 'fake secret :)')
      RETURNING *;
  `);

  if (result.rows.length > 0) {
    say('Success! Moshpit #' + result.rows[0].moshpit_id + ' created.');
    console.log(result)
  } else {
    say('Fail :(');
  }
}
