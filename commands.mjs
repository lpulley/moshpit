import axios from 'axios';
import * as Utilities from './utilities.mjs';

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
      select count(*) as count
      from "MoshpitUser"
      where discord_user_id = '${context.message.author.id}';
  `);

  if (result.rows[0].count > 0) {
    await context.message.reply('you are listed as a moshpit user!');
  } else {
    await context.message.reply('you are not listed as a moshpit user.');
  }
}

/**
 * Links a Spotify account to a Discord user.
 * Adds the Spotify user ID and necessary auth material to the database.
 * @param {Context} context
 */
export async function link(context) {
  const reply = (content) => context.message.reply(content);

  const spotifyAccessToken = await Utilities.getSpotifyAccessToken(
      context.message.author,
      context.postgres,
  );

  if (spotifyAccessToken) {
    const profileResponse = await axios.get(
        'https://api.spotify.com/v1/me',
        {headers: {'Authorization': `Bearer ${spotifyAccessToken}`}},
    );
    const username = profileResponse.data.display_name;
    await reply(`you are linked to the Spotify account \`${username}\`.`);
  } else {
    await reply('your Spotify account isn\'t connected.');
  }
}

/**
 * Creates a moshpit and adds the user to it
 * @param {Context} context The context from which this command was called
 */
export async function start(context) {
  const reply = (content) => context.message.reply(content);
  const pg = context.postgres;

  const result = await pg.query(`
      INSERT INTO "Moshpit" (
        discord_channel_id,
        owner_discord_id,
        join_secret
      )
      VALUES (
        '${context.message.channel.id}',
        '${context.message.member.user.id}',
        'fake secret :)'
      )
      RETURNING *;
  `);

  await pg.query(`
      UPDATE "MoshpitUser"
      SET moshpit_id = '${result.rows[0].moshpit_id}'
      WHERE discord_user_id = '${context.message.member.user.id}';
  `);

  if (result.rowCount > 0) {
    await reply(`success! Moshpit #${result.rows[0].moshpit_id} created.`);
  } else {
    await reply('fail :(');
  }

  const export_data = await SQL_to_Neo4j(context);
}

/**
 * Removes moshpit.
 * @param {Context} context
 */
export async function quit(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      DELETE FROM "Moshpit"
      WHERE owner_discord_id = '${context.message.member.user.id}'
        AND discord_channel_id = '${context.message.channel.id}'
      RETURNING *;
  `);

  await context.postgres.query(`
      UPDATE "MoshpitUser"
      SET moshpit_id = NULL
      WHERE discord_user_id = '${context.message.member.user.id}';
  `);

  if (result.rowCount > 0) {
    await reply(`success! Moshpit #${result.rows[0].moshpit_id} deleted.`);
  } else {
    await reply('fail! Moshpit does not exist.');
  }

  const export_data = await SQL_to_Neo4j(context);
}

/**
 * Gets moshpit data.
 * @param {Context} context
 */
export async function data(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      SELECT moshpit_id, discord_channel_id, owner_discord_id
      FROM "Moshpit"
      WHERE owner_discord_id = '${context.message.member.user.id}'
        AND discord_channel_id = '${context.message.channel.id}';
  `);

  if (result.rowCount > 0) {
    await reply(`\`${JSON.stringify(result.rows)}\``);
  } else {
    await reply('no results found.');
  }
}

/**
 * Advanced Query 1: Count total users with expired Spotify tokens, grouped by
 * the Discord Channel they are in.
 * @param {Context} context
 */
export async function aq1(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      SELECT m.discord_channel_id, COUNT(mu.discord_user_id)
      FROM "Moshpit" m NATURAL JOIN "MoshpitUser" mu
      WHERE mu.spotify_token_expiration < CURRENT_TIMESTAMP
      GROUP BY m.discord_channel_id;
  `);

  if (result.rowCount > 0) {
    await reply(`\`${JSON.stringify(result.rows)}\``);
  } else {
    await reply('no results found.');
  }
}

/**
 * Advanced Query 2: Count the number of moshpits that each user owns for users
 * that own at least one.
 * @param {Context} context
 */
export async function aq2(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      SELECT mu.discord_user_id, COUNT(m.moshpit_id)
      FROM "MoshpitUser" mu LEFT JOIN "Moshpit" m
        ON mu.discord_user_id = m.owner_discord_id
      GROUP BY mu.discord_user_id
      HAVING COUNT(m.moshpit_id) >= 1
      ORDER BY COUNT(m.moshpit_id) DESC;
  `);

  if (result.rowCount > 0) {
    await reply(`\`${JSON.stringify(result.rows)}\``);
  } else {
    await reply('no results found.');
  }
}
