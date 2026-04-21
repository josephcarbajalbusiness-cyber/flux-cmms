import { useState, useCallback } from "react";

interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseGeolocationReturn {
  position: GeoPosition | null;
  error: string | null;
  loading: boolean;
  getPosition: () => Promise<GeoPosition>;
  isWithinRadius: (targetLat: number, targetLng: number, radiusMeters: number) => boolean;
}

// Fórmula Haversine para distancia entre coordenadas
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Radio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeolocation(): UseGeolocationReturn {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getPosition = useCallback((): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = "Geolocalización no soportada en este dispositivo";
        setError(err);
        reject(new Error(err));
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const geoPos: GeoPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setPosition(geoPos);
          setLoading(false);
          resolve(geoPos);
        },
        (err) => {
          const msg = err.code === 1
            ? "Permiso de ubicación denegado. Actívalo en la configuración del navegador."
            : "No se pudo obtener la ubicación. Intenta de nuevo.";
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }, []);

  const isWithinRadius = useCallback(
    (targetLat: number, targetLng: number, radiusMeters: number): boolean => {
      if (!position) return false;
      const dist = haversineDistance(position.latitude, position.longitude, targetLat, targetLng);
      return dist <= radiusMeters;
    },
    [position]
  );

  return { position, error, loading, getPosition, isWithinRadius };
}
