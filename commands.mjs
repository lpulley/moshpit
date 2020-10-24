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
