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

  const spotifyAccessToken = await Utilities.getUserSpotifyToken(
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
