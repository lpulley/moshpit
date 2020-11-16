import sha256 from 'js-sha256';
import axios from 'axios';
import qs from 'qs';
import * as Callback from './callback.mjs';

/**
 * @typedef {import('discord.js').User} DiscordUser
 * @typedef {import('discord.js').TextChannel} DiscordTextChannel
 * @typedef {import('pg').Pool} Pool
 */

const SPOTIFY_CLIENT_ID = process.env['SPOTIFY_CLIENT_ID'];
const SPOTIFY_CLIENT_SECRET = process.env['SPOTIFY_CLIENT_SECRET'];
const SPOTIFY_REDIRECT_URI =
    process.env['CALLBACK_HOST'] + process.env['SPOTIFY_CALLBACK_PATH'];

/**
 * Prompts the user to confirm or cancel an action.
 * @param {DiscordTextChannel} channel The channel where the message should be
 * sent
 * @param {DiscordUser} user The Discord user who has to react to the message
 * @param {string} text The text that should be the content of the message
 * @return {Promise<boolean>} Whether or not the user confirmed
 */
export async function getConfirmation(channel, user, text) {
  const message = await channel.send(text);

  // Immediately add a cancellation "button"
  message.react('🛑');
  setTimeout(() => {
    // After a delay, add a confirmation "button"
    message.react('✅');
  }, 2000);

  const filter = (reaction, reactor) =>
    (reaction.emoji.name === '🛑' || reaction.emoji.name === '✅') &&
    reactor.id === user.id;
  const collected = await message.awaitReactions(filter, {time: 10000, max: 1});

  await message.delete();
  return collected.first().emoji.name === '✅';
}

/**
 * Generates/retrieves (and potentially refreshes) a Discord user's Spotify
 * access token using Spotify's authorization code flow.
 * https://developer.spotify.com/documentation/general/guides/authorization-guide/#authorization-code-flow
 * @param {DiscordUser} user The Discord user whose token is needed
 * @param {Pool} postgres The Postgres pool to use for retrieving or updating
 * the user's token set
 * @return {?string} The Spotify access token for the given user, or null if
 * none was able to be procured
 */
export async function getSpotifyAccessToken(user, postgres) {
  // Check the database for an existing token set
  const dbTokenResponse = await postgres.query(`
      select
        spotify_access_token,
        spotify_refresh_token,
        spotify_token_expiration
      from "MoshpitUser"
      where discord_user_id = '${user.id}'
        and spotify_access_token is not null
        and spotify_refresh_token is not null
        and spotify_token_expiration is not null;
  `);

  if (dbTokenResponse.rowCount > 0) {
    // There is an existing token set
    const accessToken = dbTokenResponse.rows[0].spotify_access_token;
    const refreshToken = dbTokenResponse.rows[0].spotify_refresh_token;
    const expiration = dbTokenResponse.rows[0].spotify_token_expiration;

    if (Date.now() < expiration) {
      // The existing access is still valid; just return it
      console.verbose(`Reusing Spotify access token for user ${user}`);
      return accessToken;
    } else {
      // The existing access token is expired; refresh it

      try {
        // Exchange the refresh token for a new access token
        const refreshResponse = await axios.post(
            'https://accounts.spotify.com/api/token',
            qs.stringify({
              'client_id': SPOTIFY_CLIENT_ID,
              'client_secret': SPOTIFY_CLIENT_SECRET,
              'grant_type': 'refresh_token',
              'refresh_token': refreshToken,
            }),
        );

        // Save the new access token and expiration timestamp in the database
        const expiration =
            Math.floor(Date.now() / 1000 + refreshResponse.data.expires_in);
        await postgres.query(`
            update "MoshpitUser"
            set
              spotify_access_token = '${refreshResponse.data.access_token}',
              spotify_token_expiration = to_timestamp(${expiration})
            where discord_user_id = '${user.id}';
        `);

        return refreshResponse.data.access_token;
      } catch (error) {
        console.info(`Failed to refresh Spotify for Discord user ${user}`);
        const dm = await user.createDM();
        await dm.send('Failed to refresh your Spotify account connection. ' +
                      'Try again or contact a developer.');
        return null;
      }
    }
  } else {
    // There is no existing token set; begin a new auth flow
    console.verbose(`Performing Spotify auth flow for user ${user}`);

    const dm = await user.createDM();
    dm.send('Looks like you haven\'t connected Spotify yet!');

    // List the permissions we'll need to have for this user
    // https://developer.spotify.com/documentation/general/guides/scopes/
    const scopes = [
      'user-read-email',
      'user-modify-playback-state',
    ];

    // Each code flow needs a unique state so we can identify responses
    const authCodeState = sha256(user.id + Date.now());

    // Build the auth flow URL for this state
    const codeUrl = new URL('https://accounts.spotify.com/authorize/');
    codeUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    codeUrl.searchParams.set('response_type', 'code');
    codeUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    codeUrl.searchParams.set('scope', scopes.join(' '));
    codeUrl.searchParams.set('state', authCodeState);

    // Send the user a link to click to begin the auth flow
    await dm.send(`Please click this link and authorize moshpit to use your ` +
                  `Spotify account within one minute to continue:\n${codeUrl}`);

    try {
      // Get the authorization code for this user
      const authCode = await Callback.getSpotifyAuthCode(authCodeState, 60000);
      console.verbose(`Received Spotify auth code for user ${user}`);

      // Exchange the authorization code for access and refresh tokens
      const authResponse = await axios.post(
          'https://accounts.spotify.com/api/token',
          qs.stringify({
            'client_id': SPOTIFY_CLIENT_ID,
            'client_secret': SPOTIFY_CLIENT_SECRET,
            'grant_type': 'authorization_code',
            'code': authCode,
            'redirect_uri': SPOTIFY_REDIRECT_URI,
          }),
      );
      console.verbose(`Received Spotify token set for user ${user}`);

      // Save the tokens and expiration timestamp in the database
      const expiration =
          Math.floor(Date.now() / 1000 + authResponse.data.expires_in);
      await postgres.query(`
          insert into "MoshpitUser" (
            discord_user_id,
            spotify_access_token,
            spotify_refresh_token,
            spotify_token_expiration
          )
          values (
            '${user.id}',
            '${authResponse.data.access_token}',
            '${authResponse.data.refresh_token}',
            to_timestamp(${expiration})
          )
          on conflict (discord_user_id) do update set
            spotify_access_token = excluded.spotify_access_token,
            spotify_refresh_token = excluded.spotify_refresh_token,
            spotify_token_expiration = excluded.spotify_token_expiration;
      `);

      dm.send('Your Spotify account is now connected to moshpit.');

      return authResponse.data.access_token;
    } catch (error) {
      console.info(`Failed to authorize Spotify for Discord user ${user}`);
      await dm.send('Failed to connect your Spotify account. Try again or ' +
                    'contact a developer.');
      return null;
    }
  }
}
