import Spotify from 'spotify-web-api-node';
import * as Utilities from './utilities.mjs';

/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * @typedef {import('discord.js').User} DiscordUser
 */

/**
 * Gets a Spotify Web API instance for the user and database from the context.
 * @param {Context} context
 * @param {?DiscordUser} user
 * @return {Promise<?Spotify>}
 */
async function getSpotify(context, user) {
  const accessToken = await Utilities.getSpotifyAccessToken(
      user || context.message.author,
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
  const owner = context.message.author;
  const ownerSpotify = await getSpotify(context, owner);
  if (!ownerSpotify) {
    await reply('you need to be signed in to Spotify.');
    return;
  }

  const oldMoshpitResults = await context.postgres.query(`
      select moshpit_id, spotify_playlist_id
      from "Moshpit"
      where discord_guild_id = '${context.message.guild.id}'
        and owner_discord_id = '${owner.id}';
  `);
  let moshpit = oldMoshpitResults.rows[0];

  // If there isn't already a moshpit for this user in this guild, make one
  if (!moshpit) {
    // Create a Spotify playlist
    const playlistResponse = await ownerSpotify.createPlaylist(
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
          '${owner.id}',
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
      where discord_user_id = '${owner.id}';
  `);

  await reply(`great! Let's get everyone else on board.`);

  const listeners = await Utilities.collectJoins(
      context.message.channel,
      owner,
      `React to join <@${owner.id}>'s moshpit!`,
      '🖐️',
  );

  // Get each user's top 50 artists' IDs as seed candidates
  const artistCandidates = await Promise.all(
      [owner, ...listeners].map(async (user) => {
        const userSpotify = await getSpotify(context, user);
        const response = await userSpotify.getMyTopArtists({limit: 50});
        const ids = response.body.items.map((item) => item.id);
        return ids;
      }),
  );

  console.debug(artistCandidates);

  const trackIDs = Array(5).map(async () => {
    // Choose 5 artist IDs from these candidates at random to be the seeds
    const artists = Array(5).map(async () =>
      artistCandidates[Math.floor(Math.random() * artistCandidates.length)]);
    // Return a recommended track ID
    return ownerSpotify.getRecommendations({
      seed_artists: artists,
      limit: 1,
    }).body.tracks[0].id;
  });

  console.debug(trackIDs);

  // Populate the playlist with initial tracks
  await ownerSpotify.addTracksToPlaylist(
      moshpit.spotify_playlist_id,
      trackIDs.map((id) => `spotify:track:${id}`),
      {position: 0},
  );

  // Start playing the playlist
  await Promise.all([owner, ...listeners].map(async (listener) => {
    const listenerSpotify = await getSpotify(context, listener);
    // TODO: Can we force the users to open sessions before trying to play?

    // Return each promise to Promise.all instead of await-ing so that they can
    // run in parallel
    await listenerSpotify.setShuffle(false);
    return listenerSpotify.play({
      context_uri: `spotify:playlist:${moshpit.spotify_playlist_id}`,
      offset: {position: 0}, // Start at the first track in the playlist
    }).catch(() => {
      listener.send('Something went wrong while joining the moshpit. Make ' +
                    'sure you have an active Spotify session! You may need ' +
                    'to start playback first.');
    });
  }));

  await context.message.channel.send('Started the moshpit!');
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
