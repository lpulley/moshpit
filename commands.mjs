import Spotify from 'spotify-web-api-node';
import * as Utilities from './utilities.mjs';
import * as Neo4j from './neo4j.mjs';

/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 * @property {import('neo4j-driver').Session} neo4j
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

  // Check how long the playlist is
  const playlistLengthResponse = await ownerSpotify.getPlaylistTracks(
      moshpit.spotify_playlist_id,
      {fields: 'total'},
  );
  let playlistLength = playlistLengthResponse.body.total;

  // Populate the playlist with more tracks if it's too small
  if (playlistLength < 5) {
    const trackURIs = await Utilities.addTracks(
        ownerSpotify,
        [ownerSpotify, ...await Promise.all(
            listeners.map((user) => getSpotify(context, user)),
        )],
        5 - playlistLength,
        context.postgres,
        moshpit.moshpit_id,
        moshpit.spotify_playlist_id,
    );
    playlistLength += trackURIs.length;
  }

  // Determine the track to start on
  const startTrackURIResponse = await ownerSpotify.getPlaylistTracks(
      moshpit.spotify_playlist_id,
      {
        offset: playlistLength - 5,
        limit: 1,
        fields: 'items(track(uri))',
      },
  );
  const startTrackURI = startTrackURIResponse.body.items[0].track.uri;

  // Start playing the playlist
  await Promise.all([owner, ...listeners].map(async (listener) => {
    const listenerSpotify = await getSpotify(context, listener);
    // TODO: Can we force the users to open sessions before trying to play?

    try {
      await listenerSpotify.setShuffle(false);
      await listenerSpotify.play({
        context_uri: `spotify:playlist:${moshpit.spotify_playlist_id}`,
        offset: {uri: startTrackURI},
      });
      // Update the listener's most recent moshpit
      await context.postgres.query(`
          update "MoshpitUser"
          set moshpit_id = '${moshpit.moshpit_id}'
          where discord_user_id = '${listener.id}';
      `);
    } catch (error) {
      if (listener.id === owner.id) {
        throw error;
      } else {
        listener.send('Something went wrong while joining the moshpit. Make ' +
                      'sure you have an active Spotify session! You may need ' +
                      'to start playback first.');
        console.info(error);
      }
    }
  }));

  // Send an initial "Now Playing" message
  let playbackState = (await ownerSpotify.getMyCurrentPlaybackState()).body;
  let nowPlayingMessage =
      await reply(`now playing: "${playbackState.item.name}"`);

  // Check the owner's player status on an interval
  setInterval(async function() { // Using lambda because we need 'this'
    const oldPlaybackState = playbackState;
    playbackState = (await ownerSpotify.getMyCurrentPlaybackState()).body;

    if (!playbackState.is_playing || playbackState.context.uri !==
        `spotify:playlist:${moshpit.spotify_playlist_id}`) {
      // If the owner has stopped or left the playlist, end playback
      await nowPlayingMessage.delete();
      await Promise.all(listeners.map(async (listener) => {
        const listenerSpotify = await getSpotify(context, listener);
        await listenerSpotify.pause();
      }));
      // Stop this interval
      // eslint-disable-next-line no-invalid-this
      clearInterval(this);
    } else if (playbackState.item.id !== oldPlaybackState.item.id) {
      // If the owner has moved on to the next song, update "Now Playing"
      await nowPlayingMessage.delete();
      nowPlayingMessage =
          await reply(`now playing: "${playbackState.item.name}"`);
    }
  }, 5000);

  await Neo4j.sqlToNeo4j(context);
}

/**
 * Gets data for the user's moshpit in the current server if one exists.
 * @param {Context} context
 */
export async function data(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      select moshpit_id, discord_guild_id, owner_discord_id
      from "Moshpit"
      where owner_discord_id = '${context.message.author.id}'
        and discord_guild_id = '${context.message.guild.id}';
  `);

  if (result.rowCount > 0) {
    await reply(`\`\`\`\n${JSON.stringify(result.rows)}\n\`\`\``);
  } else {
    await reply('no results found.');
  }
}

/**
 * Deletes the current moshpit fromt the database
 * @param {Context} context
 */
export async function quit(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      DELETE FROM "Moshpit"
      WHERE owner_discord_id = '${context.message.author.id}';
  `);

  if (result.rowCount > 0) {
    await reply(`your moshpits were deleted!`);
  } else {
    await reply('no results found.');
  }
}

/**
 * Advanced Query 1: Count total users with expired Spotify tokens, grouped by
 * the Discord Guild they are in.
 * @param {Context} context
 */
export async function aq1(context) {
  const reply = (content) => context.message.reply(content);

  const result = await context.postgres.query(`
      SELECT m.discord_guild_id, COUNT(mu.discord_user_id)
      FROM "Moshpit" m NATURAL JOIN "MoshpitUser" mu
      WHERE mu.spotify_token_expiration < CURRENT_TIMESTAMP
      GROUP BY m.discord_guild_id;
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
