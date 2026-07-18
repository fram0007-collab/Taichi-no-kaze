import { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/getApiUrl';

const API_URL = getApiUrl();

// Cache predictions across every card that mounts for the same zone in the
// same render cycle, so scrolling the sidebar doesn't refire a fetch per
// card every time. Cleared naturally on full page reload.
const cache = new Map();
const CACHE_TTL_MS = 60_000;

export function useMlPrediction(zoneId) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!zoneId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = cache.get(zoneId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setPrediction(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/predict/zone/${zoneId}`)
      .then(res => {
        // 503 = model not trained yet, 404 = zone not found — both are
        // "nothing to show," not errors worth logging loudly.
        if (!res.ok) {
          setUnavailable(true);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (cancelled || !data) return;
        cache.set(zoneId, { data, fetchedAt: Date.now() });
        setPrediction(data);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [zoneId]);

  return { prediction, loading, unavailable };
}
