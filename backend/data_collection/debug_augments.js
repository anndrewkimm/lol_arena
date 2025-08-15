// Diagnostic script to check what's wrong with augment data
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

async function diagnoseAugmentData() {
  console.log('=== AUGMENT DATA DIAGNOSTICS ===\n');
  
  try {
    // 1. Check current augment data
    console.log('1. Checking current augment data from your server...');
    const currentData = await axios.get(`${BASE_URL}/api/augments`);
    const augments = currentData.data.augments;
    
    console.log(`Total augments: ${augments.length}`);
    
    // Analyze the data structure
    console.log('\n2. Analyzing data structure...');
    const sampleAugment = augments[0];
    console.log('Sample augment fields:', Object.keys(sampleAugment));
    console.log('Sample augment values:', JSON.stringify(sampleAugment, null, 2));
    
    // Check for missing data
    const withNames = augments.filter(a => a.name && a.name !== undefined).length;
    const withApiNames = augments.filter(a => a.apiName && a.apiName !== undefined).length;
    const withIds = augments.filter(a => a.id !== undefined).length;
    
    console.log(`\nData quality:
    - IDs: ${withIds}/${augments.length}
    - Names: ${withNames}/${augments.length}
    - API Names: ${withApiNames}/${augments.length}`);
    
    // 3. Try fetching fresh data directly from Community Dragon
    console.log('\n3. Testing direct Community Dragon URLs...');
    
    const testUrls = [
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json',
      'https://raw.communitydragon.org/pbe/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json',
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/arena-augments.json'
    ];
    
    for (const url of testUrls) {
      try {
        console.log(`\nTesting: ${url}`);
        const response = await axios.get(url, { timeout: 10000 });
        
        if (Array.isArray(response.data) && response.data.length > 0) {
          const sample = response.data[0];
          console.log(`✅ SUCCESS - Got ${response.data.length} items`);
          console.log('Sample structure:', JSON.stringify(sample, null, 2));
          
          // Check if this looks like valid augment data
          const hasNames = response.data.filter(item => 
            item.name || item.nameText || item.displayName
          ).length;
          
          console.log(`Items with names: ${hasNames}/${response.data.length}`);
          
          if (hasNames > 0) {
            console.log('🎉 This URL has valid augment data!');
            
            // Show a few examples
            console.log('\nFirst 3 valid augments:');
            response.data
              .filter(item => item.name || item.nameText || item.displayName)
              .slice(0, 3)
              .forEach((item, i) => {
                console.log(`${i + 1}. ID: ${item.id}, Name: ${item.name || item.nameText || item.displayName}`);
              });
          }
          
        } else {
          console.log(`❌ Invalid response format or empty data`);
        }
        
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
      }
    }
    
    // 4. Test with some known Arena augment patterns
    console.log('\n4. Testing known Arena augment ID patterns...');
    
    // These are common patterns based on Arena/TFT augments
    const knownPatterns = [
      '10001', '10002', '10003', // Arena might use high IDs
      'Arena_Augment_1', 'Arena_Augment_2',
      'Cherry_Augment_1', 'Cherry_Augment_2',
      'TFT7_Augment_AscensionAmulet',
      'TFT7_Augment_BalanceOfPower'
    ];
    
    for (const pattern of knownPatterns) {
      const found = augments.find(a => 
        String(a.id) === pattern || 
        a.apiName === pattern ||
        a.name === pattern
      );
      
      if (found) {
        console.log(`✅ Found pattern "${pattern}":`, found);
      }
    }
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error.message);
  }
}

// Also test what a real match gives you
async function checkRealMatchAugments() {
  console.log('\n=== REAL MATCH AUGMENT ANALYSIS ===');
  
  try {
    // You'll need to provide a real PUUID here
    const puuid = 'REPLACE_WITH_REAL_PUUID'; // Replace this!
    
    if (puuid === 'REPLACE_WITH_REAL_PUUID') {
      console.log('⚠️ Skipping real match test - no PUUID provided');
      console.log('To test with real data, replace PUUID in the script');
      return;
    }
    
    console.log('Getting real match data...');
    const matchResponse = await axios.get(`${BASE_URL}/api/matches/${puuid}?count=3`);
    const matches = matchResponse.data.matches;
    
    console.log(`Got ${matches.length} matches`);
    
    matches.forEach((match, i) => {
      console.log(`\nMatch ${i + 1}:`);
      console.log(`  Game Mode: ${match.gameMode}`);
      console.log(`  Queue ID: ${match.queueId}`);
      console.log(`  Augments:`, match.player.augments);
      
      // Test each augment
      if (match.player.augments && match.player.augments.length > 0) {
        match.player.augments.forEach(async (augmentId) => {
          if (augmentId) {
            try {
              const imgResponse = await axios.get(`${BASE_URL}/api/images/augment/${augmentId}`);
              console.log(`    Augment ${augmentId}: ✅ ${imgResponse.data.name}`);
            } catch (error) {
              console.log(`    Augment ${augmentId}: ❌ Not found`);
            }
          }
        });
      }
    });
    
  } catch (error) {
    console.error('Real match test failed:', error.message);
  }
}

// Run diagnostics
diagnoseAugmentData().then(() => {
  return checkRealMatchAugments();
}).catch(console.error);

module.exports = { diagnoseAugmentData };