const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3001;

// Fetch latest Riot game version
async function getLatestVersion() {
  try {
    const response = await axios.get(
      'https://ddragon.leagueoflegends.com/api/versions.json'
    );
    return response.data[0]; // latest version
  } catch (error) {
    console.error('Error fetching latest version:', error);
    return '14.14.1'; // fallback version
  }
}

// Fetch all champions data for the latest version
async function fetchAllChampions() {
  const version = await getLatestVersion();

  try {
    const response = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
    );
    return response.data.data; // champion data
  } catch (error) {
    console.error('Error fetching champion data:', error);
    return null;
  }
}

// Express route for /api/champions
app.get('/api/champion/:name', async (req, res) => {
  const { name } = req.params;
  const champions = await fetchAllChampions();

  if (!champions) {
    return res.status(500).json({ error: 'Failed to fetch champion data' });
  }

  // Find champion by ignoring case sensitivity
  const champKey = Object.keys(champions).find(
    key => key.toLowerCase() === name.toLowerCase()
  );

  if (champKey) {
    res.json(champions[champKey]);
  } else {
    res.status(404).json({ error: 'Champion not found' });
  }
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
