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

  const API_BASE = 'http://localhost:3001';

  // Get champion image URL
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

  // Get item image URL
  const getItemImageUrl = async (itemId) => {
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


  // Preload images for better UX
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
  };

  const searchPlayer = async (e) => {
    e.preventDefault();
    
    if (!gameName.trim() || !tagLine.trim()) {
      setError('Please enter both summoner name and tag');
      return;
    }

    setLoading(true);
    setError('');
    setPlayer(null);
    setMatches([]);

    try {
      // Step 1: Get player info
      const playerResponse = await fetch(`${API_BASE}/api/player/${encodeURIComponent(gameName.trim())}/${encodeURIComponent(tagLine.trim())}`);
      const playerData = await playerResponse.json();

      if (!playerData.success) {
        throw new Error(playerData.error);
      }

      setPlayer(playerData.player);

      // Step 2: Get match history
      const matchResponse = await fetch(`${API_BASE}/api/matches/${playerData.player.puuid}?count=10`);
      const matchData = await matchResponse.json();

      if (!matchData.success) {
        throw new Error(matchData.error);
      }

      setMatches(matchData.matches);

      // Step 3: Preload images
      await preloadMatchImages(matchData.matches);

    } catch (err) {
      setError(err.message || 'Failed to fetch player data');
      console.error('Search error:', err);
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
      1700: 'Arena' // Arena queue ID
    };
    return queues[queueId] || `Queue ${queueId}`;
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchPlayer(e);
    }
  };

  useEffect(() => {
    fetch('/api/augments')
      .then(res => res.json())
      .then(data => {
        if (data.success) setAugmentData(data.augments);
      });
  }, []);

  // Champion Avatar Component
  const ChampionAvatar = ({ championName, champLevel, size = 48 }) => {
    const [imageUrl, setImageUrl] = useState(null);
    const [imageError, setImageError] = useState(false);

    React.useEffect(() => {
      const loadImage = async () => {
        const url = await getChampionImageUrl(championName);
        setImageUrl(url);
      };
      loadImage();
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
            <span>{championName.charAt(0)}</span>
          </div>
        )}
        <div className="champion-level">
          {champLevel}
        </div>
      </div>
    );
  };

  // Item Component
  const ItemSlot = ({ itemId, index }) => {
    const [imageUrl, setImageUrl] = useState(null);
    const [imageError, setImageError] = useState(false);

    React.useEffect(() => {
      if (itemId && itemId !== 0) {
        const loadImage = async () => {
          const url = await getItemImageUrl(itemId);
          setImageUrl(url);
        };
        loadImage();
      }
    }, [itemId]);

    return (
      <div
        className={`item-slot ${itemId && itemId !== 0 ? 'filled' : 'empty'}`}
        title={itemId ? `Item ${itemId}` : 'Empty slot'}
      >
        {itemId && itemId !== 0 ? (
          imageUrl && !imageError ? (
            <img
              src={imageUrl}
              alt={`Item ${itemId}`}
              className="item-image"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="item-id">{itemId.toString().slice(-2)}</span>
          )
        ) : null}
      </div>
    );
  };

  // Augment Component
  const AugmentSlot = ({ augmentId }) => {
    const [imageError, setImageError] = useState(false);

    if (!augmentId || augmentId === 0) return null;

    const augmentInfo = augmentData.find(
      a => String(a.id) === String(augmentId) || a.apiName === augmentId
    );

    // If augmentInfo is missing, show fallback and DO NOT render <img>
    if (!augmentInfo) {
      console.log('Missing augmentInfo for augmentId:', augmentId);
      return (
        <div className="augment-slot" title="Augment (unknown)">
          <div className="augment-fallback">
            <span>?</span>
          </div>
        </div>
      );
    }

    const imageKey = augmentInfo.apiName;
    const displayName = augmentInfo.name;
    const imageUrl = `/api/images/augment/${imageKey}`;

    return (
      <div className="augment-slot" title={`Augment ${displayName}`}>
        {!imageError ? (
          <img
            src={imageUrl}
            alt={`Augment ${displayName}`}
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

  return (
    <div className="lol-arena-container">
      <div className="container">
        {/* Header */}
        <div className="header">
          <h1>LoL Arena</h1>
          <p>League of Legends Match History Lookup</p>
        </div>

        {/* Search Form */}
        <div className="search-container">
          <div className="search-form">
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
              />
            </div>
            <button
              onClick={searchPlayer}
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
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {/* Player Info */}
        {player && (
          <div className="player-info">
            <h2 className="player-name">
              {player.gameName}#{player.tagLine}
            </h2>
            <p className="player-puuid">PUUID: {player.puuid.substring(0, 8)}...</p>
          </div>
        )}

        {/* Match History */}
        {matches.length > 0 && (
          <div className="match-history-container">
            <h3 className="match-history-title">Match History</h3>
            <div className="match-list">
              {matches.map((match, index) => (
                <div
                  key={match.matchId}
                  className={`match-item ${match.player.win ? 'win' : 'loss'}`}
                >
                  <div className="match-left">
                    <div className="match-result">
                      <div className={`result-text ${match.player.win ? 'win' : 'loss'}`}>
                        {match.player.win ? 'Victory' : 'Defeat'}
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
                      {Array.from({ length: 6 }, (_, i) => {
                        const itemId = match.player.items && match.player.items[i];
                        return <ItemSlot key={i} itemId={itemId} index={i} />;
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
                    </div>
                    <div className="vision-score">
                      <span className="label">Vision: </span>
                      <span className="value">{match.player.visionScore || 0}</span>
                    </div>
                  </div>
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

        {/* No matches */}
        {player && matches.length === 0 && !loading && !error && (
          <div className="no-matches">
            <p>No recent matches found for this player.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoLArena;