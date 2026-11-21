import { GeoValidationResult } from '@/types';

// Coordenadas base del local Sabor Goo en Maldonado centro
export const DEFAULT_STORE_COORDS = {
  lat: -34.9089,
  lng: -54.9583,
};

// Polígono estricto:
// Cubre todos los barrios de Maldonado (Centro, Maldonado Nuevo, Cerro Pelado,
// Lausana, San Fernando, Pinares, Las Delicias, Cantegril, Barrio Rivera,
// La Sonrisa, Odizzio, Biarritz, Scalone, Villa Delia)
// + Playa Mansa de Punta del Este desde Parada 1 (-34.9545, -54.9412)
// hasta Parada 25 (-34.9182, -54.9835) y su eje completo hacia Av. Roosevelt / Maldonado.
// Excluye La Barra, Manantiales, José Ignacio, Punta Ballena oeste, Solanas lejano y Península sur/Brava lejana.
const ALLOWED_DELIVERY_POLYGON: Array<[number, number]> = [
  [-34.8685, -54.9960], // Noroeste Maldonado (Cerro Pelado / Ruta 39 norte)
  [-34.8690, -54.9220], // Noreste Maldonado (Maldonado Nuevo / San Carlos eje sur)
  [-34.9020, -54.9150], // Este Maldonado / Barrio Rivera / límite San Rafael norte
  [-34.9280, -54.9260], // Eje Av. Roosevelt / Cantegril / Parada 16
  [-34.9558, -54.9385], // Playa Mansa Parada 1 (límite sur permitido en Mansa)
  [-34.9520, -54.9475], // Costa Playa Mansa Paradas 2 a 6
  [-34.9395, -54.9595], // Costa Playa Mansa Paradas 7 a 14
  [-34.9265, -54.9725], // Costa Playa Mansa Paradas 15 a 21
  [-34.9175, -54.9865], // Costa Playa Mansa Parada 25 (Las Delicias / Pinares)
  [-34.9050, -54.9985], // Pinares oeste / Laguna del Diario borde este
];

export function calculateHaversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function isPointInPolygon(lat: number, lng: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function classifyZoneName(lat: number, lng: number): string {
  // Detección aproximada de sub-zona para etiquetas operativas y WhatsApp
  if (lat <= -34.942 && lng >= -54.955) {
    return 'Playa Mansa (Paradas 1 a 8)';
  }
  if (lat <= -34.928 && lng >= -54.970) {
    return 'Playa Mansa (Paradas 9 a 18) / Eje Roosevelt';
  }
  if (lat <= -34.916 && lng <= -54.970) {
    return 'Playa Mansa (Paradas 19 a 25) / Las Delicias / Pinares';
  }
  if (lat >= -34.892 && lng <= -54.968) {
    return 'Maldonado - Cerro Pelado / Lausana';
  }
  if (lat >= -34.895 && lng >= -54.945) {
    return 'Maldonado - Maldonado Nuevo / Barrio Rivera';
  }
  return 'Maldonado Centro / Barrios';
}

export function validateDeliveryCoverage(
  lat: number,
  lng: number,
  storeLat = DEFAULT_STORE_COORDS.lat,
  storeLng = DEFAULT_STORE_COORDS.lng
): GeoValidationResult {
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return {
      allowed: false,
      zoneName: 'Ubicación inválida',
      distanceFromStoreKm: 0,
      reason: 'Selecciona un punto válido en el mapa.',
    };
  }

  const distanceFromStoreKm = calculateHaversineKm(storeLat, storeLng, lat, lng);
  const inside = isPointInPolygon(lat, lng, ALLOWED_DELIVERY_POLYGON);

  if (!inside) {
    return {
      allowed: false,
      zoneName: 'Fuera de zona de cobertura',
      distanceFromStoreKm,
      reason:
        'Actualmente repartimos únicamente en todo Maldonado y Playa Mansa de Punta del Este (desde Parada 1 hasta Parada 25 y su eje hacia Maldonado).',
    };
  }

  return {
    allowed: true,
    zoneName: classifyZoneName(lat, lng),
    distanceFromStoreKm,
  };
}

export function buildGoogleMapsPinUrl(lat: number, lng: number): string {
  return "https://google.com" + lat.toFixed(6) + "," + lng.toFixed(6);
}
