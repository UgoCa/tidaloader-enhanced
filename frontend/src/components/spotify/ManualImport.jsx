import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { api } from "../../api/client";
import { downloadManager } from "../../utils/downloadManager";
import { useToastStore } from "../../stores/toastStore";

const SCORE_PERFECT = 0.85;
const SCORE_REVIEW = 0.50;

const formatDuration = (ms) => {
  if (!ms) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const ScoreBadge = ({ score }) => {
  const pct = Math.round(score * 100);
  const color =
    score >= SCORE_PERFECT
      ? "text-green-400 bg-green-500/10"
      : score >= SCORE_REVIEW
        ? "text-yellow-400 bg-yellow-500/10"
        : "text-red-400 bg-red-500/10";
  return (
    <span class={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${color}`}>
      {pct}%
    </span>
  );
};

const Spinner = ({ size = "h-5 w-5" }) => (
  <svg class={`animate-spin ${size}`} fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const formatDur = (s) => (!s || s < 0 ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

function TrackRow({ t, showScore = true, expandedTrack, searchingTrack, manualQuery, manualResults, manualLoading, onToggleExpand, onToggleSearch, onManualQueryChange, onManualSearch, onDownload, onSkip, onSelectCandidate }) {
  const idx = t._idx;
  const isExpanded = expandedTrack === idx;
  const isSearching = searchingTrack === idx;
  const candidates = (t.candidates || []).filter(c => c.tidal_id !== t.tidal_id);

  return (
    <div class="border border-border-light rounded-lg overflow-hidden mb-2">
      <div class="px-4 py-3 flex items-center gap-3 bg-surface hover:bg-surface-alt/30 transition-colors">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-text-muted truncate">
            {t.spotify_artist} - {t.spotify_title}
          </p>
          {t.tidal_exists ? (
            <p class="text-sm text-text font-medium truncate mt-0.5">
              Tidal: {t.artist} - {t.title}
              {t.album ? <span class="text-text-muted font-normal"> ({t.album})</span> : ""}
            </p>
          ) : (
            <p class="text-sm text-red-400 mt-0.5 italic">No match found</p>
          )}
        </div>
        {showScore && t.tidal_exists && <ScoreBadge score={t.match_score} />}
        <div class="flex items-center gap-1.5 flex-shrink-0">
          {candidates.length > 0 && (
            <button
              onClick={() => onToggleExpand(idx)}
              class="text-xs px-2 py-1 rounded text-primary hover:bg-primary/10 transition-colors"
            >
              {isExpanded ? "Hide" : `${candidates.length} alt${candidates.length > 1 ? "s" : ""}`}
            </button>
          )}
          <button
            onClick={() => onToggleSearch(idx, `${t.spotify_artist} - ${t.spotify_title}`)}
            class="text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-surface-alt transition-colors"
            title="Search manually"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </button>
          {t.tidal_exists && (
            <>
              <button
                onClick={() => onDownload(idx)}
                class="text-xs px-2 py-1 rounded text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                title="Add to queue"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button
                onClick={() => onSkip(idx)}
                class="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                title="Skip"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alternatives */}
      {isExpanded && candidates.length > 0 && (
        <div class="border-t border-border-light bg-surface-alt/30 p-2 space-y-1 max-h-48 overflow-y-auto">
          <p class="text-xs text-text-muted px-2 pb-1">Select a different match:</p>
          {candidates.map((c, ci) => (
            <button key={ci} onClick={() => onSelectCandidate(idx, c)} class="w-full text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors flex items-center gap-3 group">
              <div class="flex-1 min-w-0">
                <p class="text-sm text-text truncate">{c.artist} - {c.title}</p>
                <p class="text-xs text-text-muted truncate">{c.album || "Unknown Album"} {c.duration ? `· ${formatDur(c.duration)}` : ""}</p>
              </div>
              <ScoreBadge score={c.score} />
              <span class="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
            </button>
          ))}
        </div>
      )}

      {/* Manual search */}
      {isSearching && (
        <div class="border-t border-border-light bg-surface-alt/30 p-3 space-y-2">
          <div class="flex gap-2">
            <input
              type="text"
              value={manualQuery}
              onInput={(e) => onManualQueryChange(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && onManualSearch()}
              placeholder="Search Tidal..."
              class="input-field flex-1 text-xs py-1.5"
            />
            <button onClick={onManualSearch} disabled={manualLoading} class="btn-primary text-xs px-3 py-1.5">
              {manualLoading ? "..." : "Search"}
            </button>
          </div>
          {manualResults.length > 0 && (
            <div class="space-y-1 max-h-48 overflow-y-auto">
              {manualResults.map((c, ci) => (
                <button key={ci} onClick={() => onSelectCandidate(idx, c)} class="w-full text-left px-3 py-2 rounded-md hover:bg-primary/10 transition-colors flex items-center gap-3 group">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-text truncate">{c.artist} - {c.title}</p>
                    <p class="text-xs text-text-muted truncate">{c.album || "Unknown Album"} {c.duration ? `· ${formatDur(c.duration)}` : ""}</p>
                  </div>
                  <ScoreBadge score={c.score} />
                  <span class="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ManualImport() {
  // Phase: "input" → "fetching" → "fetched" → "matching" → "review"
  const [phase, setPhase] = useState("input");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);
  const [generatingM3U8, setGeneratingM3U8] = useState(false);

  // Matching progress
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0, matches: 0 });

  // Review state
  const [expandedSection, setExpandedSection] = useState("review");
  const [expandedTrack, setExpandedTrack] = useState(null);
  const [searchingTrack, setSearchingTrack] = useState(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState([]);
  const [manualLoading, setManualLoading] = useState(false);

  const addToast = useToastStore((state) => state.addToast);

  // ===== Fetch playlist tracks from Spotify (no validation) =====
  const handleFetch = async () => {
    if (!playlistUrl.trim()) return;
    setPhase("fetching");
    setError(null);
    setTracks([]);

    let pollInterval;
    let isComplete = false;

    try {
      const { progress_id } = await api.generateSpotifyPlaylist(playlistUrl.trim(), false);

      const poll = async () => {
        if (isComplete) return;
        try {
          const data = await api.getSpotifySyncProgress(progress_id);
          if (data.status === "error") {
            setError(data.messages?.[data.messages.length - 1]?.text || "Unknown error");
            setPhase("input");
            isComplete = true;
            clearInterval(pollInterval);
            return;
          }
          if (data.status === "complete" || data.status === "waiting_confirmation") {
            if (data.tracks && data.tracks.length > 0) {
              setTracks(data.tracks.map(t => ({
                ...t,
                spotify_title: t.spotify_title || t.title,
                spotify_artist: t.spotify_artist || t.artist,
                match_score: 0,
                candidates: [],
                tidal_exists: false,
                tidal_id: null,
              })));
              setPhase("fetched");
              addToast(`Fetched ${data.tracks.length} tracks from Spotify`, "success");
            } else {
              setError("Playlist appears to be empty.");
              setPhase("input");
            }
            isComplete = true;
            clearInterval(pollInterval);
          }
        } catch (e) {
          console.warn("Poll error", e);
        }
      };

      pollInterval = setInterval(poll, 1000);
      poll();
    } catch (err) {
      setError(err.message);
      setPhase("input");
    }
  };

  // ===== Run matching against Tidal for all tracks =====
  const handleMatchAll = async () => {
    setPhase("matching");
    setMatchProgress({ current: 0, total: tracks.length, matches: 0 });

    let matchCount = 0;
    const concurrency = 3;
    const updated = [...tracks];

    for (let i = 0; i < updated.length; i += concurrency) {
      const batch = updated.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (track) => {
          try {
            const data = await api.searchTidalForTrack(
              `${track.spotify_artist} - ${track.spotify_title}`
            );
            return data.candidates || [];
          } catch {
            return [];
          }
        })
      );

      results.forEach((candidates, batchIdx) => {
        const globalIdx = i + batchIdx;
        updated[globalIdx] = { ...updated[globalIdx], candidates };
        if (candidates.length > 0) {
          const best = candidates[0];
          updated[globalIdx].tidal_id = best.tidal_id;
          updated[globalIdx].tidal_artist_id = best.artist_id;
          updated[globalIdx].tidal_album_id = best.album_id;
          updated[globalIdx].tidal_exists = true;
          updated[globalIdx].match_score = best.score;
          updated[globalIdx].title = best.title;
          updated[globalIdx].artist = best.artist;
          updated[globalIdx].album = best.album;
          updated[globalIdx].cover = best.cover;
          updated[globalIdx].track_number = best.track_number;
          matchCount++;
        }
      });

      const done = Math.min(i + concurrency, updated.length);
      setMatchProgress({ current: done, total: updated.length, matches: matchCount });
      setTracks([...updated]);
    }

    setTracks([...updated]);
    setPhase("review");

    // Auto-open the section that needs attention
    const reviewCount = updated.filter(t => t.tidal_exists && t.match_score < SCORE_PERFECT).length;
    const missingCount = updated.filter(t => !t.tidal_exists).length;
    if (reviewCount > 0) setExpandedSection("review");
    else if (missingCount > 0) setExpandedSection("missing");
    else setExpandedSection("perfect");
  };

  // ===== Track operations =====
  const selectCandidate = (trackIdx, candidate) => {
    setTracks(prev => {
      const u = [...prev];
      u[trackIdx] = {
        ...u[trackIdx],
        tidal_id: candidate.tidal_id,
        tidal_artist_id: candidate.artist_id,
        tidal_album_id: candidate.album_id,
        tidal_exists: true,
        title: candidate.title,
        artist: candidate.artist,
        album: candidate.album,
        cover: candidate.cover,
        track_number: candidate.track_number,
        match_score: candidate.score,
      };
      return u;
    });
    setExpandedTrack(null);
    setSearchingTrack(null);
  };

  const skipTrack = (trackIdx) => {
    setTracks(prev => {
      const u = [...prev];
      u[trackIdx] = { ...u[trackIdx], tidal_exists: false, tidal_id: null, match_score: 0, candidates: [] };
      return u;
    });
  };

  const handleToggleExpand = (idx) => {
    setExpandedTrack(prev => prev === idx ? null : idx);
    setSearchingTrack(null);
  };

  const handleToggleSearch = (idx, defaultQuery) => {
    setSearchingTrack(prev => {
      if (prev === idx) return null;
      setExpandedTrack(null);
      setManualQuery(defaultQuery);
      setManualResults([]);
      return idx;
    });
  };

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setManualLoading(true);
    try {
      const data = await api.searchTidalForTrack(manualQuery);
      setManualResults(data.candidates || []);
    } catch (e) {
      console.error("Manual search failed:", e);
    } finally {
      setManualLoading(false);
    }
  };

  // ===== Download matched tracks =====
  const handleDownloadAll = () => {
    const matched = tracks
      .filter(t => t.tidal_exists && t.tidal_id)
      .map(t => ({
        ...t,
        tidal_track_id: t.tidal_id,
      }));

    if (matched.length === 0) {
      addToast("No matched tracks to download", "error");
      return;
    }

    downloadManager.addToServerQueue(matched).then((result) => {
      addToast(`Added ${result.added} tracks to download queue`, "success");
    });
  };

  const handleDownloadSingle = (idx) => {
    const t = tracks[idx];
    if (!t?.tidal_exists) return;
    downloadManager.addToServerQueue([{ ...t, tidal_track_id: t.tidal_id }]);
    addToast(`Added "${t.title}" to queue`, "success");
  };

  // ===== M3U8 generation =====
  const handleGenerateM3U8 = async () => {
    const validatedTracks = tracks.filter(t => t.tidal_exists && t.tidal_id);
    if (validatedTracks.length === 0) {
      addToast("No matched tracks available", "error");
      return;
    }
    if (!playlistName.trim()) {
      addToast("Please enter a playlist name", "error");
      return;
    }
    setGeneratingM3U8(true);
    try {
      const result = await api.generateSpotifyM3U8(playlistName.trim(), validatedTracks);
      addToast(`Playlist created: ${result.included_count} tracks included`, "success");
    } catch (e) {
      addToast(`Failed: ${e.message}`, "error");
    } finally {
      setGeneratingM3U8(false);
    }
  };

  // ===== Categorize tracks =====
  const perfect = [], review = [], missing = [];
  tracks.forEach((t, i) => {
    const item = { ...t, _idx: i };
    if (!t.tidal_exists) missing.push(item);
    else if (t.match_score >= SCORE_PERFECT) perfect.push(item);
    else review.push(item);
  });
  const totalMatched = perfect.length + review.length;

  // ===== RENDER =====
  return (
    <div class="space-y-4 sm:space-y-6">
      {/* URL Input — always visible */}
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
        <div class="sm:col-span-3">
          <label class="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
            Spotify Playlist URL
          </label>
          <input
            type="text"
            value={playlistUrl}
            onInput={(e) => setPlaylistUrl(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !["fetching", "matching"].includes(phase) && playlistUrl.trim() && handleFetch()}
            placeholder="https://open.spotify.com/playlist/..."
            disabled={phase === "fetching" || phase === "matching"}
            class="input-field w-full h-[42px] text-sm"
          />
        </div>
        <div class="sm:col-span-1 flex items-end">
          <button
            onClick={handleFetch}
            disabled={phase === "fetching" || phase === "matching" || !playlistUrl.trim()}
            class="btn-primary w-full h-[42px] flex items-center justify-center gap-2 text-sm"
          >
            {phase === "fetching" ? <Spinner /> : (
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
              </svg>
            )}
            {phase === "fetching" ? "Fetching..." : "Fetch Playlist"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg animate-fadeIn">
          <p class="text-sm text-red-500 flex items-center gap-2">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </p>
        </div>
      )}

      {/* ===== PHASE: Fetching indicator ===== */}
      {phase === "fetching" && (
        <div class="p-6 bg-surface-alt border border-border-light rounded-lg flex items-center justify-center gap-3 text-text-muted">
          <Spinner />
          <span>Fetching tracks from Spotify...</span>
        </div>
      )}

      {/* ===== PHASE: Fetched — show tracklist preview + "Find Matches" button ===== */}
      {phase === "fetched" && tracks.length > 0 && (
        <div class="space-y-4 animate-fadeIn">
          <div class="flex items-center justify-between pb-2 border-b border-border-light">
            <div class="flex items-center gap-3">
              <h3 class="text-lg font-bold text-text">Playlist Tracks</h3>
              <span class="px-2 py-0.5 rounded-full bg-surface-alt border border-border-light text-xs font-mono text-text-muted">
                {tracks.length} tracks
              </span>
            </div>
            <button onClick={handleMatchAll} class="btn-primary px-5 py-2 text-sm flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Find Matches on Tidal
            </button>
          </div>

          <div class="max-h-[440px] overflow-y-auto space-y-1 pr-1">
            {tracks.map((t, i) => (
              <div key={i} class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-alt/30 transition-colors">
                <span class="text-text-muted text-xs w-6 text-right tabular-nums flex-shrink-0">{i + 1}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-text font-medium truncate">{t.spotify_title}</p>
                  <p class="text-xs text-text-muted truncate">
                    {t.spotify_artist}
                    {t.spotify_album ? <span class="opacity-50"> · {t.spotify_album}</span> : ""}
                  </p>
                </div>
                {t.duration_ms && (
                  <span class="text-xs text-text-muted tabular-nums flex-shrink-0">{formatDuration(t.duration_ms)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PHASE: Matching — progress bar ===== */}
      {phase === "matching" && (
        <div class="space-y-4 animate-fadeIn">
          <div class="p-6 bg-surface-alt border border-border-light rounded-lg space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-text font-medium flex items-center gap-2">
                <Spinner size="h-4 w-4" />
                Finding matches on Tidal...
              </span>
              <span class="text-text-muted tabular-nums">
                {matchProgress.current}/{matchProgress.total}
              </span>
            </div>
            <div class="h-2 bg-surface rounded-full overflow-hidden">
              <div
                class="h-full bg-primary transition-all duration-300"
                style={{ width: `${matchProgress.total > 0 ? Math.round((matchProgress.current / matchProgress.total) * 100) : 0}%` }}
              />
            </div>
            <div class="flex items-center justify-between text-xs text-text-muted">
              <span>{Math.round((matchProgress.current / Math.max(matchProgress.total, 1)) * 100)}% complete</span>
              <span>
                <span class="text-green-400 font-medium">{matchProgress.matches}</span> matches found
              </span>
            </div>
          </div>

          {/* Live preview of tracks as they get matched */}
          <div class="max-h-[360px] overflow-y-auto space-y-1 pr-1">
            {tracks.map((t, i) => (
              <div key={i} class={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${t.tidal_exists ? "bg-green-500/5" : i < matchProgress.current ? "bg-red-500/5" : "opacity-50"}`}>
                <span class="text-text-muted text-xs w-6 text-right tabular-nums flex-shrink-0">{i + 1}</span>
                {t.tidal_exists ? (
                  <svg class="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                ) : i < matchProgress.current ? (
                  <svg class="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <div class="w-4 h-4 flex-shrink-0" />
                )}
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-text truncate">{t.spotify_artist} - {t.spotify_title}</p>
                </div>
                {t.tidal_exists && <ScoreBadge score={t.match_score} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== PHASE: Review — categorized results ===== */}
      {phase === "review" && (
        <div class="space-y-4 animate-fadeIn">
          {/* Summary header */}
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border-light">
            <div class="flex items-center gap-3">
              <h3 class="text-lg font-bold text-text">Match Results</h3>
              <span class="px-2 py-0.5 rounded-full bg-surface-alt border border-border-light text-xs font-mono text-text-muted">
                {totalMatched}/{tracks.length} matched
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                onClick={() => { setPhase("fetched"); setTracks(prev => prev.map(t => ({ ...t, tidal_exists: false, tidal_id: null, match_score: 0, candidates: [] }))); }}
                class="text-xs px-3 py-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt transition-colors"
              >
                Re-fetch
              </button>
              <button onClick={handleMatchAll} class="text-xs px-3 py-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Re-match All
              </button>
            </div>
          </div>

          {/* Category tabs */}
          <div class="flex gap-2 flex-wrap">
            <button
              onClick={() => setExpandedSection(expandedSection === "perfect" ? null : "perfect")}
              class={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${expandedSection === "perfect" ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-border-light text-text-muted hover:text-text hover:border-border"}`}
            >
              <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
              {perfect.length} Perfect
            </button>
            <button
              onClick={() => setExpandedSection(expandedSection === "review" ? null : "review")}
              class={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${expandedSection === "review" ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" : "border-border-light text-text-muted hover:text-text hover:border-border"}`}
            >
              <svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {review.length} Review
            </button>
            <button
              onClick={() => setExpandedSection(expandedSection === "missing" ? null : "missing")}
              class={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${expandedSection === "missing" ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-border-light text-text-muted hover:text-text hover:border-border"}`}
            >
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              {missing.length} Missing
            </button>
          </div>

          {/* Section content */}
          <div class="max-h-[440px] overflow-y-auto pr-1">
            {/* Perfect */}
            {expandedSection === "perfect" && (
              <div>
                {perfect.length === 0 ? (
                  <p class="text-sm text-text-muted text-center py-6">No perfect matches.</p>
                ) : (
                  <>
                    <p class="text-xs text-text-muted mb-2">High confidence matches. These will download correctly.</p>
                    <div class="space-y-0.5">
                      {perfect.map(t => (
                        <div key={t._idx}>
                          <div class="px-3 py-1.5 flex items-center gap-2 rounded hover:bg-surface-alt/30 group">
                            <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                            <span class="text-sm text-text truncate flex-1">{t.artist} - {t.title}</span>
                            <ScoreBadge score={t.match_score} />
                            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleDownloadSingle(t._idx)} class="text-xs px-1.5 py-0.5 rounded text-text-muted hover:text-primary hover:bg-primary/10" title="Add to queue">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              </button>
                              <button onClick={() => handleToggleSearch(t._idx, `${t.spotify_artist} - ${t.spotify_title}`)} class="text-xs px-1.5 py-0.5 rounded text-text-muted hover:text-text hover:bg-surface-alt" title="Change match">
                                edit
                              </button>
                            </div>
                          </div>
                          {(expandedTrack === t._idx || searchingTrack === t._idx) && (
                            <div class="mt-1 mb-1"><TrackRow t={t} expandedTrack={expandedTrack} searchingTrack={searchingTrack} manualQuery={manualQuery} manualResults={manualResults} manualLoading={manualLoading} onToggleExpand={handleToggleExpand} onToggleSearch={handleToggleSearch} onManualQueryChange={setManualQuery} onManualSearch={handleManualSearch} onDownload={handleDownloadSingle} onSkip={skipTrack} onSelectCandidate={selectCandidate} /></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Review */}
            {expandedSection === "review" && (
              <div>
                {review.length === 0 ? (
                  <p class="text-sm text-text-muted text-center py-6">No tracks need review — all matches are great!</p>
                ) : (
                  <>
                    <p class="text-xs text-text-muted mb-2">Lower confidence. Verify the match or pick an alternative.</p>
                    {review.map(t => <TrackRow key={t._idx} t={t} expandedTrack={expandedTrack} searchingTrack={searchingTrack} manualQuery={manualQuery} manualResults={manualResults} manualLoading={manualLoading} onToggleExpand={handleToggleExpand} onToggleSearch={handleToggleSearch} onManualQueryChange={setManualQuery} onManualSearch={handleManualSearch} onDownload={handleDownloadSingle} onSkip={skipTrack} onSelectCandidate={selectCandidate} />)}
                  </>
                )}
              </div>
            )}

            {/* Missing */}
            {expandedSection === "missing" && (
              <div>
                {missing.length === 0 ? (
                  <p class="text-sm text-text-muted text-center py-6">All tracks matched!</p>
                ) : (
                  <>
                    <p class="text-xs text-text-muted mb-2">No automatic match found. Search manually or skip.</p>
                    {missing.map(t => <TrackRow key={t._idx} t={t} showScore={false} expandedTrack={expandedTrack} searchingTrack={searchingTrack} manualQuery={manualQuery} manualResults={manualResults} manualLoading={manualLoading} onToggleExpand={handleToggleExpand} onToggleSearch={handleToggleSearch} onManualQueryChange={setManualQuery} onManualSearch={handleManualSearch} onDownload={handleDownloadSingle} onSkip={skipTrack} onSelectCandidate={selectCandidate} />)}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-3 border-t border-border-light">
            {/* M3U8 generation */}
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <input
                type="text"
                value={playlistName}
                onInput={(e) => setPlaylistName(e.target.value)}
                placeholder="Playlist name (for M3U8)"
                class="input-field flex-1 h-[38px] text-sm min-w-0"
              />
              <button
                onClick={handleGenerateM3U8}
                disabled={generatingM3U8 || !playlistName.trim() || totalMatched === 0}
                class="btn-surface h-[38px] px-3 text-sm flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                title="Generate M3U8 playlist file"
              >
                {generatingM3U8 ? <Spinner size="h-4 w-4" /> : (
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                )}
                M3U8
              </button>
            </div>

            {/* Download all matched */}
            <button
              onClick={handleDownloadAll}
              disabled={totalMatched === 0}
              class="btn-primary h-[38px] px-5 text-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Download {totalMatched} Matched Track{totalMatched !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
