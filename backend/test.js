require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const REGION = 'na1';

// Check if API key exists
if (!RIOT_API_KEY) {
  console.error('Error: RIOT_API_KEY not found in .env');
  process.exit(1);
}

// Validate API key format
if (!RIOT_API_KEY.startsWith('RGAPI-')) {
  console.error('Error: API key should start with "RGAPI-"');
  console.error('Current key starts with:', RIOT_API_KEY.substring(0, 10) + '...');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Test endpoint - Riot ID (new format)
app.get('/api/test', async (req, res) => {
  try {
    const gameName = 'anndrewkimm';
    const tagLine = '9165';
    
    // Account API uses different regional routing
    const accountRegion = 'americas'; // americas, asia, europe, esports
    const url = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    console.log('🔍 Testing Riot Account API...');
    console.log('API Key:', RIOT_API_KEY ? 'Present' : 'Missing');
    console.log('Request URL:', url);
    console.log('Game Name:', gameName);
    console.log('Tag Line:', tagLine);
    console.log('Account Region:', accountRegion);
    
    const response = await axios.get(url, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; RiotAPITest/1.0)'
      }
    });
    
    console.log('✅ Success! Status:', response.status);
    
    res.json({
      message: '✅ Riot Account API request successful!',
      riotId: `${gameName}#${tagLine}`,
      region: accountRegion,
      data: response.data
    });
    
  } catch (error) {
    console.error('❌ Error occurred:');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Error Data:', error.response?.data);
    console.error('Full Error:', error.message);
    
    res.status(error.response?.status || 500).json({
      message: '❌ Riot Account API request failed',
      error: error.response?.data || error.message,
      status: error.response?.status,
      riotId: `${gameName}#${tagLine}`,
      region: 'americas'
    });
  }
});

// Combined endpoint: Get player info AND match history in one call
app.get('/api/player/:gameName/:tagLine/matches', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const count = req.query.count || 10;
    
    console.log('🔍 Getting player info and match history...');
    console.log('Riot ID:', `${gameName}#${tagLine}`);
    
    // Step 1: Get PUUID from Riot ID
    const accountRegion = 'americas';
    const accountUrl = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    const accountResponse = await axios.get(accountUrl, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; RiotAPITest/1.0)'
      }
    });
    
    const puuid = accountResponse.data.puuid;
    console.log('✅ Got PUUID:', puuid);
    
    // Step 2: Get match history using PUUID
    const matchRegion = 'americas';
    const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    
    const matchResponse = await axios.get(matchUrl, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; RiotAPITest/1.0)'
      }
    });
    
    console.log('✅ Got match history! Found', matchResponse.data.length, 'matches');
    
    res.json({
      message: '✅ Player info and match history retrieved!',
      player: {
        gameName: accountResponse.data.gameName,
        tagLine: accountResponse.data.tagLine,
        puuid: puuid
      },
      matchHistory: {
        count: matchResponse.data.length,
        matchIds: matchResponse.data
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data);
    
    res.status(error.response?.status || 500).json({
      message: '❌ Failed to get player info and match history',
      error: error.response?.data || error.message,
      status: error.response?.status
    });
  }
});

// Get match details
app.get('/api/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    
    const matchRegion = 'americas';
    const url = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    
    console.log('🔍 Getting match details...');
    console.log('Match ID:', matchId);
    console.log('Request URL:', url);
    
    const response = await axios.get(url, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; RiotAPITest/1.0)'
      }
    });
    
    console.log('✅ Match details retrieved!');
    
    res.json({
      message: '✅ Match details retrieved successfully!',
      matchId: matchId,
      data: response.data
    });
    
  } catch (error) {
    console.error('❌ Error getting match details:');
    console.error('Status:', error.response?.status);
    console.error('Error Data:', error.response?.data);
    
    res.status(error.response?.status || 500).json({
      message: '❌ Failed to get match details',
      error: error.response?.data || error.message,
      status: error.response?.status
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    message: 'Server is running!',
    timestamp: new Date().toISOString(),
    port: port,
    riotApiKeyLoaded: !!RIOT_API_KEY
  });
});

// Start server
app.listen(port, () => {
  console.log('🚀 Backend server running on http://localhost:' + port);
  console.log('🔑 Riot API Key loaded:', RIOT_API_KEY ? 'Yes ✅' : 'No ❌');
  console.log('🌎 Region set to:', REGION);
  console.log('📋 Test Riot ID API at: http://localhost:' + port + '/api/test');
  console.log('🚀 Get player + matches: http://localhost:' + port + '/api/player/anndrewkimm/9165/matches');
  console.log('📋 Get match details: http://localhost:' + port + '/api/match/MATCH_ID');
  console.log('❤️  Health check at: http://localhost:' + port + '/health');
});