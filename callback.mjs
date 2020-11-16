import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const states = {};

app.get(process.env['SPOTIFY_CALLBACK_PATH'], (request, response) => {
  // TODO: Show a nicer page
  response.send('Thanks! You can return to Discord now.');
  if ('state' in request.query &&
      ('code' in request.query || 'error' in request.query)) {
    if (request.query.state in states) {
      const [resolve, reject] = states[request.query.state];
      if ('error' in request.query) {
        reject(new Error(
            'Received error callback from Spotify code authorization' +
            request.query.error,
        ));
      } else {
        // Resolve the state's Promise with the auth code
        resolve(request.query.code);
      }
    } else {
      console.warn(
          'Received unexpected Spotify callback for state',
          request.query.state,
      );
    }
  } else {
    console.warn(
        'Received malformed Spotify authorization code callback',
        request,
    );
  }
});

/**
 * Returns a Spotify auth code for a state if it arrives within the timeout.
 * @param {string} state The state query parameter to filter for
 * @param {number} [timeout] The number of milliseconds to wait before timing
 * out
 * @return {Promise<string>} The Spotify authorization code
 */
export async function getSpotifyAuthCode(state, timeout) {
  return new Promise((resolve, reject) => {
    states[state] = [resolve, reject];
    setTimeout(() => {
      reject(new Error('Timed out waiting for a Spotify callback request'));
    }, timeout);
  });
}

app.listen(process.env['CALLBACK_PORT'], () => {
  console.info('Listening for callbacks.');
});
