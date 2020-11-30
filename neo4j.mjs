/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 * @property {import('neo4j-driver').Session} neo4j
 */

/**
 * Exports SQL data to Neo4j.
 * @param {Context} context
 */
export async function sqlToNeo4j(context) {
  await context.postgres.query(`
      COPY (SELECT * FROM "Moshpit")
      TO '${process.env['NEO4J_IMPORT']}/moshpit.csv'
      WITH CSV header;
  `);
  await context.postgres.query(`
      COPY (SELECT * FROM "MoshpitUser")
      TO '${process.env['NEO4J_IMPORT']}/moshpit_user.csv'
      WITH CSV header;
  `);
  await context.postgres.query(`
      COPY (
        SELECT *
        FROM "Moshpit" m JOIN "MoshpitUser" mu
        ON m.moshpit_id = mu.moshpit_id
      )
      TO '${process.env['NEO4J_IMPORT']}/in.csv'
      WITH CSV header;
  `);
  await context.postgres.query(`
      COPY (
        SELECT *
        FROM "Moshpit" m JOIN "MoshpitUser" mu
        ON m.owner_discord_id = mu.discord_user_id
      )
      TO '${process.env['NEO4J_IMPORT']}/leader.csv'
      WITH CSV header;
  `);
  await context.neo4j.run(`
      LOAD CSV WITH HEADERS
      FROM 'file:///moshpit.csv'
      AS row
      MERGE (moshpit:Moshpit {moshpit_id: row.moshpit_id})
  `);
  await context.neo4j.run(`
      LOAD CSV WITH HEADERS
      FROM 'file:///moshpit_user.csv'
      AS row
      MERGE (user:MoshpitUser {discord_user_id: row.discord_user_id});
  `);
  await context.neo4j.run(`
      LOAD CSV WITH HEADERS
      FROM 'file:///in.csv'
      AS row
      MATCH (moshpit:Moshpit {moshpit_id: row.moshpit_id})
      MATCH (user:MoshpitUser {discord_user_id: row.discord_user_id})
      MERGE (user)-[:IN]->(moshpit);
  `);
  await context.neo4j.run(`
      LOAD CSV WITH HEADERS
      FROM 'file:///leader.csv'
      AS row
      MATCH (moshpit:Moshpit {moshpit_id: row.moshpit_id})
      MATCH (user:MoshpitUser {discord_user_id: row.discord_user_id})
      MERGE (user)-[:LEADS]->(moshpit);
  `);
}

/**
 * Adds track to database.
 * @param {Context} context
 */
export async function addTrack(context) {
  // Define a shortcut function to reply in the channel
  await context.neo4j.run(`
      MERGE (t:TRACK {spotify_track_id: CURRENT_TRACK_ID})
      MERGE (m:Moshpit {moshpit_id: MOSHPIT_ID})-[r:PLAYED]->(t)
        ON CREATE SET r.score = 0;
  `);
}

/**
 * Likes current track.
 * @param {Context} context
 */
export async function like(context) {
  // Define a shortcut function to reply in the channel
  await context.neo4j.run(`
      MATCH (m:Moshpit)-[r:PLAYED]->(t:Track)
      WHERE m.moshpit_id = MOSHPIT_ID AND t.spotify_track_id = CURRENT_TRACK_ID
      SET r.score = r.score+1;
  `);
}

/**
 * Dislikes current track.
 * @param {Context} context
 */
export async function dislike(context) {
  // Define a shortcut function to reply in the channel
  await context.neo4j.run(`
      MATCH (m:Moshpit)-[r:PLAYED]->(t:Track)
      WHERE m.moshpit_id = MOSHPIT_ID AND t.spotify_track_id = CURRENT_TRACK_ID
      SET r.score = r.score-1;
  `);
}

/**
 * Gets scores of all listened to tracks.
 * @param {Context} context
 */
export async function getTrackScores(context) {
  // Define a shortcut function to reply in the channel
  await context.neo4j.run(`
      MATCH (m:MoshPit)-[r:PLAYED]->(t:Track)
      WHERE m.moshpit_id = MOSHPIT_ID
      RETURN t.spotify_track_id AS track, r.score AS score;
  `);
}
