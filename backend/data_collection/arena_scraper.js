require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); // Not directly used for file writes, but path is.
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

// --- API Key Validation ---
if (!RIOT_API_KEY) {
    console.error('Error: RIOT_API_KEY not found in .env');
    process.exit(1);
}
if (!RIOT_API_KEY.startsWith('RGAPI-')) {
    console.error('Error: API key should start with "RGAPI-"');
    process.exit(1);
}

// --- Express Middleware ---
app.use(cors());
app.use(express.json());

// --- Rate Limiting ---
const apiLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', apiLimiter);

// --- Constants ---
const ARENA_QUEUE_ID = 1700;

// --- Global Maps for Item and Augment Names ---
let itemNamesMap = {};
let augmentNamesMap = {};
let latestDDragonVersion = 'loading...'; // Will be updated dynamically

// --- Utility Functions ---

/**
 * Adds a delay for asynchronous operations.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>} A promise that resolves after the specified delay.
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validates the format of a PUUID.
 * @param {string} puuid - The PUUID to validate.
 * @returns {boolean} True if the PUUID is valid, false otherwise.
 */
const isValidPuuid = (puuid) => {
    return typeof puuid === 'string' && puuid.length > 0 && puuid.length <= 100;
};

/**
 * Gets a PUUID from a Riot ID (gameName#tagLine).
 * @param {string} gameName - The game name part of the Riot ID.
 * @param {string} tagLine - The tag line part of the Riot ID.
 * @param {string} accountRegion - The regional routing value for the Account-V1 endpoint (e.g., 'americas', 'europe', 'asia').
 * @returns {Promise<string>} The PUUID associated with the Riot ID.
 * @throws {Error} If the API call fails or the Riot ID is not found.
 */
const getPuuidFromRiotId = async (gameName, tagLine, accountRegion = 'americas') => {
    const accountUrl = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await makeRiotApiCall(accountUrl);
    return response.data.puuid;
};

/**
 * Gets a PUUID from a legacy summoner name. (For backward compatibility)
 * @param {string} summonerName - The summoner name.
 * @param {string} region - The region for the Summoner-V4 endpoint (e.g., 'na1', 'euw1').
 * @returns {Promise<string>} The PUUID associated with the summoner name.
 * @throws {Error} If the API call fails or the summoner is not found.
 */
const getPuuidFromSummoner = async (summonerName, region = 'na1') => {
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
    const response = await makeRiotApiCall(summonerUrl);
    return response.data.puuid;
};

/**
 * Makes an API call to Riot Games, with retry logic for transient errors.
 * @param {string} url - The URL to call.
 * @param {number} retries - Number of retries before giving up.
 * @param {number} delayMs - Initial delay in milliseconds for exponential backoff.
 * @returns {Promise<object>} The Axios response object.
 * @throws {Error} If the API call fails after all retries or for unretriable status codes.
 */
const makeRiotApiCall = async (url, retries = 3, delayMs = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'X-Riot-Token': RIOT_API_KEY,
                    'User-Agent': 'Mozilla/5.0 (compatible; LoLArena/1.0)'
                },
                timeout: 10000 // 10 second timeout
            });
            return response;
        } catch (error) {
            console.error(`API call failed (attempt ${i + 1}/${retries}):`, error.response?.status, url);

            // Don't retry on 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found)
            if (error.response?.status && [400, 401, 403, 404].includes(error.response.status)) {
                throw error;
            }

            // If this is the last retry, throw the error
            if (i === retries - 1) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            await delay(delayMs * Math.pow(2, i));
        }
    }
};

// --- Load Static Data Function ---

/**
 * Loads static data for item and augment names from Data Dragon and Community Dragon.
 * Populates `itemNamesMap` and `augmentNamesMap` for efficient lookups.
 */
async function loadStaticData() {
    console.log('Loading static data for items and augments...');
    try {
        // 1. Get latest Data Dragon version
        const versionsResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        latestDDragonVersion = versionsResponse.data[0];
        console.log(`Latest Data Dragon version: ${latestDDragonVersion}`);

        // 2. Load Item Data from Data Dragon
        const itemUrl = `https://ddragon.leagueoflegends.com/cdn/${latestDDragonVersion}/data/en_US/item.json`;
        const itemResponse = await axios.get(itemUrl);
        const items = itemResponse.data.data;
        for (const itemId in items) {
            itemNamesMap[itemId] = items[itemId].name;
        }
        console.log(`Loaded ${Object.keys(itemNamesMap).length} item names.`);

        // 3. Load Augment Data from Community Dragon Arena
        const arenaAugmentUrl = 'https://raw.communitydragon.org/latest/cdragon/arena/en_us.json';
        const augmentResponse = await axios.get(arenaAugmentUrl);

        // --- NEW DEBUG LOGS FOR AUGMENT DATA FETCH ---
        console.log(`Augment data response status: ${augmentResponse.status}`);
        console.log(`Type of augmentResponse.data: ${typeof augmentResponse.data}`);
        // Log a snippet of the data to see its format
        if (typeof augmentResponse.data === 'string') {
            console.log(`Snippet of augmentResponse.data (string): ${augmentResponse.data.substring(0, 500)}`); // Show first 500 chars
        } else {
            // For non-string data (objects, arrays), stringify it for logging
            console.log(`Snippet of augmentResponse.data (non-string): ${JSON.stringify(augmentResponse.data).substring(0, 500)}`); // Show first 500 chars
        }
        // --- END NEW DEBUG LOGS ---

        const augments = augmentResponse.data.augments; // This is the variable causing the 'not iterable' error

        // Clear the map before repopulating to avoid stale data from previous runs
        augmentNamesMap = {};

        console.log(`Starting to process ${augments.length} augments from Community Dragon.`);

        for (const augment of augments) { // This is where "augments is not iterable" happens
            // New Log: Check for problematic IDs as they are processed
            if (augment.id === 238 || augment.id === 206 || augment.id === 125) {
                console.log(`  Processing problematic augment ID: ${augment.id}, name: "${augment.name}", apiName: "${augment.apiName}"`);
                console.log(`  Value of augment.id !== undefined: ${augment.id !== undefined}`);
                console.log(`  Value of augment.name: ${augment.name}`);
                console.log(`  Value of augment.apiName: ${augment.apiName}`);
            }

            if (augment.name) {
                // Always add the numerical ID as a string key
                if (augment.id !== undefined) {
                    augmentNamesMap[String(augment.id)] = augment.name;
                    // New Log: Confirm what was just added for problematic IDs
                    if (augment.id === 238 || augment.id === 206 || augment.id === 125) {
                        console.log(`  Augment ${augment.id} mapped as String: '${augmentNamesMap[String(augment.id)]}'`);
                    }
                }
                // Also add the apiName as a string key if it exists, as a fallback/alternative lookup
                if (augment.apiName) {
                    augmentNamesMap[augment.apiName] = augment.name;
                    // New Log: Confirm what was just added for problematic IDs
                    if (augment.id === 238 || augment.id === 206 || augment.id === 125) {
                        console.log(`  Augment ${augment.apiName} mapped directly: '${augmentNamesMap[augment.apiName]}'`);
                    }
                }
            }
        }
        console.log(`Finished processing augments.`);
        console.log(`Loaded ${Object.keys(augmentNamesMap).length} augment names.`);

        // Original debug checks (keep these, they are useful!)
        console.log(`Debug Check: augmentNamesMap["238"] is:`, augmentNamesMap["238"]);
        console.log(`Debug Check: augmentNamesMap["206"] is:`, augmentNamesMap["206"]);
        console.log(`Debug Check: augmentNamesMap["125"] is:`, augmentNamesMap["125"]);
        console.log(`Debug Check: augmentNamesMap["TransmutePrismatic"] is:`, augmentNamesMap["TransmutePrismatic"]); // Check apiName too
        console.log(`Debug Check: augmentNamesMap["ChainLightning"] is:`, augmentNamesMap["ChainLightning"]); // Known good one

    } catch (error) {
        console.error('Failed to load static data:', error.message);
        console.error('Item/Augment names will not be available. Please check network or data sources.');
        // Re-throw to ensure the server doesn't start with incomplete data if this is critical
        // throw error; // Uncomment this if you want the server to fail startup on this error
    }
}

// --- API Endpoints ---

/**
 * Endpoint to get ARENA matches for a given PUUID (JSON output).
 * Supports fetching up to 50 matches.
 * @route GET /api/arena/matches/:puuid
 * @param {string} req.params.puuid - The player's PUUID.
 * @param {number} [req.query.count=20] - Number of matches to fetch (max 50).
 */
app.get('/api/arena/matches/:puuid', async (req, res) => {
    try {
        const { puuid } = req.params;

        if (!isValidPuuid(puuid)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid PUUID format'
            });
        }

        const count = Math.min(parseInt(req.query.count) || 20, 50);

        const matchRegion = 'americas'; // Match-V5 endpoint uses regional routing (americas, europe, asia)
        const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

        console.log(`Fetching match IDs for PUUID: ${puuid.substring(0, 8)}...`);
        const matchResponse = await makeRiotApiCall(matchUrl);
        const matchIds = matchResponse.data;

        if (matchIds.length === 0) {
            return res.json({
                success: true,
                matches: [],
                message: 'No Arena matches found for this player'
            });
        }

        console.log(`Found ${matchIds.length} Arena matches, fetching details...`);

        const matchPromises = matchIds.map(async (matchId, index) => {
            await delay(index * 120); // Add delay between requests to respect rate limits (120ms between calls for 50 requests/min limit)

            try {
                const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
                const matchDetailResponse = await makeRiotApiCall(matchDetailUrl);
                const match = matchDetailResponse.data;

                if (match.info.queueId !== ARENA_QUEUE_ID) {
                    console.warn(`Match ${matchId} is not an Arena match (queue: ${match.info.queueId})`);
                    return null;
                }

                const playerData = match.info.participants.find(p => p.puuid === puuid);
                if (!playerData) {
                    console.warn(`Player not found in match ${matchId}`);
                    return null;
                }

                // Map item IDs to names
                const itemNames = [
                    playerData.item0, playerData.item1, playerData.item2,
                    playerData.item3, playerData.item4, playerData.item5, playerData.item6
                ]
                .filter(item => item !== 0)
                .map(item_id => itemNamesMap[String(item_id)] || `Unknown Item (${item_id})`); // Convert ID to string for lookup

                // Map augment IDs to names
                const rawAugmentIds = [
                    playerData.playerAugment1,
                    playerData.playerAugment2,
                    playerData.playerAugment3,
                    playerData.playerAugment4
                ].filter(augment => augment && augment !== 0);

                const augmentNames = rawAugmentIds
                    .map(augment_id => {
                        console.log(`Processing augment_id: ${augment_id} (Type: ${typeof augment_id}) in Match ${matchId}`);
                        let name = augmentNamesMap[String(augment_id)]; // Try lookup with string-converted ID
                        if (!name) {
                            name = augmentNamesMap[augment_id]; // Try lookup with original ID (for apiName strings)
                        }
                        return name || `Unknown Augment (${augment_id})`;
                    });

                // Extract Arena-specific player data
                return {
                    matchId,
                    gameCreation: match.info.gameCreation,
                    gameDuration: match.info.gameDuration,
                    player: {
                        championName: playerData.championName,
                        items: itemNames,
                        augments: augmentNames
                    }
                };
            } catch (error) {
                console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
                return null;
            }
        });

        const matches = await Promise.all(matchPromises);
        const validMatches = matches.filter(m => m !== null);

        console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches`);

        res.json({
            success: true,
            matches: validMatches,
            totalArenaMatches: validMatches.length
        });

    } catch (error) {
        console.error('Error in /api/arena/matches/:puuid:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to get Arena match history'
        });
    }
});

/**
 * Endpoint to export ARENA matches for a given PUUID to CSV.
 * Supports fetching up to 100 matches.
 * @route GET /api/arena/matches/:puuid/csv
 * @param {string} req.params.puuid - The player's PUUID.
 * @param {number} [req.query.count=50] - Number of matches to fetch (max 100).
 * @param {string} [req.query.filename] - Optional filename for the CSV.
 */
app.get('/api/arena/matches/:puuid/csv', async (req, res) => {
    try {
        const { puuid } = req.params;

        if (!isValidPuuid(puuid)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid PUUID format'
            });
        }

        const count = Math.min(parseInt(req.query.count) || 50, 100);
        const filename = req.query.filename || `arena_matches_${puuid.substring(0, 8)}_${Date.now()}.csv`;
        const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_'); // Sanitize filename

        const matchRegion = 'americas';
        const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

        console.log(`Fetching match IDs for CSV export: ${puuid.substring(0, 8)}...`);
        const matchResponse = await makeRiotApiCall(matchUrl);
        const matchIds = matchResponse.data;

        if (matchIds.length === 0) {
            return res.status(404).json({ // Changed to 404 for clarity
                success: false,
                message: 'No Arena matches found for this player',
                csvGenerated: false
            });
        }

        console.log(`Found ${matchIds.length} Arena matches for CSV export, fetching details...`);

        const matchPromises = matchIds.map(async (matchId, index) => {
            await delay(index * 120); // Add delay between requests

            try {
                const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
                const matchDetailResponse = await makeRiotApiCall(matchDetailUrl);
                const match = matchDetailResponse.data;

                if (match.info.queueId !== ARENA_QUEUE_ID) {
                    console.warn(`Match ${matchId} is not an Arena match (queue: ${match.info.queueId})`);
                    return null;
                }

                const playerData = match.info.participants.find(p => p.puuid === puuid);
                if (!playerData) {
                    console.warn(`Player not found in match ${matchId}`);
                    return null;
                }

                // Map item IDs to names
                const itemNames = [
                    playerData.item0, playerData.item1, playerData.item2,
                    playerData.item3, playerData.item4, playerData.item5, playerData.item6
                ]
                .filter(item => item !== 0)
                .map(item_id => itemNamesMap[String(item_id)] || `Unknown Item (${item_id})`);

                // Map augment IDs to names
                const rawAugmentIds = [
                    playerData.playerAugment1,
                    playerData.playerAugment2,
                    playerData.playerAugment3,
                    playerData.playerAugment4
                ].filter(augment => augment && augment !== 0);

                const augmentNames = rawAugmentIds
                    .map(augment_id => {
                        console.log(`Processing augment_id: ${augment_id} (Type: ${typeof augment_id}) in Match ${matchId} (CSV)`);
                        let name = augmentNamesMap[String(augment_id)];
                        if (!name) {
                            name = augmentNamesMap[augment_id];
                        }
                        return name || `Unknown Augment (${augment_id})`;
                    });

                return {
                    matchId,
                    gameCreation: match.info.gameCreation,
                    gameDuration: match.info.gameDuration,
                    championName: playerData.championName,
                    items: itemNames,
                    augments: augmentNames
                };
            } catch (error) {
                console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
                return null;
            }
        });

        const matches = await Promise.all(matchPromises);
        const validMatches = matches.filter(m => m !== null);

        console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches for CSV`);

        // Convert matches to CSV string
        const csvHeaders = ['matchId', 'gameCreation', 'gameDuration', 'championName', 'items', 'augments'];
        const csvRows = validMatches.map(match => {
            return [
                match.matchId,
                new Date(match.gameCreation).toISOString(),
                Math.round(match.gameDuration / 60), // Duration in minutes
                match.championName,
                `"${match.items.join(';')}"`,    // Join names with semicolon, quote the string
                `"${match.augments.join(';')}"` // Join names with semicolon, quote the string
            ].join(',');
        });

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

        console.log(`Generated CSV with ${validMatches.length} matches`);

        // Set headers to trigger file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csvContent));

        // Send the CSV content directly as response
        res.send(csvContent);

    } catch (error) {
        console.error('Error in /api/arena/matches/:puuid/csv:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            csvGenerated: false,
            error: error.response?.data?.message || 'Failed to export Arena matches to CSV'
        });
    }
});

