from api.utils.text import fix_unicode, romanize_japanese, compute_match_score
from api.utils.logging import log_info, log_success, log_error
from api.utils.extraction import extract_items
from api.clients import tidal_client
from typing import List, Dict, Optional


def _score_candidates(
    tidal_tracks: list,
    query_artist: str,
    query_title: str,
    query_duration_ms: Optional[int] = None,
    limit: int = 5,
) -> List[Dict]:
    """Score and rank a list of tidal track results against a spotify query."""
    candidates = []
    for t in tidal_tracks[:limit * 2]:  # Evaluate more than we return
        artist_data = t.get('artist', {})
        album_data = t.get('album', {})
        r_title = t.get('title', '')
        r_artist = artist_data.get('name', '') if isinstance(artist_data, dict) else ''
        r_duration = t.get('duration')

        score = compute_match_score(
            query_title, query_artist,
            r_title, r_artist,
            query_duration_ms, r_duration,
        )

        candidates.append({
            'tidal_id': t.get('id'),
            'title': r_title,
            'artist': r_artist,
            'artist_id': artist_data.get('id') if isinstance(artist_data, dict) else None,
            'album': album_data.get('title') if isinstance(album_data, dict) else None,
            'album_id': album_data.get('id') if isinstance(album_data, dict) else None,
            'cover': album_data.get('cover') if isinstance(album_data, dict) else None,
            'track_number': t.get('trackNumber'),
            'duration': r_duration,
            'score': round(score, 3),
        })

    # Sort by score descending, return top N
    candidates.sort(key=lambda c: c['score'], reverse=True)
    return candidates[:limit]


def search_track_with_candidates(
    artist: str,
    title: str,
    duration_ms: Optional[int] = None,
    limit: int = 5,
) -> List[Dict]:
    """
    Search Tidal for a track and return scored candidates.
    Tries romanized query as fallback for Japanese text.
    """
    artist_fixed = fix_unicode(artist)
    title_fixed = fix_unicode(title)

    log_info(f"Searching candidates: {artist_fixed} - {title_fixed}")

    query = f"{artist_fixed} {title_fixed}"
    result = tidal_client.search_tracks(query)

    candidates = []
    if result:
        tidal_tracks = extract_items(result, 'tracks')
        if tidal_tracks:
            candidates = _score_candidates(tidal_tracks, artist_fixed, title_fixed, duration_ms, limit)

    # Try romanized fallback
    romanized_title = romanize_japanese(title_fixed)
    romanized_artist = romanize_japanese(artist_fixed)

    if romanized_title or romanized_artist:
        search_artist = romanized_artist or artist_fixed
        search_title = romanized_title or title_fixed

        log_info(f"Trying romanized: {search_artist} - {search_title}")
        query_romanized = f"{search_artist} {search_title}"
        result = tidal_client.search_tracks(query_romanized)

        if result:
            tidal_tracks = extract_items(result, 'tracks')
            if tidal_tracks:
                rom_candidates = _score_candidates(tidal_tracks, artist_fixed, title_fixed, duration_ms, limit)
                # Merge: add any romanized candidates with IDs not already present
                existing_ids = {c['tidal_id'] for c in candidates}
                for c in rom_candidates:
                    if c['tidal_id'] not in existing_ids:
                        candidates.append(c)
                # Re-sort and trim
                candidates.sort(key=lambda c: c['score'], reverse=True)
                candidates = candidates[:limit]

    if candidates:
        log_success(f"Found {len(candidates)} candidates, best score: {candidates[0]['score']}")
    else:
        log_error("No candidates found on Tidal")

    return candidates


async def search_track_with_fallback(artist: str, title: str, track_obj) -> bool:
    """
    Legacy wrapper: search for a track and populate track_obj with the best match.
    Used by ListenBrainz and other callers that expect the old interface.
    """
    candidates = search_track_with_candidates(artist, title, limit=1)
    if candidates:
        best = candidates[0]
        track_obj.tidal_id = best['tidal_id']
        track_obj.tidal_artist_id = best['artist_id']
        track_obj.tidal_album_id = best['album_id']
        track_obj.tidal_exists = True
        track_obj.album = best['album']
        track_obj.cover = best['cover']
        track_obj.title = best['title']
        track_obj.artist = best['artist']
        track_obj.track_number = best['track_number']
        log_success(f"Found on Tidal - ID: {track_obj.tidal_id}")
        return True

    log_error("Not found on Tidal")
    return False
