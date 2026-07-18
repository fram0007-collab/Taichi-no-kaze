import { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/getApiUrl';

const API_URL = getApiUrl();

const cache = new Map();
const CACHE_TTL_MS = 60_000;

export function useMlResolution(alertId) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!alertId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = cache.get(alertId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setPrediction(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${API_URL}/predict/resolution/${alertId}`)
      .then(res => {
        if (!res.ok) {
          setUnavailable(true);
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (cancelled || !data) return;
        cache.set(alertId, { data, fetchedAt: Date.now() });
        setPrediction(data);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [alertId]);

  return { prediction, loading, unavailable };
}