// DEBUG ENDPOINT: Test API key with Riot ID and get match data (JSON)
app.get('/api/arena/riot-id/:gameName/:tagLine', async (req, res) => {
    try {
        const { gameName, tagLine } = req.params;
        const accountRegion = req.query.accountRegion || 'americas';
        const count = Math.min(parseInt(req.query.count) || 20, 50);

        console.log(`Looking up Riot ID: ${gameName}#${tagLine} in region: ${accountRegion}`);

        let puuid;
        try {
            puuid = await getPuuidFromRiotId(gameName, tagLine, accountRegion);
            console.log(`Found PUUID for ${gameName}#${tagLine}: ${puuid.substring(0, 8)}...`);
        } catch (error) {
            if (error.response?.status === 404) {
                return res.status(404).json({
                    success: false,
                    error: `Riot ID "${gameName}#${tagLine}" not found in region "${accountRegion}"`
                });
            }
            throw error;
        }

        const matchRegion = 'americas';
        const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

        console.log(`Fetching Arena matches for ${gameName}#${tagLine}...`);
        const matchResponse = await makeRiotApiCall(matchUrl);
        const matchIds = matchResponse.data;

        if (matchIds.length === 0) {
            return res.json({
                success: true,
                matches: [],
                message: `No Arena matches found for ${gameName}#${tagLine}`
            });
        }

        console.log(`Found ${matchIds.length} Arena matches for ${gameName}#${tagLine}, fetching details...`);

        const matchPromises = matchIds.map(async (matchId, index) => {
            await delay(index * 120);

            try {
                const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
                const matchDetailResponse = await makeRiotApiCall(matchDetailUrl);
                const match = matchDetailResponse.data;

                if (match.info.queueId !== ARENA_QUEUE_ID) {
                    console.warn(`Match ${matchId} is not an Arena match (queue: ${match.info.queueId})`);
                    return null;
                }

                const playerData = match.info.participants.find(p => p.puuid === puuid);
                if (!playerData) {
                    console.warn(`Player not found in match ${matchId}`);
                    return null;
                }

                // Map item IDs to names
                const itemNames = [
                    playerData.item0, playerData.item1, playerData.item2,
                    playerData.item3, playerData.item4, playerData.item5, playerData.item6
                ]
                .filter(item => item !== 0)
                .map(item_id => itemNamesMap[String(item_id)] || `Unknown Item (${item_id})`);

                // Map augment IDs to names
                const rawAugmentIds = [
                    playerData.playerAugment1,
                    playerData.playerAugment2,
                    playerData.playerAugment3,
                    playerData.playerAugment4
                ].filter(augment => augment && augment !== 0);

                const augmentNames = rawAugmentIds
                    .map(augment_id => {
                        console.log(`Processing augment_id: ${augment_id} (Type: ${typeof augment_id}) in Match ${matchId} (JSON)`);
                        let name = augmentNamesMap[String(augment_id)];
                        if (!name) {
                            name = augmentNamesMap[augment_id];
                        }
                        return name || `Unknown Augment (${augment_id})`;
                    });

                return {
                    matchId,
                    gameCreation: match.info.gameCreation,
                    gameDuration: match.info.gameDuration,
                    player: {
                        championName: playerData.championName,
                        items: itemNames,
                        augments: augmentNames
                    }
                };
            } catch (error) {
                console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
                return null;
            }
        });

        const matches = await Promise.all(matchPromises);
        const validMatches = matches.filter(m => m !== null);

        console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches for ${gameName}#${tagLine}`);

        res.json({
            success: true,
            riotId: `${gameName}#${tagLine}`,
            puuid: puuid,
            matches: validMatches,
            totalArenaMatches: validMatches.length
        });

    } catch (error) {
        console.error(`Error in /api/arena/riot-id/${req.params.gameName}/${req.params.tagLine}:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to get Arena match history'
        });
    }
});

/**
 * NEW ENDPOINT: Get CSV by Riot ID (gameName#tagLine)
 * This is the recommended way to fetch and export data.
 * @route GET /api/arena/riot-id/:gameName/:tagLine/csv
 * @param {string} req.params.gameName - The game name part of the Riot ID.
 * @param {string} req.params.tagLine - The tag line part of the Riot ID.
 * @param {string} [req.query.accountRegion='americas'] - The regional routing for Riot Account API.
 * @param {number} [req.query.count=50] - Number of matches to fetch (max 100).
 * @param {string} [req.query.filename] - Optional filename for the CSV.
 */
app.get('/api/arena/riot-id/:gameName/:tagLine/csv', async (req, res) => {
    try {
        const { gameName, tagLine } = req.params;
        const accountRegion = req.query.accountRegion || 'americas';
        const count = Math.min(parseInt(req.query.count) || 50, 100);
        const filename = req.query.filename || `arena_${gameName}_${tagLine}_${Date.now()}.csv`;

        console.log(`Looking up Riot ID: ${gameName}#${tagLine} in region: ${accountRegion}`);

        let puuid;
        try {
            puuid = await getPuuidFromRiotId(gameName, tagLine, accountRegion);
            console.log(`Found PUUID for ${gameName}#${tagLine}: ${puuid.substring(0, 8)}...`);
        } catch (error) {
            if (error.response?.status === 404) {
                return res.status(404).json({
                    success: false,
                    error: `Riot ID "${gameName}#${tagLine}" not found in region "${accountRegion}"`
                });
            }
            throw error;
        }

        const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

        const matchRegion = 'americas';
        const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

        console.log(`Fetching Arena matches for ${gameName}#${tagLine}...`);
        const matchResponse = await makeRiotApiCall(matchUrl);
        const matchIds = matchResponse.data;

        if (matchIds.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No Arena matches found for ${gameName}#${tagLine}`
            });
        }

        console.log(`Found ${matchIds.length} Arena matches for ${gameName}#${tagLine}, fetching details...`);

        const matchPromises = matchIds.map(async (matchId, index) => {
            await delay(index * 120);

            try {
                const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
                const matchDetailResponse = await makeRiotApiCall(matchDetailUrl);
                const match = matchDetailResponse.data;

                if (match.info.queueId !== ARENA_QUEUE_ID) return null;

                const playerData = match.info.participants.find(p => p.puuid === puuid);
                if (!playerData) return null;

                // Map item IDs to names
                const itemNames = [
                    playerData.item0, playerData.item1, playerData.item2,
                    playerData.item3, playerData.item4, playerData.item5, playerData.item6
                ]
                .filter(item => item !== 0)
                .map(item_id => itemNamesMap[String(item_id)] || `Unknown Item (${item_id})`);

                // Map augment IDs to names
                const rawAugmentIds = [
                    playerData.playerAugment1,
                    playerData.playerAugment2,
                    playerData.playerAugment3,
                    playerData.playerAugment4
                ].filter(augment => augment && augment !== 0);

                const augmentNames = rawAugmentIds
                    .map(augment_id => {
                        console.log(`Processing augment_id: ${augment_id} (Type: ${typeof augment_id}) in Match ${matchId} (Riot ID CSV)`);
                        let name = augmentNamesMap[String(augment_id)];
                        if (!name) {
                            name = augmentNamesMap[augment_id];
                        }
                        return name || `Unknown Augment (${augment_id})`;
                    });

                return {
                    matchId,
                    gameCreation: match.info.gameCreation,
                    gameDuration: match.info.gameDuration,
                    championName: playerData.championName,
                    items: itemNames,
                    augments: augmentNames
                };
            } catch (error) {
                console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
                return null;
            }
        });

        const matches = await Promise.all(matchPromises);
        const validMatches = matches.filter(m => m !== null);

        console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches for ${gameName}#${tagLine}`);

        // Convert matches to CSV string
        const csvHeaders = ['matchId', 'gameCreation', 'gameDuration', 'championName', 'items', 'augments'];
        const csvRows = validMatches.map(match => {
            return [
                match.matchId,
                new Date(match.gameCreation).toISOString(),
                Math.round(match.gameDuration / 60),
                match.championName,
                `"${match.items.join(';')}"`,
                `"${match.augments.join(';')}"`
            ].join(',');
        });

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

        console.log(`Generated CSV with ${validMatches.length} matches for ${gameName}#${tagLine}`);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csvContent));

        res.send(csvContent);

    } catch (error) {
        console.error(`Error in /api/arena/riot-id/${req.params.gameName}/${req.params.tagLine}/csv:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to export Arena matches to CSV'
        });
    }
});

/**
 * OLD ENDPOINT: Get CSV by summoner name (keeping for backwards compatibility)
 * Consider deprecating this as Riot is moving to Riot ID for lookup.
 */
app.get('/api/arena/summoner/:summonerName/csv', async (req, res) => {
    try {
        const { summonerName } = req.params;
        const region = req.query.region || 'na1';
        const count = Math.min(parseInt(req.query.count) || 50, 100);
        const filename = req.query.filename || `arena_matches_${summonerName}_${Date.now()}.csv`;

        console.log(`Looking up Summoner: ${summonerName} in region: ${region}`);

        let puuid;
        try {
            puuid = await getPuuidFromSummoner(summonerName, region);
            console.log(`Found PUUID for ${summonerName}: ${puuid.substring(0, 8)}...`);
        } catch (error) {
            if (error.response?.status === 404) {
                return res.status(404).json({
                    success: false,
                    error: `Summoner "${summonerName}" not found in region "${region}"`
                });
            }
            throw error;
        }

        const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

        const matchRegion = 'americas';
        const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

        console.log(`Fetching Arena matches for ${summonerName}...`);
        const matchResponse = await makeRiotApiCall(matchUrl);
        const matchIds = matchResponse.data;

        if (matchIds.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No Arena matches found for ${summonerName}`
            });
        }

        console.log(`Found ${matchIds.length} Arena matches for ${summonerName}, fetching details...`);

        const matchPromises = matchIds.map(async (matchId, index) => {
            await delay(index * 120);

            try {
                const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
                const matchDetailResponse = await makeRiotApiCall(matchDetailUrl);
                const match = matchDetailResponse.data;

                if (match.info.queueId !== ARENA_QUEUE_ID) return null;

                const playerData = match.info.participants.find(p => p.puuid === puuid);
                if (!playerData) return null;

                const itemNames = [
                    playerData.item0, playerData.item1, playerData.item2,
                    playerData.item3, playerData.item4, playerData.item5, playerData.item6
                ]
                .filter(item => item !== 0)
                .map(item_id => itemNamesMap[String(item_id)] || `Unknown Item (${item_id})`);

                const rawAugmentIds = [
                    playerData.playerAugment1,
                    playerData.playerAugment2,
                    playerData.playerAugment3,
                    playerData.playerAugment4
                ].filter(augment => augment && augment !== 0);

                const augmentNames = rawAugmentIds
                    .map(augment_id => {
                        console.log(`Processing augment_id: ${augment_id} (Type: ${typeof augment_id}) in Match ${matchId} (Summoner CSV)`);
                        let name = augmentNamesMap[String(augment_id)];
                        if (!name) {
                            name = augmentNamesMap[augment_id];
                        }
                        return name || `Unknown Augment (${augment_id})`;
                    });

                return {
                    matchId,
                    gameCreation: match.info.gameCreation,
                    gameduration: match.info.gameDuration,
                    championName: playerData.championName,
                    items: itemNames,
                    augments: augmentNames
                };
            } catch (error) {
                console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
                return null;
            }
        });

        const matches = await Promise.all(matchPromises);
        const validMatches = matches.filter(m => m !== null);

        console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches for ${summonerName}`);

        const csvHeaders = ['matchId', 'gameCreation', 'gameDuration', 'championName', 'items', 'augments'];
        const csvRows = validMatches.map(match => {
            return [
                match.matchId,
                new Date(match.gameCreation).toISOString(),
                Math.round(match.gameDuration / 60),
                match.championName,
                `"${match.items.join(';')}"`,
                `"${match.augments.join(';')}"`
            ].join(',');
        });

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

        console.log(`Generated CSV with ${validMatches.length} matches for ${summonerName}`);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csvContent));

        res.send(csvContent);

    } catch (error) {
        console.error(`Error in /api/arena/summoner/${req.params.summonerName}/csv:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.message || 'Failed to export Arena matches to CSV'
        });
    }
});


