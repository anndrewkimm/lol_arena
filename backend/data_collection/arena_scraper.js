require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!RIOT_API_KEY) {
  console.error('Error: RIOT_API_KEY not found in .env');
  process.exit(1);
}
if (!RIOT_API_KEY.startsWith('RGAPI-')) {
  console.error('Error: API key should start with "RGAPI-"');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// Rate limiting to protect against abuse
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

const ARENA_QUEUE_ID = 1700;

// Arena data store to accumulate matches and stats
let arenaDataStore = {
  matches: [],
  championStats: {},
  itemStats: {},
  augmentStats: {},
  lastUpdated: null
};

// Utility function to add delays between API calls
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Utility function to validate PUUID format
const isValidPuuid = (puuid) => {
  return typeof puuid === 'string' && puuid.length > 0 && puuid.length <= 100;
};

// Utility function to get PUUID from Riot ID (gameName#tagLine)
const getPuuidFromRiotId = async (gameName, tagLine, accountRegion = 'americas') => {
  const accountUrl = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const response = await makeRiotApiCall(accountUrl);
  return response.data.puuid;
};

// Legacy function for old summoner names (keeping for backwards compatibility)
const getPuuidFromSummoner = async (summonerName, region = 'na1') => {
  const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
  const response = await makeRiotApiCall(summonerUrl);
  return response.data.puuid;
};

// Utility function to make Riot API calls with retry logic
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
      
      // Don't retry on 400, 401, 403, 404
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

// Endpoint to get ARENA matches (basic JSON)
app.get('/api/arena/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    
    // Validate PUUID
    if (!isValidPuuid(puuid)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PUUID format'
      });
    }
    
    const count = Math.min(parseInt(req.query.count) || 20, 50);

    const matchRegion = 'americas';
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

    // Get detailed match data for each Arena match with delays
    const matchPromises = matchIds.map(async (matchId, index) => {
      // Add delay between requests to respect rate limits (120ms between calls)
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

        // Extract Arena-specific player data
        return {
          matchId,
          gameCreation: match.info.gameCreation,
          gameDuration: match.info.gameDuration,
          player: {
            championName: playerData.championName,
            items: [
              playerData.item0,
              playerData.item1,
              playerData.item2,
              playerData.item3,
              playerData.item4,
              playerData.item5,
              playerData.item6
            ].filter(item => item !== 0),
            augments: [
              playerData.playerAugment1,
              playerData.playerAugment2,
              playerData.playerAugment3,
              playerData.playerAugment4
            ].filter(augment => augment && augment !== 0)
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

// Endpoint to export Arena matches to CSV
app.get('/api/arena/matches/:puuid/csv', async (req, res) => {
  try {
    const { puuid } = req.params;
    
    // Validate PUUID
    if (!isValidPuuid(puuid)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PUUID format'
      });
    }
    
    const count = Math.min(parseInt(req.query.count) || 50, 100);
    const filename = req.query.filename || `arena_matches_${puuid.substring(0, 8)}_${Date.now()}.csv`;

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');

    const matchRegion = 'americas';
    const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${ARENA_QUEUE_ID}&start=0&count=${count}`;

    console.log(`Fetching match IDs for CSV export: ${puuid.substring(0, 8)}...`);
    const matchResponse = await makeRiotApiCall(matchUrl);
    const matchIds = matchResponse.data;

    if (matchIds.length === 0) {
      return res.json({
        success: false,
        message: 'No Arena matches found for this player',
        csvGenerated: false
      });
    }

    console.log(`Found ${matchIds.length} Arena matches for CSV export, fetching details...`);

    const matchPromises = matchIds.map(async (matchId, index) => {
      // Add delay between requests to respect rate limits (120ms between calls)
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

        return {
          matchId,
          gameCreation: match.info.gameCreation,
          gameDuration: match.info.gameDuration,
          championName: playerData.championName,
          items: [
            playerData.item0,
            playerData.item1,
            playerData.item2,
            playerData.item3,
            playerData.item4,
            playerData.item5,
            playerData.item6
          ].filter(item => item !== 0),
          augments: [
            playerData.playerAugment1,
            playerData.playerAugment2,
            playerData.playerAugment3,
            playerData.playerAugment4
          ].filter(augment => augment && augment !== 0)
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
        Math.round(match.gameDuration / 60),
        match.championName,
        `"${match.items.join(';')}"`,
        `"${match.augments.join(';')}"`
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

// DEBUG ENDPOINT: Test API key with Riot ID
app.get('/api/test/riot-id/:gameName/:tagLine', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const accountRegion = req.query.region || 'americas';
    
    console.log('=== DEBUG INFO (RIOT ID) ===');
    console.log('API Key exists:', !!RIOT_API_KEY);
    console.log('API Key starts with RGAPI:', RIOT_API_KEY?.startsWith('RGAPI-'));
    console.log('Game Name:', gameName);
    console.log('Tag Line:', tagLine);
    console.log('Account Region:', accountRegion);
    console.log('=============================');
    
    const puuid = await getPuuidFromRiotId(gameName, tagLine, accountRegion);
    
    res.json({
      success: true,
      puuid: puuid,
      message: 'API key is working with Riot ID!'
    });
    
  } catch (error) {
    console.log('=== ERROR DETAILS ===');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Data:', error.response?.data);
    console.log('=====================');
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

// DEBUG ENDPOINT: Test API key
app.get('/api/test/summoner/:summonerName', async (req, res) => {
  try {
    const { summonerName } = req.params;
    const region = req.query.region || 'na1';
    
    console.log('=== DEBUG INFO ===');
    console.log('API Key exists:', !!RIOT_API_KEY);
    console.log('API Key starts with RGAPI:', RIOT_API_KEY?.startsWith('RGAPI-'));
    console.log('API Key length:', RIOT_API_KEY?.length);
    console.log('Summoner:', summonerName);
    console.log('Region:', region);
    console.log('==================');
    
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
    console.log('Full URL:', summonerUrl);
    
    const response = await makeRiotApiCall(summonerUrl);
    
    res.json({
      success: true,
      summoner: response.data,
      message: 'API key is working!'
    });
    
  } catch (error) {
    console.log('=== ERROR DETAILS ===');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Error Data:', error.response?.data);
    console.log('Headers sent:', error.config?.headers);
    console.log('=====================');
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message,
      debug: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url
      }
    });
  }
});

// NEW ENDPOINT: Get CSV by Riot ID (gameName#tagLine)
app.get('/api/arena/riot-id/:gameName/:tagLine/csv', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const accountRegion = req.query.accountRegion || 'americas';
    const count = Math.min(parseInt(req.query.count) || 50, 100);
    const filename = req.query.filename || `arena_${gameName}_${tagLine}_${Date.now()}.csv`;

    console.log(`Looking up Riot ID: ${gameName}#${tagLine} in region: ${accountRegion}`);
    
    // Get PUUID from Riot ID
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

    // Sanitize filename
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

        return {
          matchId,
          gameCreation: match.info.gameCreation,
          gameDuration: match.info.gameDuration,
          championName: playerData.championName,
          items: [
            playerData.item0,
            playerData.item1,
            playerData.item2,
            playerData.item3,
            playerData.item4,
            playerData.item5,
            playerData.item6
          ].filter(item => item !== 0),
          augments: [
            playerData.playerAugment1,
            playerData.playerAugment2,
            playerData.playerAugment3,
            playerData.playerAugment4
          ].filter(augment => augment && augment !== 0)
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

    // Set headers to trigger file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent));
    
    // Send the CSV content directly as response
    res.send(csvContent);

  } catch (error) {
    console.error(`Error in /api/arena/riot-id/${req.params.gameName}/${req.params.tagLine}/csv:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || 'Failed to export Arena matches to CSV'
    });
  }
});

// OLD ENDPOINT: Get CSV by summoner name (keeping for backwards compatibility)
app.get('/api/arena/summoner/:summonerName/csv', async (req, res) => {
  try {
    const { summonerName } = req.params;
    const region = req.query.region || 'na1';
    const count = Math.min(parseInt(req.query.count) || 50, 100);
    const filename = req.query.filename || `arena_${summonerName}_${Date.now()}.csv`;

    console.log(`Looking up summoner: ${summonerName} in region: ${region}`);
    
    // Get PUUID from summoner name
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

    // Sanitize filename
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

        return {
          matchId,
          gameCreation: match.info.gameCreation,
          gameDuration: match.info.gameDuration,
          championName: playerData.championName,
          items: [
            playerData.item0,
            playerData.item1,
            playerData.item2,
            playerData.item3,
            playerData.item4,
            playerData.item5,
            playerData.item6
          ].filter(item => item !== 0),
          augments: [
            playerData.playerAugment1,
            playerData.playerAugment2,
            playerData.playerAugment3,
            playerData.playerAugment4
          ].filter(augment => augment && augment !== 0)
        };
      } catch (error) {
        console.error(`Failed to fetch details for match ${matchId}:`, error.response?.status);
        return null;
      }
    });

    const matches = await Promise.all(matchPromises);
    const validMatches = matches.filter(m => m !== null);

    console.log(`Successfully processed ${validMatches.length}/${matchIds.length} matches for ${summonerName}`);

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

    console.log(`Generated CSV with ${validMatches.length} matches for ${summonerName}`);

    // Set headers to trigger file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent));
    
    // Send the CSV content directly as response
    res.send(csvContent);

  } catch (error) {
    console.error(`Error in /api/arena/summoner/${req.params.summonerName}/csv:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || 'Failed to export Arena matches to CSV'
    });
  }
});

app.listen(port, () => {
  console.log(`LoL Arena Data Collector running on http://localhost:${port}`);
  console.log('Endpoints:');
  console.log(`GET /api/arena/matches/:puuid - get Arena matches (JSON)`);
  console.log(`GET /api/arena/matches/:puuid/csv - export Arena matches to CSV`);
  console.log(`GET /api/arena/riot-id/:gameName/:tagLine/csv - export Arena matches by Riot ID (RECOMMENDED!)`);
  console.log(`GET /api/arena/summoner/:summonerName/csv - export Arena matches by summoner name (LEGACY)`);
  console.log('');
  console.log('Examples:');
  console.log('  http://localhost:3001/api/arena/riot-id/Faker/T1');
  console.log('  http://localhost:3001/api/arena/riot-id/anndrewkimm/9165');
  console.log('  http://localhost:3001/api/test/riot-id/Faker/T1 (test API key)');
  console.log('');
  console.log('Rate limiting: 50 requests per 2 minutes per IP');
  console.log('API calls have 120ms delays to respect Riot rate limits');
});