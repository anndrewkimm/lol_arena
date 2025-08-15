// Test script to check augment ID vs name behavior
const axios = require('axios');

const BASE_URL = 'http://localhost:3001'; // Adjust to your backend URL

async function testAugmentEndpoint() {
  console.log('=== TESTING AUGMENT ENDPOINT ===\n');
  
  try {
    // First, get all augments to see what data we have
    console.log('1. Fetching all augments to see available data...');
    const allAugmentsResponse = await axios.get(`${BASE_URL}/api/augments`);
    const augments = allAugmentsResponse.data.augments;
    
    console.log(`Total augments available: ${augments.length}`);
    console.log('\nFirst 3 augments structure:');
    augments.slice(0, 3).forEach((aug, i) => {
      console.log(`Augment ${i + 1}:`);
      console.log(`  ID: ${aug.id} (type: ${typeof aug.id})`);
      console.log(`  Name: ${aug.name}`);
      console.log(`  API Name: ${aug.apiName}`);
      console.log('---');
    });

    // Test cases
    const testCases = [
      // Test with actual IDs from the first few augments
      { type: 'ID (number)', value: augments[0]?.id },
      { type: 'ID (string)', value: String(augments[0]?.id) },
      { type: 'API Name', value: augments[0]?.apiName },
      { type: 'Display Name', value: augments[0]?.name },
      
      // Test with some common patterns
      { type: 'Random ID', value: '12345' },
      { type: 'Non-existent', value: 'NonExistentAugment' },
    ];

    console.log('\n2. Testing different input types...\n');

    for (const testCase of testCases) {
      if (!testCase.value) continue;
      
      console.log(`Testing ${testCase.type}: "${testCase.value}"`);
      
      try {
        const response = await axios.get(`${BASE_URL}/api/images/augment/${encodeURIComponent(testCase.value)}`);
        const data = response.data;
        
        console.log(`✅ SUCCESS:`);
        console.log(`  Found: ${data.name}`);
        console.log(`  Original ID: ${data.augmentId}`);
        console.log(`  Clean Name: ${data.apiName}`);
        console.log(`  Image URL: ${data.imageUrl}`);
        console.log(`  Found in cache: ${data.debugInfo.foundInCache}`);
        console.log(`  Search methods that worked:`, 
          Object.entries(data.debugInfo.searchMethods)
            .filter(([key, value]) => value)
            .map(([key]) => key)
        );
        
      } catch (error) {
        console.log(`❌ FAILED: ${error.response?.status} - ${error.response?.data?.error}`);
        if (error.response?.data?.debugInfo) {
          console.log(`  Debug info:`, error.response.data.debugInfo);
        }
      }
      
      console.log('---\n');
    }

    // Test with actual match data augments (if you have any)
    console.log('3. Testing with sample match augment IDs...\n');
    
    // You can add actual augment IDs from your match data here
    const sampleMatchAugments = [
      '1', '2', '3', '10', '20', // Common numeric IDs
      'TFT7_Augment_Ascension', // Common API name pattern
      'Cherry_Carry', // Another pattern
    ];

    for (const augmentId of sampleMatchAugments) {
      console.log(`Testing match augment ID: "${augmentId}"`);
      
      try {
        const response = await axios.get(`${BASE_URL}/api/images/augment/${encodeURIComponent(augmentId)}`);
        console.log(`✅ Found: ${response.data.name}`);
        
      } catch (error) {
        console.log(`❌ Not found or error: ${error.response?.status}`);
      }
    }

  } catch (error) {
    console.error('Failed to run test:', error.message);
  }
}

// Also create a function to test with real match data
async function testWithRealMatchData(playerPuuid) {
  console.log('\n=== TESTING WITH REAL MATCH DATA ===\n');
  
  try {
    // Get actual match data
    const matchResponse = await axios.get(`${BASE_URL}/api/matches/${playerPuuid}?count=5`);
    const matches = matchResponse.data.matches;
    
    console.log(`Got ${matches.length} matches`);
    
    // Extract all unique augment IDs from matches
    const augmentIds = new Set();
    
    matches.forEach(match => {
      if (match.player.augments) {
        match.player.augments.forEach(augment => {
          if (augment) augmentIds.add(augment);
        });
      }
    });
    
    console.log(`Found ${augmentIds.size} unique augment IDs in match data:`);
    console.log(Array.from(augmentIds));
    
    // Test each augment ID
    for (const augmentId of augmentIds) {
      console.log(`\nTesting augment from match: "${augmentId}"`);
      
      try {
        const response = await axios.get(`${BASE_URL}/api/images/augment/${encodeURIComponent(augmentId)}`);
        console.log(`✅ Success: ${response.data.name}`);
        console.log(`  Image URL: ${response.data.imageUrl}`);
        
      } catch (error) {
        console.log(`❌ Failed: ${error.response?.data?.error}`);
        console.log(`  Debug:`, error.response?.data?.debugInfo);
      }
    }
    
  } catch (error) {
    console.error('Failed to test with real match data:', error.message);
  }
}

// Run the tests
async function runAllTests() {
  await testAugmentEndpoint();
  
  // Uncomment and provide a real PUUID to test with actual match data
  // await testWithRealMatchData('your-puuid-here');
}

runAllTests();

// Export for use as module
module.exports = { testAugmentEndpoint, testWithRealMatchData };