import SpotifyWebApi from 'spotify-web-api-node';
import * as Utilities from './utilities.mjs';

/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Links a Spotify account to a Discord user.
 * Adds the Spotify user ID and necessary auth material to the database.
 * @param {Context} context
 */
export async function link(context) {
  const reply = (content) => context.message.reply(content);

  const {userId: spotifyUserId} = await Utilities.getSpotifyAuth(
      context.message.author,
      context.postgres,
  );

  if (spotifyUserId) {
    await reply(`you are linked to the Spotify account \`${spotifyUserId}\`.`);
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

  const {
    userId: spotifyUserId,
    accessToken: spotifyAccessToken,
  } = await Utilities.getSpotifyAuth(
      context.message.author,
      context.postgres,
  );

  if (!spotifyUserId || !spotifyAccessToken) {
    reply('you can\'t use this feature without a connected Spotify account.');
    return;
  }

  const spotifyApi = new SpotifyWebApi({accessToken: spotifyAccessToken});

  try {
    const oldMoshpitResult = await context.postgres.query(`
        select moshpit_id, spotify_playlist_id
        from "Moshpit"
        where discord_channel_id = '${context.message.channel.id}'
          and owner_discord_id = '${context.message.author.id}'
        order by moshpit_id desc;
    `);

    let moshpitId = null;
    let playlistId = null;

    if (oldMoshpitResult.rowCount > 0) {
      // This user has an existing moshpit in this channel
      moshpitId = oldMoshpitResult.rows[0].moshpit_id;
      playlistId = oldMoshpitResult.rows[0].spotify_playlist_id;
    } else {
      // We need to create a new moshpit for this user in this channel

      // Create a playlist for this moshpit in Spotify
      const playlistResponse = await spotifyApi.createPlaylist(
          `${context.message.guild.name} ${context.message.channel.name}`,
          {description: 'A moshpit auto-generated playlist'},
      );

      // Create a new moshpit in the database
      const newMoshpitResult = await context.postgres.query(`
          insert into "Moshpit" (
            discord_channel_id,
            owner_discord_id,
            join_secret,
            spotify_playlist_id
          )
          values (
            '${context.message.channel.id}',
            '${context.message.member.user.id}',
            '',
            '${playlistResponse.body.id}'
          )
          returning moshpit_id;
      `);

      moshpitId = newMoshpitResult.rows[0].moshpit_id;
      playlistId = playlistResponse.body.id;
    }

    // Update the owner's current moshpit
    await context.postgres.query(`
        update "MoshpitUser"
        set moshpit_id = '${moshpitId}'
        where discord_user_id = '${context.message.author.id}';
    `);

    // Simply send a link to the playlist
    // TODO: Start an activity that people can join
    await context.message.channel.send(
        `https://open.spotify.com/playlist/${playlistId}`,
    );
  } catch (error) {
    console.error(error);
    await reply('something went wrong creating your moshpit.');
  }
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
