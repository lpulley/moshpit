import Spotify from 'spotify-web-api-node';
import * as Utilities from './utilities.mjs';

/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Gets a Spotify Web API instance for the user and database from the context.
 * @param {Context} context
 * @return {Promise<?Spotify>}
 */
async function getSpotify(context) {
  const accessToken = await Utilities.getSpotifyAccessToken(
      context.message.author,
      context.postgres,
  );
  return accessToken ? new Spotify({accessToken: accessToken}) : null;
}

/**
 * Links a Spotify account to a Discord user.
 * Adds the Spotify user ID and necessary auth material to the database.
 * @param {Context} context
 */
export async function link(context) {
  const reply = (content) => context.message.reply(content);
  const spotify = await getSpotify(context);

  if (spotify) {
    const profileResponse = await spotify.getMe();
    const username = profileResponse.body.id;
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
  const spotify = await getSpotify(context);

  if (!spotify) {
    await reply('you need to be signed in to Spotify.');
    return;
  }

  const oldMoshpitResults = await context.postgres.query(`
      select moshpit_id, spotify_playlist_id
      from "Moshpit"
      where discord_guild_id = '${context.message.guild.id}'
        and owner_discord_id = '${context.message.author.id}';
  `);
  let moshpit = oldMoshpitResults.rows[0];

  // If there isn't already a moshpit for this user in this guild, make one
  if (!moshpit) {
    // Create a Spotify playlist
    const playlistResponse = await spotify.createPlaylist(
        `${context.message.guild.name} moshpit`,
        {
          'public': true,
          'description': `A moshpit auto-generated playlist`,
        },
    );
    const playlist = playlistResponse.body;

    // Create a moshpit in the database
    const newMoshpitResults = await context.postgres.query(`
        insert into "Moshpit" (
          spotify_playlist_id,
          discord_guild_id,
          owner_discord_id,
          join_secret
        )
        values (
          '${playlist.id}',
          '${context.message.guild.id}',
          '${context.message.author.id}',
          ''
        )
        returning moshpit_id, spotify_playlist_id;
    `);

    moshpit = newMoshpitResults.rows[0];
  }

  // Update the owner's current moshpit to this one
  await context.postgres.query(`
      update "MoshpitUser"
      set moshpit_id = '${moshpit.moshpit_id}'
      where discord_user_id = '${context.message.author.id}';
  `);

  await reply(`success! Moshpit #${moshpit.moshpit_id} started.`);
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