// --- Server Startup ---
(async () => {
    await loadStaticData(); // Load data before starting the server
    console.log(`Debug Check: augmentNamesMap["238"] is:`, augmentNamesMap["238"]);
    console.log(`Debug Check: augmentNamesMap["206"] is:`, augmentNamesMap["206"]);
    console.log(`Debug Check: augmentNamesMap["125"] is:`, augmentNamesMap["125"]);
    console.log(`Debug Check: augmentNamesMap["TransmutePrismatic"] is:`, augmentNamesMap["TransmutePrismatic"]);
    console.log(`Debug Check: augmentNamesMap["ChainLightning"] is:`, augmentNamesMap["ChainLightning"]);
    app.listen(port, () => {
        console.log(`LoL Arena Data Collector running on http://localhost:${port}`);
        console.log('Endpoints:');
        console.log(`GET /api/arena/matches/:puuid - get Arena matches (JSON)`);
        console.log(`GET /api/arena/matches/:puuid/csv - export Arena matches to CSV`);
        console.log(`GET /api/arena/riot-id/:gameName/:tagLine/csv - export Arena matches by Riot ID (RECOMMENDED!)`);
        console.log(`GET /api/arena/summoner/:summonerName/csv - export Arena matches by summoner name (LEGACY)`);
        console.log('');
        console.log('Examples:');
        console.log('   http://localhost:3001/api/arena/riot-id/Faker/T1');
        console.log('   http://localhost:3001/api/arena/riot-id/anndrewkimm/9165/csv');
        console.log('   http://localhost:3001/api/test/summoner/RiotSchmick (test API key)');
        console.log('');
        console.log('Rate limiting: 50 requests per 2 minutes per IP');
        console.log('API calls have 120ms delays to respect Riot rate limits');
        console.log(`Current Data Dragon Version: ${latestDDragonVersion}`);
    });
})();