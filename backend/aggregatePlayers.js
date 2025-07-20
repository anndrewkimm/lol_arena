const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const HEADERS = { "X-Riot-Token": RIOT_API_KEY };

// 1️⃣ Get PUUID from Summoner Name
async function getPuuid(summonerName, region = "na1") {
  const url = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
  const response = await axios.get(url, { headers: HEADERS });
  return response.data.puuid;
}

// 2️⃣ Fetch recent Arena match IDs (queue=1700)
async function getRecentMatchIds(puuid, count = 10) {
  const americasUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=1700&count=${count}`;
  const response = await axios.get(americasUrl, { headers: HEADERS });
  return response.data; // Array of match IDs
}

// 3️⃣ Fetch full match details
async function getMatchDetails(matchId) {
  const americasUrl = `https://americas.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const response = await axios.get(americasUrl, { headers: HEADERS });
  return response.data;
}

// 4️⃣ Aggregate augments & anvils
function updateAggregation(aggregation, champion, augments, anvils) {
  if (!aggregation[champion]) {
    aggregation[champion] = { augments: {}, anvils: {} };
  }

  augments.forEach(id => {
    if (id) {
      aggregation[champion].augments[id] = (aggregation[champion].augments[id] || 0) + 1;
    }
  });

  anvils.forEach(id => {
    if (id) {
      aggregation[champion].anvils[id] = (aggregation[champion].anvils[id] || 0) + 1;
    }
  });
}

// 5️⃣ Main aggregation function
async function aggregateArenaData(summonerName, region = "na1") {
  const aggregation = {};

  console.log(`🔎 Getting PUUID for "${summonerName}"...`);
  const puuid = await getPuuid(summonerName, region);

  console.log(`🎯 Fetching recent Arena matches for "${summonerName}"...`);
  const matchIds = await getRecentMatchIds(puuid, 5); // Start small: 5 matches

  for (const matchId of matchIds) {
    console.log(`📥 Processing match ${matchId}...`);
    const match = await getMatchDetails(matchId);

    match.info.participants.forEach(participant => {
      const champion = participant.championName;
      const augments = [
        participant.playerAugment1,
        participant.playerAugment2,
        participant.playerAugment3,
        participant.playerAugment4,
      ];
      const anvils = [
        participant.playerAnvil1,
        participant.playerAnvil2,
        participant.playerAnvil3,
        participant.playerAnvil4,
      ];

      updateAggregation(aggregation, champion, augments, anvils);
    });
  }

  // Save to file
  fs.writeFileSync(
    "arena_aggregates.json",
    JSON.stringify(aggregation, null, 2)
  );

  console.log("✅ Aggregation complete! Data saved to arena_aggregates.json");
}

// Example usage:
aggregateArenaData("anndrewkimm", "na1").catch(err =>
  console.error("❌ Error:", err.response?.data || err.message)
);
