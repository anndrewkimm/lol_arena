require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process'); // ADDED: Import spawn for child processes


const app = express();

app.use(cors()); // <-- Add this line to enable CORS for all origins
app.use(express.json());


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
    return '14.23.1'; // Fallback to a known recent version if fetching fails
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
            totalDamageDealt: playerData.totalDamageDealt, // ADDED: Required for ML model
            totalDamageTaken: playerData.totalDamageTaken, // ADDED: Required for ML model
            goldEarned: playerData.goldEarned,           // ADDED: Required for ML model
            totalMinionsKilled: playerData.totalMinionsKilled,
            champLevel: playerData.champLevel,
            win: playerData.win, // This is a boolean indicating actual win/loss
            placement: playerData.placement, // ADDED: For Arena, placement determines win
            items: [
              playerData.item0,
              playerData.item1,
              playerData.item2,
              playerData.item3,
              playerData.item4,
              playerData.item5,
              playerData.item6
            ].filter(item => item !== 0),
            // Add augments for Arena mode (playerAugment1, etc. are correct)
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
        return null; // Return null for failed match details
      }
    });
    
    const matches = await Promise.all(matchPromises);
    const validMatches = matches.filter(match => match !== null); // Filter out failed matches
    
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

// Updated augment image endpoint with better ID matching
app.get('/api/images/augment/:augmentId', (req, res) => {
  try {
    let { augmentId } = req.params;
    if (!augmentId) {
      return res.status(400).json({ success: false, error: 'No augment ID provided' });
    }

    console.log(`🔍 Looking up augment image for ID: ${augmentId} (type: ${typeof augmentId})`);

    if (!augmentDataCache || augmentDataCache.length === 0) {
      return res.status(503).json({ 
        success: false, 
        error: 'Augment data not loaded yet, try again later.' 
      });
    }

    let augmentInfo = null;
    let cleanName = null;

    // Try multiple ways to find the augment
    console.log('🔍 Searching for augment in multiple ways...');
    
    // Method 1: Direct ID match (string)
    augmentInfo = augmentDataCache.find(a => String(a.id) === String(augmentId));
    if (augmentInfo) {
      console.log('✅ Found by direct string ID match');
    }
    
    // Method 2: Direct ID match (number)
    if (!augmentInfo) {
      augmentInfo = augmentDataCache.find(a => a.id === Number(augmentId));
      if (augmentInfo) {
        console.log('✅ Found by direct number ID match');
      }
    }
    
    // Method 3: API name match
    if (!augmentInfo) {
      augmentInfo = augmentDataCache.find(a => a.apiName === augmentId);
      if (augmentInfo) {
        console.log('✅ Found by API name match');
      }
    }
    
    // Method 4: Partial string match in ID
    if (!augmentInfo) {
      augmentInfo = augmentDataCache.find(a => String(a.id).includes(String(augmentId)));
      if (augmentInfo) {
        console.log('✅ Found by partial ID match');
      }
    }
    
    // Method 5: Try to map Riot API augment IDs to Community Dragon
    // This might be needed if Riot uses different IDs than Community Dragon
    if (!augmentInfo && /^\d+$/.test(augmentId)) {
      // The augment might be in a different ID system
      // Log available IDs for debugging
      console.log('Available augment IDs (first 10):', augmentDataCache.slice(0, 10).map(a => ({ id: a.id, name: a.name })));
      
      // Sometimes Riot IDs need to be offset or mapped differently
      // Try some common patterns:
      const possibleMappings = [
        Number(augmentId),
        Number(augmentId) + 1,
        Number(augmentId) - 1,
        `TFT_Augment_${augmentId}`,
        `Cherry_${augmentId}`
      ];
      
      for (const mappedId of possibleMappings) {
        augmentInfo = augmentDataCache.find(a => 
          String(a.id) === String(mappedId) || 
          a.apiName?.includes(String(mappedId))
        );
        if (augmentInfo) {
          console.log(`✅ Found by mapped ID: ${augmentId} -> ${mappedId}`);
          break;
        }
      }
    }

    if (augmentInfo && augmentInfo.apiName) {
      cleanName = augmentInfo.apiName.toLowerCase().replace(/[\s\r\n]+/g, '');
    } else {
      // Fallback: use the original ID as clean name
      cleanName = String(augmentId).toLowerCase().replace(/[\s\r\n]+/g, '');
      console.log('⚠️ No augment found, using fallback clean name:', cleanName);
    }

    // Create image URL
    // Note: This URL pattern is based on your original example and common CDragon paths.
    // If it doesn't work for all augments, you might need to inspect the CDragon data
    // more closely for the exact asset paths.
    const imageUrl = `https://raw.communitydragon.org/latest/game/assets/ux/cherry/augments/icons/${cleanName}_large.png`;
    const augmentName = augmentInfo?.name || `Augment ${augmentId}`;

    console.log(`📷 Generated image URL: ${imageUrl}`);

    res.json({
      success: true,
      augmentId: augmentId,
      name: augmentName,
      apiName: cleanName,
      imageUrl: imageUrl,
      debugInfo: {
        originalId: augmentId,
        foundInCache: !!augmentInfo,
        cleanName: cleanName,
        searchMethods: {
          stringId: !!augmentDataCache.find(a => String(a.id) === String(augmentId)),
          numberId: !!augmentDataCache.find(a => a.id === Number(augmentId)),
          apiName: !!augmentDataCache.find(a => a.apiName === augmentId)
        },
        totalAugmentsInCache: augmentDataCache.length
      }
    });
    
  } catch (error) {
    console.error('❌ Augment image lookup failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get augment image',
      debugInfo: {
        originalId: req.params.augmentId,
        errorMessage: error.message,
        hasAugmentCache: !!augmentDataCache,
        cacheSize: augmentDataCache?.length || 0
      }
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


// ADDED: API endpoint for ML model prediction
app.post('/api/predict-arena-win', (req, res) => {
  const py = spawn('python', ['data_collection/predict_service.py']);
  let result = '';
  let error = '';

  py.stdin.write(JSON.stringify(req.body));
  py.stdin.end();

  py.stdout.on('data', (data) => {
    result += data.toString();
  });

  py.stderr.on('data', (data) => {
    error += data.toString();
  });

  py.on('close', (code) => {
    if (code !== 0 || error) {
      return res.status(500).json({ success: false, error: error || 'Prediction failed.' });
    }
    try {
      res.json(JSON.parse(result));
    } catch (e) {
      res.status(500).json({ success: false, error: 'Invalid response from Python script.' });
    }
  });
});


/*app.post('/api/predict-arena-placements', (req, res) => {
  const { matches } = req.body;
  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({ success: false, error: 'No matches provided' });
  }

  const py = spawn('python', ['data_collection/predict_service.py', '--batch']);
  let result = '';
  let error = '';

  py.stdin.write(JSON.stringify(matches));
  py.stdin.end();

  py.stdout.on('data', (data) => {
    result += data.toString();
  });

  py.stderr.on('data', (data) => {
    error += data.toString();
  });

  py.on('close', (code) => {
    if (code !== 0 || error) {
      return res.status(500).json({ success: false, error: error || 'Prediction failed.' });
    }
    try {
      res.json(JSON.parse(result));
    } catch (e) {
      res.status(500).json({ success: false, error: 'Invalid response from Python script.' });
    }
  });
});
*/

app.post('/api/predict-arena-placements', (req, res) => {
  const { matches } = req.body;
  console.log('\n=== BATCH PREDICTION DEBUG ===');
  console.log('Number of matches received:', matches?.length);
  console.log('Sample match data:');
  console.log(JSON.stringify(matches?.[0], null, 2));
  
  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({ success: false, error: 'No matches provided' });
  }

  // Log the exact JSON being sent to Python
  const jsonData = JSON.stringify(matches);
  console.log('JSON being sent to Python script:');
  console.log(jsonData.substring(0, 500) + '...');

  const py = spawn('python', ['data_collection/predict_service.py', '--batch']);
  let result = '';
  let error = '';

  // Log Python process creation
  console.log('Python process spawned with PID:', py.pid);

  py.stdin.write(jsonData);
  py.stdin.end();

  py.stdout.on('data', (data) => {
    const chunk = data.toString();
    console.log('Python stdout chunk:', chunk);
    result += chunk;
  });

  py.stderr.on('data', (data) => {
    const chunk = data.toString();
    console.log('Python stderr chunk:', chunk);
    error += chunk;
  });

  py.on('close', (code) => {
    console.log('Python process closed with code:', code);
    console.log('Final result:', result);
    console.log('Final error:', error);
    
    if (code !== 0 || error) {
      return res.status(500).json({ success: false, error: error || 'Prediction failed.' });
    }
    try {
      const parsedResult = JSON.parse(result);
      console.log('Parsed prediction result:', JSON.stringify(parsedResult, null, 2));
      res.json(parsedResult);
    } catch (e) {
      console.log('JSON parse error:', e.message);
      res.status(500).json({ success: false, error: 'Invalid response from Python script.' });
    }
  });

  py.on('error', (err) => {
    console.log('Python process error:', err);
    res.status(500).json({ success: false, error: 'Failed to start Python process: ' + err.message });
  });
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
  console.log('  GET /api/augments - Get all augment data'); // ADDED: New endpoint you added
  console.log('  GET /api/version - Get Data Dragon version');
  console.log('  POST /api/predict-arena-win - Get win prediction for Arena game'); // ADDED: Your new prediction endpoint
  console.log('  GET /health - Health check');
});