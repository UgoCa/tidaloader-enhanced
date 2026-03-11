import uuid
import json
import asyncio
import re
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.models import SpotifyGenerateRequest, SpotifyM3U8Request
from api.auth import require_auth, require_auth_stream
from api.state import lb_progress_queues
from api.services.spotify import process_spotify_playlist, generate_spotify_m3u8

router = APIRouter()
logger = logging.getLogger(__name__)

from api.clients.spotify import SpotifyClient


class TrackSearchRequest(BaseModel):
    query: str


class ConfirmSyncRequest(BaseModel):
    tracks: List[Dict[str, Any]]

@router.get("/api/spotify/search")
async def search_spotify_playlists(
    query: str,
    user: str = Depends(require_auth)
):
    """Search for Spotify playlists"""
    client = SpotifyClient()
    try:
        # Check if query is a direct URL/URI
        if "spotify.com" in query or "spotify:playlist:" in query:
            # It's likely a URL/URI
            playlist_id = extract_spotify_id(query)
            if playlist_id and len(playlist_id) > 5: # Basic sanity check
                specific_playlist = await client.get_playlist_metadata(playlist_id)
                if specific_playlist:
                    return {"items": [specific_playlist]}
                # If specific fetch fails or returns None, fallback to empty or search? 
                # Let's return empty to avoid searching for the URL string which gives garbage.
                return {"items": []}

        playlists = await client.search_playlists(query)
        return {"items": playlists}
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()

@router.get("/api/spotify/playlist/{playlist_id}")
async def get_spotify_playlist_tracks(
    playlist_id: str,
    user: str = Depends(require_auth)
):
    """Get tracks from a Spotify playlist"""
    client = SpotifyClient()
    try:
        tracks, _ = await client.get_playlist_tracks(playlist_id)
        return {"items": tracks}
    except Exception as e:
        logger.error(f"Failed to fetch playlist tracks: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        await client.close()

def extract_spotify_id(url: str) -> str:
    # Match playlist ID from various formats
    # https://open.spotify.com/playlist/37i9dQZF1DX5Ejj077clxu
    # spotify:playlist:37i9dQZF1DX5Ejj077clxu
    
    # Try Regex
    match = re.search(r'playlist[:/]([a-zA-Z0-9]+)', url)
    if match:
        return match.group(1)
    
    # If it looks like a clean ID (22 chars alphanumeric usually)
    if re.match(r'^[a-zA-Z0-9]{22}$', url):
        return url
        
    return url.split('/')[-1].split('?')[0] # Fallback basic split

@router.post("/api/spotify/generate")
async def generate_spotify_playlist(
    request: SpotifyGenerateRequest,
    background_tasks: BackgroundTasks,
    username: str = Depends(require_auth)
):
    playlist_id = extract_spotify_id(request.playlist_url)
    if not playlist_id:
         raise HTTPException(status_code=400, detail="Invalid Spotify Playlist URL")

    progress_id = str(uuid.uuid4())
    
    background_tasks.add_task(
        process_spotify_playlist,
        playlist_id,
        progress_id,
        request.should_validate
    )
    
    return {"progress_id": progress_id}

@router.get("/api/spotify/progress/{progress_id}")
async def get_spotify_progress(
    progress_id: str,
    user: str = Depends(require_auth)
):
    """
    Polling endpoint for progress updates.
    Returns the current state from memory.
    """
    from api.state import import_states
    from fastapi.responses import JSONResponse
    
    headers = {"Cache-Control": "no-store, max-age=0"}
    
    if progress_id not in import_states:
        logger.warning(f"POLL MISS: {progress_id} not found in {list(import_states.keys())}")
        return JSONResponse(content={
            "status": "pending",
            "messages": [],
            "current": 0,
            "total": 0,
            "matches": 0
        }, headers=headers)
    
    state = import_states[progress_id]
    logger.info(f"POLL HIT: {progress_id} -> Status={state.get('status')} MsgCount={len(state.get('messages', []))}")
    return JSONResponse(content=state, headers=headers)


@router.post("/api/spotify/generate-m3u8")
async def create_spotify_m3u8(
    request: SpotifyM3U8Request,
    username: str = Depends(require_auth)
):
    """
    Generate an m3u8 playlist file from validated Spotify tracks.
    Only includes tracks that have been validated and exist on Tidal.
    """
    try:
        result = await generate_spotify_m3u8(
            playlist_name=request.playlist_name,
            tracks=request.tracks
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate m3u8: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate playlist: {str(e)}")


@router.post("/api/spotify/search-track")
async def search_tidal_for_track(
    request: TrackSearchRequest,
    user: str = Depends(require_auth)
):
    """Search Tidal for a single track query and return scored candidates."""
    from api.services.search import search_track_with_candidates
    from api.utils.text import fix_unicode

    query = fix_unicode(request.query.strip())
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    # Split query into artist/title if possible, otherwise use as-is
    parts = query.split(" - ", 1)
    if len(parts) == 2:
        artist, title = parts[0].strip(), parts[1].strip()
    else:
        artist, title = "", query

    candidates = search_track_with_candidates(artist, title, limit=10)
    return {"candidates": candidates}


@router.post("/api/spotify/progress/{progress_id}/confirm")
async def confirm_sync_overrides(
    progress_id: str,
    request: ConfirmSyncRequest,
    user: str = Depends(require_auth)
):
    """
    Accept the user's finalized track list (with overrides) and rebuild import_cache.
    Called before syncPlaylist to apply user's match corrections.
    """
    from api.state import import_cache, import_states

    if not request.tracks:
        raise HTTPException(status_code=400, detail="No tracks provided")

    # Rebuild normalized items for import_cache (same format _fetch_spotify_items produces)
    normalized = []
    for t in request.tracks:
        if t.get('tidal_exists') and t.get('tidal_id'):
            tidal_id = t['tidal_id']
            normalized.append({
                'tidal_exists': True,
                'item': {
                    'id': int(tidal_id) if str(tidal_id).isdigit() else tidal_id,
                    'title': t.get('title', 'Unknown'),
                    'artist': {'name': t.get('artist', 'Unknown'), 'id': t.get('tidal_artist_id')},
                    'album': {
                        'title': t.get('album', 'Unknown Album'),
                        'id': t.get('tidal_album_id'),
                        'cover': t.get('cover'),
                    },
                    'trackNumber': t.get('track_number'),
                    'duration': -1
                }
            })

    import_cache[progress_id] = normalized
    logger.info(f"Rebuilt import_cache for {progress_id}: {len(normalized)} matched tracks")

    # Also update import_states tracks if present
    if progress_id in import_states:
        import_states[progress_id]["tracks"] = request.tracks

    return {"status": "ok", "matched_count": len(normalized)}
