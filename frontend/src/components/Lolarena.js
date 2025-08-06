import React, { useState, useEffect } from 'react';
import { Search, Clock } from 'lucide-react';
import './Lolarena.css';

const LoLArena = () => {
  const [gameName, setGameName] = useState('');
  const [tagLine, setTagLine] = useState('');
  const [player, setPlayer] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageCache, setImageCache] = useState({}); // Cache for image URLs
  const [augmentData, setAugmentData] = useState([]);
  // Prediction states
  const [predictionResult, setPredictionResult] = useState(null); 
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState('');
  const [placementPredictions, setPlacementPredictions] = useState({});

  const API_BASE = 'http://localhost:3001';

  // Get champion image URL - uses cache
  const getChampionImageUrl = async (championName, size = 'square') => {
    const cacheKey = `champion_${championName}_${size}`;
    if (imageCache[cacheKey]) {
      return imageCache[cacheKey];
    }
    try {
      const response = await fetch(`${API_BASE}/api/images/champion/${championName}?size=${size}`);
      const data = await response.json();
      if (data.success) {
        setImageCache(prev => ({ ...prev, [cacheKey]: data.imageUrl }));
        return data.imageUrl;
      }
    } catch (err) {
      console.error('Failed to get champion image:', err);
    }
    return null;
  };

  // Get item image URL - uses cache
  const getItemImageUrl = async (itemId) => {
    if (!itemId || itemId === 0) return null;
    const cacheKey = `item_${itemId}`;
    if (imageCache[cacheKey]) {
      return imageCache[cacheKey];
    }
    try {
      const response = await fetch(`${API_BASE}/api/images/item/${itemId}`);
      const data = await response.json();
      if (data.success) {
        setImageCache(prev => ({ ...prev, [cacheKey]: data.imageUrl }));
        return data.imageUrl;
      }
    } catch (err) {
      console.error('Failed to get item image:', err);
    }
    return null;
  };

  // Get augment image URL - uses cache
  const getAugmentImageUrl = async (augmentId) => {
    if (!augmentId) return null;
    const cacheKey = `augment_${augmentId}`;
    if (imageCache[cacheKey]) {
        return imageCache[cacheKey];
    }
    try {
        const response = await fetch(`${API_BASE}/api/images/augment/${augmentId}`);
        const data = await response.json();
        if (data.success) {
            setImageCache(prev => ({ ...prev, [cacheKey]: data.imageUrl }));
            return data.imageUrl;
        }
    } catch (err) {
        console.error('Failed to get augment image:', err);
    }
    return null;
  };

  // Pre-fetch augment data on component mount
  useEffect(() => {
    const fetchAugments = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/augments`);
        const data = await response.json();
        if (data.success) {
          setAugmentData(data.augments);
        }
      } catch (err) {
        console.error('Failed to fetch augment data:', err);
      }
    };
    fetchAugments();
  }, []);

  // Preload images for better UX using batch fetching from backend
  const preloadMatchImages = async (matches) => {
    const championNames = matches.map(match => match.player.championName);
    const itemIds = matches.flatMap(match => match.player.items || []).filter(id => id && id !== 0);
    const augmentIds = matches.flatMap(match => match.player.augments || []).filter(id => id && id !== 0);

    // Batch fetch champion images
    try {
      const champResponse = await fetch(`${API_BASE}/api/images/champions?size=square`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ championNames: [...new Set(championNames)] })
      });
      const champData = await champResponse.json();
      if (champData.success) {
        const newCache = {};
        champData.images.forEach(img => {
          newCache[`champion_${img.championName}_square`] = img.imageUrl;
        });
        setImageCache(prev => ({ ...prev, ...newCache }));
      }
    } catch (err) {
      console.error('Failed to batch fetch champion images:', err);
    }

    // Batch fetch item images
    if (itemIds.length > 0) {
      try {
        const itemResponse = await fetch(`${API_BASE}/api/images/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: [...new Set(itemIds)] })
        });
        const itemData = await itemResponse.json();
        if (itemData.success) {
          const newCache = {};
          itemData.images.forEach(img => {
            newCache[`item_${img.itemId}`] = img.imageUrl;
          });
          setImageCache(prev => ({ ...prev, ...newCache }));
        }
      } catch (err) {
        console.error('Failed to batch fetch item images:', err);
      }
    }

    // Preload augment images (individual calls as no batch endpoint exists yet)
    if (augmentIds.length > 0) {
      const uniqueAugmentIds = [...new Set(augmentIds)];
      for (const augmentId of uniqueAugmentIds) {
        try {
          await getAugmentImageUrl(augmentId);
        } catch (err) {
          console.error(`Failed to preload augment image for ${augmentId}:`, err);
        }
      }
    }
  };

  // Function to call the prediction service
  const predictArenaWin = async (playerStats) => {
    setPredictionLoading(true);
    setPredictionError('');
    setPredictionResult(null); // Clear previous prediction

    try {
      const response = await fetch(`${API_BASE}/api/predict-arena-win`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playerStats),
      });
      const data = await response.json();

      if (data.success) {
        setPredictionResult(data);
      } else {
        setPredictionError(data.error || 'Failed to get prediction.');
      }
    } catch (err) {
      console.error('Error calling prediction API:', err);
      setPredictionError('Could not connect to prediction service.');
    } finally {
      setPredictionLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!gameName.trim() || !tagLine.trim()) {
      setError('Please enter both summoner name and tag');
      return;
    }

    setLoading(true);
    setError('');
    setPlayer(null);
    setMatches([]);
    setPredictionResult(null); // Clear prediction on new search
    setPredictionError('');

    try {
      // Step 1: Get PUUID
      const playerResponse = await fetch(`${API_BASE}/api/player/${encodeURIComponent(gameName.trim())}/${encodeURIComponent(tagLine.trim())}`);
      const playerData = await playerResponse.json();

      if (!playerData.success) {
        throw new Error(playerData.error || 'Player not found.');
      }
      setPlayer(playerData.player);

      // Step 2: Get Match History
      const matchesResponse = await fetch(`${API_BASE}/api/matches/${playerData.player.puuid}?count=20`);
      const matchesData = await matchesResponse.json();

      if (!matchesData.success) {
        throw new Error(matchesData.error || 'Failed to fetch match history.');
      }

      // Filter for Arena matches (queueId 1700)
      const arenaMatches = matchesData.matches.filter(match => match.queueId === 1700);
      setMatches(arenaMatches);

      // Step 3: Preload images for the fetched matches
      await preloadMatchImages(arenaMatches);

      // Step 4: After fetching and filtering matches, use the latest Arena match for prediction
      if (arenaMatches.length > 0) {
        const latestArenaMatchPlayerStats = arenaMatches[0].player; // Assuming latest match is first
        const statsForPrediction = {
          championId: latestArenaMatchPlayerStats.championId,
          kills: latestArenaMatchPlayerStats.kills,
          deaths: latestArenaMatchPlayerStats.deaths,
          assists: latestArenaMatchPlayerStats.assists,
          totalDamageDealt: latestArenaMatchPlayerStats.totalDamageDealt,
          totalDamageTaken: latestArenaMatchPlayerStats.totalDamageTaken,
          goldEarned: latestArenaMatchPlayerStats.goldEarned,
        };
        predictArenaWin(statsForPrediction);
      } else {
        setPredictionError('No Arena matches found to generate a prediction.');
      }

      // Predict placements for all matches
      if (arenaMatches.length > 0) {
        try {
          const response = await fetch(`${API_BASE}/api/predict-arena-placements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matches: arenaMatches.map(match => ({
                matchId: match.matchId,
                championId: match.player.championId,
                kills: match.player.kills,
                deaths: match.player.deaths,
                assists: match.player.assists,
                totalDamageDealt: match.player.totalDamageDealt,
                totalDamageTaken: match.player.totalDamageTaken,
                goldEarned: match.player.goldEarned
              }))
            })
          });
          const data = await response.json();
      // Corrected handleSearch function snippet
      if (data.success) {
          const placementMap = {};
          data.results.forEach(r => {
              placementMap[r.matchId] = {
                  placement: r.placement, // Add 1 for user-facing display
                  confidence: r.confidence
              };
          });
          setPlacementPredictions(placementMap);
          console.log('Placement predictions:', placementMap);
      }
        } catch (err) {
          console.error('Failed to get placement predictions:', err);
        }
      }

    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const formatGameDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    return `${hours}h ago`;
  };

  const getQueueType = (queueId) => {
    const queues = {
      420: 'Ranked Solo/Duo',
      440: 'Ranked Flex',
      450: 'ARAM',
      400: 'Normal Draft',
      430: 'Normal Blind',
      700: 'Clash',
      1700: 'Arena' 
    };
    return queues[queueId] || `Queue ${queueId}`;
  };

  const getPlacementText = (placement) => {
    switch (placement) {
        case 1: return '1st Place';
        case 2: return '2nd Place';
        case 3: return '3rd Place';
        case 4: return '4th Place';
        case 5: return '5th Place';
        case 6: return '6th Place';
        case 7: return '7th Place';
        case 8: return '8th Place';
        default: return 'N/A';
    }
  };

  const getOutcomeClass = (placement) => {
    return placement >= 1 && placement <= 4 ? 'win' : 'loss';
  };

  // Champion Avatar Component - Uses preloaded cache
  const ChampionAvatar = ({ championName, champLevel, size = 48 }) => {
    const imageUrl = imageCache[`champion_${championName}_square`];
    const [imageError, setImageError] = useState(false); // Local state for individual image errors

    useEffect(() => {
        setImageError(false); // Reset error when championName changes
    }, [championName]);

    return (
      <div className="champion-avatar" style={{ width: size, height: size }}>
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={championName}
            className="champion-image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="champion-fallback">
            <span>{championName ? championName.charAt(0) : '?'}</span>
          </div>
        )}
        <div className="champion-level">
          {champLevel}
        </div>
      </div>
    );
  };

  // Item Component - Uses preloaded cache
  const ItemSlot = ({ itemId }) => {
    const imageUrl = imageCache[`item_${itemId}`];
    const [imageError, setImageError] = useState(false); // Local state for individual image errors

    useEffect(() => {
        setImageError(false); // Reset error when itemId changes
    }, [itemId]);

    if (!itemId || itemId === 0) return <div className="item-slot empty"></div>;

    return (
      <div
        className="item-slot filled"
        title={`Item ID: ${itemId}`}
      >
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={`Item ${itemId}`}
            className="item-image"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="item-id">{itemId.toString().slice(-2)}</span>
        )}
      </div>
    );
  };

  // Augment Component - Uses preloaded cache and augmentData for name
  const AugmentSlot = ({ augmentId }) => {
    const imageUrl = imageCache[`augment_${augmentId}`];
    const [imageError, setImageError] = useState(false); // Local state for individual image errors

    useEffect(() => {
        setImageError(false); // Reset error when augmentId changes
    }, [augmentId]);

    const augmentInfo = augmentData.find(a => String(a.id) === String(augmentId) || a.apiName === augmentId);
    const displayName = augmentInfo?.name || `Augment ${augmentId}`;

    if (!augmentId || augmentId === 0) return null;

    return (
      <div className="augment-slot" title={displayName}>
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={displayName}
            className="augment-image"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="augment-fallback">
            <span>A</span>
          </div>
        )}
      </div>
    );
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };


  return (
    <div className="lol-arena-container">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h1>LoL Arena Stats & Predictor</h1>
          <p>Search for a player to view their Arena match history and get a win prediction!</p>
        </header>

        {/* Search Form */}
        <div className="search-container">
          <form onSubmit={handleSearch} className="search-form">
            <div className="form-group">
              <label htmlFor="gameName">Summoner Name</label>
              <input
                id="gameName"
                type="text"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                placeholder="e.g. anndrewkimm"
                className="form-input"
                disabled={loading}
                onKeyPress={handleKeyPress}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="tagLine">Tag</label>
              <input
                id="tagLine"
                type="text"
                value={tagLine}
                onChange={(e) => setTagLine(e.target.value)}
                placeholder="e.g. 9165"
                className="form-input"
                disabled={loading}
                onKeyPress={handleKeyPress}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="search-button"
            >
              {loading ? (
                <div className="loading-spinner"></div>
              ) : (
                <>
                  <Search size={20} />
                  Search Player
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Player Info */}
        {player && (
          <div className="player-profile">
            <h2 className="player-name">
              {player.gameName}#{player.tagLine}
            </h2>
            {/* Prediction Result Display */}
            <div className="prediction-section">
                <h3>Arena Win Prediction (Based on Latest Match):</h3>
                {predictionLoading && <p>Getting prediction...</p>}
                {predictionError && <p className="error-message">{predictionError}</p>}
              {predictionResult && (
                  <div className="prediction-card">
                      <p>
                          <strong>Predicted Placement:</strong>{' '}
                          <span className={`prediction-placement placement-${predictionResult.placement}`}>
                              {getPlacementText(predictionResult.placement)}
                          </span>
                      </p>
                      <p>
                          <strong>Confidence:</strong> {(predictionResult.confidence * 100).toFixed(1)}%
                      </p>
                      <p>
                          <strong>Expected Outcome:</strong>{' '}
                          <span className={predictionResult.placement <= 4 ? 'prediction-win' : 'prediction-loss'}>
                              {predictionResult.placement <= 4 ? 'TOP 4 (WIN)' : 'BOTTOM 4 (LOSS)'}
                          </span>
                      </p>
                      <p className="prediction-note">
                          *This prediction is based on your latest Arena match statistics.*
                      </p>
                  </div>
              )}
                {!predictionLoading && !predictionResult && !predictionError && matches.length > 0 && (
                    <p className="no-prediction">Prediction not yet generated for this session. Search for a player to generate one!</p>
                )}
                 {!predictionLoading && !predictionResult && !predictionError && matches.length === 0 && (
                    <p className="no-prediction">No Arena matches found to generate a prediction.</p>
                )}
            </div>
          </div>
        )}

        {/* Match History */}
        {matches.length > 0 && (
          <div className="match-history-container">
            <h3 className="match-history-title">Recent Arena Matches</h3>
            <div className="match-list">
              {matches.map((match) => (
                <div
                  key={match.matchId}
                  className={`match-item ${getOutcomeClass(match.player.placement)}`}
                >
                  <div className="match-left">
                    <div className="match-result">
                      <div className={`result-text ${match.player.win ? 'win' : 'loss'}`}>
                        {getPlacementText(match.player.placement)}
                      </div>
                      <div className="time-ago">
                        {formatTimeAgo(match.gameCreation)}
                      </div>
                    </div>
                    
                    <ChampionAvatar 
                      championName={match.player.championName}
                      champLevel={match.player.champLevel}
                    />
                    
                    <div className="match-info">
                      <div className="champion-name">{match.player.championName}</div>
                      <div className="queue-type">{getQueueType(match.queueId)}</div>
                      <div className="game-duration">
                        <Clock size={12} />
                        {formatGameDuration(match.gameDuration)}
                      </div>
                    </div>
                  </div>

                  <div className="kda-section">
                    <div className="kda-display">
                      <span className="kills">{match.player.kills}</span>
                      <span className="kda-separator">/</span>
                      <span className="deaths">{match.player.deaths}</span>
                      <span className="kda-separator">/</span>
                      <span className="assists">{match.player.assists}</span>
                    </div>
                    <div className="kda-ratio">
                      {((match.player.kills + match.player.assists) / Math.max(match.player.deaths, 1)).toFixed(2)} KDA
                    </div>
                  </div>

                  <div className="items-section">
                    <div className="items-row">
                      {/* Items */}
                      {Array.from({ length: 7 }, (_, i) => { // Arena has 7 item slots
                        const itemId = match.player.items && match.player.items[i];
                        return <ItemSlot key={i} itemId={itemId} />;
                      })}
                    </div>
                    
                    {/* Augments for Arena mode */}
                    {match.player.augments && match.player.augments.length > 0 && (
                      <div className="augments-row">
                        {match.player.augments.map((augmentId, i) => (
                          <AugmentSlot key={i} augmentId={augmentId} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="stats-section">
                    <div className="stats-grid">
                      <div>
                        <div className="stat-label">CS</div>
                        <div className="stat-value">{match.player.totalMinionsKilled || 0}</div>
                      </div>
                      <div>
                        <div className="stat-label">Gold</div>
                        <div className="stat-value gold">
                          {(match.player.goldEarned / 1000).toFixed(1)}k
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Damage Dealt</div>
                        <div className="stat-value">{(match.player.totalDamageDealt / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="stat-label">Damage Taken</div>
                        <div className="stat-value">{(match.player.totalDamageTaken / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                    {/* Vision score is typically not relevant for Arena, but keeping it if it was in your original */}
                    {match.player.visionScore !== undefined && (
                        <div className="vision-score">
                            <span className="label">Vision: </span>
                            <span className="value">{match.player.visionScore || 0}</span>
                        </div>
                    )}
                  </div>

                  {placementPredictions[match.matchId] && (
                    <div className="placement-prediction">
                      <strong>Predicted Placement:</strong> {placementPredictions[match.matchId].placement}
                      <br />
                      <strong>Confidence:</strong> {(placementPredictions[match.matchId].confidence * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading match history...</p>
          </div>
        )}

        {/* No matches found after search */}
        {player && matches.length === 0 && !loading && !error && (
          <div className="no-matches">
            <p>No recent Arena matches found for this player.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoLArena;