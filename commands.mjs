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

/**
 * Replies with nothing useful.
 * @param {Context} context The context from which this command was called
 */
export async function link(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);
  const pg = context.postgres;

  const result = await pg.query(`
      UPDATE "MoshpitUser"
      SET spotify_access_token = 'ACCESS_TOKEN_HERE',
        spotify_refresh_token = 'REFRESH_TOKEN_HERE'
      WHERE discord_user_id = '${context.message.member.user.id}'
      RETURNING *;
  `);

  if (result.rows.length > 0) {
    say('Success! Your Spotify tokens have been updated.');
    console.log(result);
  } else {
    say('Fail :(');
  }
}

/**
 * Creates a moshpit and adds the user to it
 * @param {Context} context The context from which this command was called
 */
export async function start(context) {
  // Define a shortcut function to reply in the channel
  const say = (content) => context.message.channel.send(content);
  const pg = context.postgres;

  const result = await pg.query(`
      INSERT INTO "Moshpit" (discord_channel_id, owner_discord_id, join_secret)
      VALUES ('${context.message.channel.id}',
        '${context.message.member.user.id}', 'fake secret :)')
      RETURNING *;
  `);

  await pg.query(`
      UPDATE "MoshpitUser"
      SET moshpit_id = '${result.rows[0].moshpit_id}'
      WHERE discord_user_id = '${context.message.member.user.id}'
  `);

  if (result.rows.length > 0) {
    say('Success! Moshpit #' + result.rows[0].moshpit_id + ' created.');
  } else {
    say('Fail :(');
  }
}

/**
 * Removes moshpit.
 * @param {Context} context
 */
export async function quit(context) {
  // Define a shortcut function to reply in the channel
  const result = await context.postgres.query(`
    DELETE FROM "Moshpit"
    WHERE owner_discord_id = '${context.message.member.user.id}'
      AND discord_channel_id = '${context.message.channel.id}'
    RETURNING *;
  `);
  console.log(context.message.member.user.id);
  console.log(context.message.channel.id);

  if (result.rowCount > 0) {
    context.message.reply('moshpit has been deleted!');
  } else {
    context.message.reply('moshpit does not exist.');
  }
}

/**
 * Advanced Query 1: Count total users with expired Spotify tokens, grouped by
 * the Discord Channel they are in.
 * @param {Context} context
 */
export async function aq1(context) {
  // Define a shortcut function to reply in the channel
  const result = await context.postgres.query(`
    SELECT m.discord_channel_id, COUNT(mu.discord_user_id)
    FROM "Moshpit" m NATURAL JOIN "MoshpitUser" mu
    WHERE mu.spotify_token_expiration < CURRENT_TIMESTAMP
    GROUP BY m.discord_channel_id;
  `);

  if (result.rows.length > 0) {
    context.message.reply(JSON.stringify(result.rows));
  } else {
    context.message.reply('No results found.');
  }
}

/**
 * Advanced Query 2: Count the number of moshpits that each user owns for users
 * that own at least one.
 * @param {Context} context
 */
export async function aq2(context) {
  // Define a shortcut function to reply in the channel
  const result = await context.postgres.query(`
    SELECT mu.discord_user_id, COUNT(m.moshpit_id)
    FROM "MoshpitUser" mu LEFT JOIN "Moshpit" m
      ON mu.discord_user_id = m.owner_discord_id
    GROUP BY mu.discord_user_id
    HAVING COUNT(m.moshpit_id) >= 1
    ORDER BY COUNT(m.moshpit_id) DESC;
  `);

  if (result.rows.length > 0) {
    context.message.reply(JSON.stringify(result.rows));
  } else {
    context.message.reply('No results found.');
  }
}
