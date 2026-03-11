import re
import unicodedata
from difflib import SequenceMatcher
from typing import Optional
from api.utils.logging import log_warning

def fix_unicode(text: str) -> str:
    if not text:
        return text
    
    try:
        if '\\u' in text:
            text = text.encode('raw_unicode_escape').decode('unicode_escape')
    except:
        pass
    
    try:
        text = unicodedata.normalize('NFC', text)
    except:
        pass
    
    return text

def romanize_japanese(text: str) -> Optional[str]:
    if not text:
        return None
    
    has_japanese = any('\u3040' <= c <= '\u30ff' or '\u4e00' <= c <= '\u9fff' for c in text)
    
    if not has_japanese:
        return None
    
    try:
        import pykakasi
        kakasi = pykakasi.kakasi()
        result = kakasi.convert(text)
        romanized = ' '.join([item['hepburn'] for item in result])
        return romanized
    except ImportError:
        return None
    except Exception as e:
        log_warning(f"Romanization failed: {e}")
        return None


def _normalize_for_comparison(text: str) -> str:
    """Normalize text for fuzzy comparison: lowercase, strip parentheticals, punctuation."""
    if not text:
        return ""
    text = text.lower().strip()
    # Remove common suffixes like (feat. X), [Remastered], etc.
    text = re.sub(r'\s*[\(\[](feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]', '', text)
    # Remove remaining brackets content for comparison (but keep base)
    text = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', text)
    # Remove punctuation except spaces
    text = re.sub(r'[^\w\s]', '', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def compute_match_score(
    query_title: str,
    query_artist: str,
    result_title: str,
    result_artist: str,
    query_duration_ms: Optional[int] = None,
    result_duration_s: Optional[int] = None,
) -> float:
    """
    Compute a 0.0-1.0 match confidence score between a Spotify track and a Tidal result.
    Uses fuzzy string matching on title/artist and optional duration comparison.
    """
    qt = _normalize_for_comparison(query_title)
    rt = _normalize_for_comparison(result_title)
    qa = _normalize_for_comparison(query_artist)
    ra = _normalize_for_comparison(result_artist)

    title_score = SequenceMatcher(None, qt, rt).ratio() if qt and rt else 0.0
    artist_score = SequenceMatcher(None, qa, ra).ratio() if qa and ra else 0.0

    # Duration factor: 1.0 if within 3s, linear decay to 0.5 at 15s difference
    duration_score = 1.0
    if query_duration_ms and result_duration_s and result_duration_s > 0:
        diff_s = abs((query_duration_ms / 1000) - result_duration_s)
        if diff_s <= 3:
            duration_score = 1.0
        elif diff_s <= 15:
            duration_score = 1.0 - (diff_s - 3) * (0.5 / 12)
        else:
            duration_score = 0.3

        return title_score * 0.40 + artist_score * 0.40 + duration_score * 0.20
    
    # Without duration info, weight title/artist equally
    return title_score * 0.50 + artist_score * 0.50
