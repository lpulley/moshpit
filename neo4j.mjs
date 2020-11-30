import axios from 'axios';
import * as Utilities from './utilities.mjs';

/**
 * @typedef {Object} Context
 * @property {import('discord.js').Message} message
 * @property {[string]} content
 * @property {import('pg').Pool} postgres
 */

/**
 * Exports SQL data to Neo4j.
 * @param {Context} context
 */
export async function SQL_to_Neo4j(context) {
  await context.postgres.query(`
    COPY (SELECT * FROM Moshpit) TO 'csv_files/moshpit.csv' WITH CSV header;
  `);
  await context.postgres.query(`
    COPY (SELECT * FROM MoshpitUser) TO 'csv_files/moshpit_user.csv' WITH CSV header;
  `);
  await context.postgres.query(`
    COPY (SELECT * FROM Moshpit JOIN MoshpitUser ON Moshpit.moshpit_id = MoshpitUser.moshpit_id)
      TO 'csv_files/in.csv' WITH CSV header;
  `);
  await context.postgres.query(`
    COPY (SELECT * FROM Moshpit JOIN MoshpitUser ON Moshpit.owner_discord_id = MoshpitUser.user_discord_id)
      TO 'csv_files/leader.csv' WITH CSV header;
  `);
  await context.neo4j_session.run(`
    LOAD CSV WITH HEADERS FROM 'csv_files/moshpit.csv' AS row
    MERGE (moshpit:Moshpit {moshpit_id: row.moshpit_id})
      ON CREATE SET moshpit.discord_channel_id = row.discord_channel_id;
  `);
  await context.neo4j_session.run(`
    LOAD CSV WITH HEADERS FROM 'csv_files/moshpituser.csv' AS row
    MERGE (user:MoshpitUser {discord_user_id: row.discord_user_id});
  `);
  await context.neo4j_session.run(`
    LOAD CSV WITH HEADERS FROM 'csv_files/in.csv' AS row
    MATCH (moshpit:Moshpit {moshpit_id: row.moshpit_id})
    MATCH (user:MoshpitUser {discord_user_id: row.discord_user_id})
    MERGE (user)-[:IN]->(moshpit);
  `);
  await context.neo4j_session.run(`
    LOAD CSV WITH HEADERS FROM 'csv_files/leader.csv' AS row
    MATCH (moshpit:Moshpit {moshpit_id: row.moshpit_id})
    MATCH (user:MoshpitUser {discord_user_id: row.discord_user_id})
    MERGE (user)-[:LEADS]->(moshpit);
  `);
}

/**
 * Adds track to database.
 * @param {Context} context
 */
export async function add_track(context) {
  // Define a shortcut function to reply in the channel
  const result = await context.neo4j_session.run(`
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
  const result = await context.neo4j_session.run(`
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
  const result = await context.neo4j_session.run(`
    MATCH (m:Moshpit)-[r:PLAYED]->(t:Track)
    WHERE m.moshpit_id = MOSHPIT_ID AND t.spotify_track_id = CURRENT_TRACK_ID
    SET r.score = r.score-1;
  `);
}

/**
 * Gets scores of all listened to tracks.
 */
export async function track_scores(context) {
  // Define a shortcut function to reply in the channel
  const result = await context.neo4j_session.run(`
    MATCH (m:MoshPit)-[r:PLAYED]->(t:Track)
    WHERE m.moshpit_id = MOSHPIT_ID
    RETURN t.spotify_track_id AS track, r.score AS score;
  `);
}
