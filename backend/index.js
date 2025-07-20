require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

// Check if API key exists
if (!RIOT_API_KEY) {
  console.error('Error: RIOT_API_KEY not found in .env');
  process.exit(1);
}

// Validate API key format
if (!RIOT_API_KEY.startsWith('RGAPI-')) {
  console.error('Error: API key should start with "RGAPI-"');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Data Dragon version cache
let currentVersion = null;
let versionCacheTime = null;
const VERSION_CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

// Get current Data Dragon version
const getCurrentVersion = async () => {
  const now = Date.now();
  
  if (currentVersion && versionCacheTime && (now - versionCacheTime < VERSION_CACHE_DURATION)) {
    return currentVersion;
  }
  
  try {
    const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    currentVersion = response.data[0]; // Latest version
    versionCacheTime = now;
    console.log('📦 Data Dragon version:', currentVersion);
    return currentVersion;
  } catch (error) {
    console.error('❌ Failed to get Data Dragon version:', error.message);
    // Fallback to a recent version
    return '14.23.1';
  }
};

// Get player info and match history
app.get('/api/player/:gameName/:tagLine', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    
    console.log('🔍 Looking up player:', `${gameName}#${tagLine}`);
    
    // Step 1: Get PUUID from Riot ID
    const accountRegion = 'americas';
    const accountUrl = `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    const accountResponse = await axios.get(accountUrl, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; LoLArena/1.0)'
      }
    });
    
    const puuid = accountResponse.data.puuid;
    console.log('✅ Found player with PUUID:', puuid.substring(0, 8) + '...');
    
    res.json({
      success: true,
      player: {
        gameName: accountResponse.data.gameName,
        tagLine: accountResponse.data.tagLine,
        puuid: puuid
      }
    });
    
  } catch (error) {
    console.error('❌ Player lookup failed:', error.response?.status, error.response?.data?.message);
    
    if (error.response?.status === 404) {
      res.status(404).json({
        success: false,
        error: 'Player not found. Please check the summoner name and tag.'
      });
    } else if (error.response?.status === 403) {
      res.status(403).json({
        success: false,
        error: 'API key invalid or expired.'
      });
    } else {
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || 'Failed to lookup player'
      });
    }
  }
});

// Get match history for a player
app.get('/api/matches/:puuid', async (req, res) => {
  try {
    const { puuid } = req.params;
    const count = Math.min(parseInt(req.query.count) || 10, 20); // Max 20 matches
    
    console.log('🔍 Getting match history for PUUID:', puuid.substring(0, 8) + '...');
    
    // Get match IDs
    const matchRegion = 'americas';
    const matchUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    
    const matchResponse = await axios.get(matchUrl, {
      headers: { 
        'X-Riot-Token': RIOT_API_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; LoLArena/1.0)'
      }
    });
    
    const matchIds = matchResponse.data;
    console.log('✅ Found', matchIds.length, 'matches');
    
    // Get detailed match data for each match
    const matchPromises = matchIds.map(async (matchId) => {
      try {
        const matchDetailUrl = `https://${matchRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchDetailResponse = await axios.get(matchDetailUrl, {
          headers: { 
            'X-Riot-Token': RIOT_API_KEY,
            'User-Agent': 'Mozilla/5.0 (compatible; LoLArena/1.0)'
          }
        });
        
        const match = matchDetailResponse.data;
        
        // Find the player's data in this match
        const playerData = match.info.participants.find(p => p.puuid === puuid);
        
        return {
          matchId: matchId,
          gameCreation: match.info.gameCreation,
          gameDuration: match.info.gameDuration,
          gameMode: match.info.gameMode,
          gameType: match.info.gameType,
          queueId: match.info.queueId,
          player: {
            championName: playerData.championName,
            championId: playerData.championId,
            kills: playerData.kills,
            deaths: playerData.deaths,
            assists: playerData.assists,
            totalMinionsKilled: playerData.totalMinionsKilled,
            goldEarned: playerData.goldEarned,
            champLevel: playerData.champLevel,
            win: playerData.win,
            items: [
              playerData.item0,
              playerData.item1,
              playerData.item2,
              playerData.item3,
              playerData.item4,
              playerData.item5,
              playerData.item6
            ].filter(item => item !== 0),
            // Add augments for Arena mode
            augments: [
              playerData.playerAugment1,
              playerData.playerAugment2,
              playerData.playerAugment3,
              playerData.playerAugment4
            ].filter(augment => augment && augment !== 0)
          }
        };
      } catch (err) {
        console.error('Failed to get match details for:', matchId);
        return null;
      }
    });
    
    const matches = await Promise.all(matchPromises);
    const validMatches = matches.filter(match => match !== null);
    
    console.log('✅ Retrieved details for', validMatches.length, 'matches');
    
    res.json({
      success: true,
      matches: validMatches
    });
    
  } catch (error) {
    console.error('❌ Match history failed:', error.response?.status, error.response?.data);
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || 'Failed to get match history'
    });
  }
});

// ===== IMAGE ENDPOINTS =====

// Get champion image URL
app.get('/api/images/champion/:championName', async (req, res) => {
  try {
    const { championName } = req.params;
    const size = req.query.size || 'square'; // square, loading, splash
    const version = await getCurrentVersion();
    
    let imageUrl;
    
    switch (size) {
      case 'square':
        imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
        break;
      case 'loading':
        // Loading screen art (vertical)
        imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championName}_0.jpg`;
        break;
      case 'splash':
        // Full splash art
        imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_0.jpg`;
        break;
      default:
        imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
    }
    
    res.json({
      success: true,
      championName,
      imageUrl,
      size,
      version
    });
    
  } catch (error) {
    console.error('❌ Champion image lookup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get champion image'
    });
  }
});

// Get item image URL
app.get('/api/images/item/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const version = await getCurrentVersion();
    
    const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
    
    res.json({
      success: true,
      itemId,
      imageUrl,
      version
    });
    
  } catch (error) {
    console.error('❌ Item image lookup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get item image'
    });
  }
});

// --- COMMUNITY DRAGON AUGMENTS CACHE ---

let augmentDataCache = null;
let augmentCacheTime = 0;
const AUGMENT_CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

const fetchAugmentData = async () => {
  try {
    console.log('🔄 Fetching Community Dragon augment data...');
    const url = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json';
    const response = await axios.get(url);
    augmentDataCache = response.data;
    augmentCacheTime = Date.now();
    console.log(`✅ Loaded ${augmentDataCache.length} augments from Community Dragon.`);
  } catch (error) {
    console.error('❌ Failed to fetch augment data from Community Dragon:', error.message);
  }
};

// Fetch on server start
fetchAugmentData();

// Refresh augment data every 24 hours
setInterval(() => {
  fetchAugmentData();
}, AUGMENT_CACHE_DURATION);

// --- ENDPOINT TO GET ALL AUGMENTS ---

app.get('/api/augments', (req, res) => {
  if (!augmentDataCache) {
    return res.status(503).json({ success: false, error: 'Augment data not loaded yet, try again later.' });
  }
  res.json({ success: true, augments: augmentDataCache });
});

// --- UPDATE YOUR EXISTING AUGMENT IMAGE ENDPOINT ---

app.get('/api/images/augment/:augmentId', async (req, res) => {
  try {
    let { augmentId } = req.params;
    if (!augmentId) {
      return res.status(400).json({ success: false, error: 'No augment ID provided' });
    }

    // If augmentId is numeric, map it to the string key using augmentDataCache
    if (/^\d+$/.test(augmentId) && augmentDataCache) {
      const found = augmentDataCache.find(a => String(a.id) === String(augmentId));
      if (found && found.apiName) {
        augmentId = found.apiName;
      } else {
        return res.status(404).json({ success: false, error: 'Augment not found for numeric ID' });
      }
    }

    const fileName = augmentId.toLowerCase().replace(/[\s\r\n]+/g, '') + '_large.png';
    const imageUrl = `https://raw.communitydragon.org/15.14/game/assets/ux/cherry/augments/icons/${fileName}`;
    console.log('Fetching augment image from:', imageUrl);

    const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'image/png');
    imageResponse.data.pipe(res);
  } catch (error) {
    console.error('❌ Augment image proxy failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to proxy augment image'
    });
  }
});




// Get multiple champion images at once
app.post('/api/images/champions', async (req, res) => {
  try {
    const { championNames } = req.body;
    const size = req.query.size || 'square';
    const version = await getCurrentVersion();
    
    if (!Array.isArray(championNames)) {
      return res.status(400).json({
        success: false,
        error: 'championNames must be an array'
      });
    }
    
    const images = championNames.map(championName => {
      let imageUrl;
      
      switch (size) {
        case 'square':
          imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
          break;
        case 'loading':
          imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championName}_0.jpg`;
          break;
        case 'splash':
          imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_0.jpg`;
          break;
        default:
          imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
      }
      
      return {
        championName,
        imageUrl
      };
    });
    
    res.json({
      success: true,
      images,
      size,
      version
    });
    
  } catch (error) {
    console.error('❌ Bulk champion images failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get champion images'
    });
  }
});

// Get multiple item images at once
app.post('/api/images/items', async (req, res) => {
  try {
    const { itemIds } = req.body;
    const version = await getCurrentVersion();
    
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({
        success: false,
        error: 'itemIds must be an array'
      });
    }
    
    const images = itemIds
      .filter(itemId => itemId && itemId !== 0) // Filter out empty/null items
      .map(itemId => ({
        itemId,
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
      }));
    
    res.json({
      success: true,
      images,
      version
    });
    
  } catch (error) {
    console.error('❌ Bulk item images failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get item images'
    });
  }
});

// Get Data Dragon version info
app.get('/api/version', async (req, res) => {
  try {
    const version = await getCurrentVersion();
    res.json({
      success: true,
      version,
      cached: !!(currentVersion && versionCacheTime)
    });
  } catch (error) {
    console.error('❌ Version lookup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get version'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    riotApiKeyLoaded: !!RIOT_API_KEY,
    datadragonVersion: currentVersion
  });
});

// Start server
app.listen(port, () => {
  console.log('🚀 LoL Arena Backend running on http://localhost:' + port);
  console.log('🔑 Riot API Key:', RIOT_API_KEY ? 'Loaded ✅' : 'Missing ❌');
  console.log('📋 Endpoints:');
  console.log('  GET /api/player/:gameName/:tagLine - Lookup player');
  console.log('  GET /api/matches/:puuid - Get match history');
  console.log('  GET /api/images/champion/:championName?size=square - Get champion image');
  console.log('  GET /api/images/item/:itemId - Get item image');
  console.log('  GET /api/images/augment/:augmentId - Get augment image');
  console.log('  POST /api/images/champions - Get multiple champion images');
  console.log('  POST /api/images/items - Get multiple item images');
  console.log('  GET /api/version - Get Data Dragon version');
  console.log('  GET /health - Health check');
});