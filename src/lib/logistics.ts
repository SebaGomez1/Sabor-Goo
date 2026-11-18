import { AppSettings, OrderRecord, VehicleType } from '@/types';
import { calculateHaversineKm } from './geo';

const UY_TIMEZONE = 'America/Montevideo';

export interface MontevideoClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  isoDate: string;
}

export function getMontevideoNow(baseDate: Date = new Date()): MontevideoClock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: UY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(baseDate);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour === '24' ? '0' : map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  const isoDate = `${map.year}-${map.month}-${map.day}`;

  const weekdayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: UY_TIMEZONE,
    weekday: 'short',
  }).format(baseDate);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek: dayMap[weekdayStr] ?? 1,
    isoDate,
  };
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function getIsoWeekdayFromIsoDate(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay();
}

export interface BookingWindowInfo {
  targetDeliveryDate: string;
  targetMenuDayOfWeek: number;
  targetDayLabel: string;
  isAfterCutoffOrWeekend: boolean;
  countdownTargetIso: string;
  bannerMessage: string;
}

const DAY_NAMES_ES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
};

export function resolveNextBookingWindow(cutoffHour = 21): BookingWindowInfo {
  const now = getMontevideoNow();
  const dow = now.dayOfWeek;

  if (dow === 6 || dow === 0) {
    const daysUntilMonday = dow === 6 ? 2 : 1;
    const mondayDate = addDaysToIsoDate(now.isoDate, daysUntilMonday);
    const sundayDate = dow === 6 ? addDaysToIsoDate(now.isoDate, 1) : now.isoDate;

    return {
      targetDeliveryDate: mondayDate,
      targetMenuDayOfWeek: 1,
      targetDayLabel: `Lunes (${mondayDate})`,
      isAfterCutoffOrWeekend: true,
      countdownTargetIso: `${sundayDate}T${String(cutoffHour).padStart(2, '0')}:00:00-03:00`,
      bannerMessage:
        'Fin de semana cerrado: ya puedes reservar y asegurar tu plato abundante para el Lunes.',
    };
  }

  if (dow === 5 && now.hour >= cutoffHour) {
    const mondayDate = addDaysToIsoDate(now.isoDate, 3);
    const sundayDate = addDaysToIsoDate(now.isoDate, 2);
    return {
      targetDeliveryDate: mondayDate,
      targetMenuDayOfWeek: 1,
      targetDayLabel: `Lunes (${mondayDate})`,
      isAfterCutoffOrWeekend: true,
      countdownTargetIso: `${sundayDate}T${String(cutoffHour).padStart(2, '0')}:00:00-03:00`,
      bannerMessage:
        'Cierre de las 21:00 hs alcanzado: reservas abiertas para el Lunes.',
    };
  }

  if (dow >= 1 && dow <= 4 && now.hour >= cutoffHour) {
    const targetDate = addDaysToIsoDate(now.isoDate, 2);
    const nextCutoffDate = addDaysToIsoDate(now.isoDate, 1);
    const targetDow = getIsoWeekdayFromIsoDate(targetDate);

    return {
      targetDeliveryDate: targetDate,
      targetMenuDayOfWeek: targetDow,
      targetDayLabel: `${DAY_NAMES_ES[targetDow]} (${targetDate})`,
      isAfterCutoffOrWeekend: true,
      countdownTargetIso: `${nextCutoffDate}T${String(cutoffHour).padStart(2, '0')}:00:00-03:00`,
      bannerMessage: `Ya cerraron los pedidos de mañana. Reservando ahora para el ${DAY_NAMES_ES[targetDow]}.`,
    };
  }

  const isBeforeMorningKitchen = now.hour < 11 || (now.hour === 11 && now.minute < 30);

  if (isBeforeMorningKitchen) {
    return {
      targetDeliveryDate: now.isoDate,
      targetMenuDayOfWeek: dow,
      targetDayLabel: `Hoy ${DAY_NAMES_ES[dow]} (${now.isoDate})`,
      isAfterCutoffOrWeekend: false,
      countdownTargetIso: `${now.isoDate}T${String(cutoffHour).padStart(2, '0')}:00:00-03:00`,
      bannerMessage: `Pedidos abiertos para entrega hoy al mediodía y reservas para mañana hasta las ${cutoffHour}:00 hs.`,
    };
  }

  const daysToAdd = dow === 5 ? 3 : 1;
  const tomorrowBusinessDate = addDaysToIsoDate(now.isoDate, daysToAdd);
  const tomorrowDow = getIsoWeekdayFromIsoDate(tomorrowBusinessDate);

  return {
    targetDeliveryDate: tomorrowBusinessDate,
    targetMenuDayOfWeek: tomorrowDow,
    targetDayLabel: `${DAY_NAMES_ES[tomorrowDow]} (${tomorrowBusinessDate})`,
    isAfterCutoffOrWeekend: false,
    countdownTargetIso: `${now.isoDate}T${String(cutoffHour).padStart(2, '0')}:00:00-03:00`,
    bannerMessage: `Reserva tu menú abundante del ${DAY_NAMES_ES[tomorrowDow]} antes de las ${cutoffHour}:00 hs.`,
  };
}

export function getActiveVehicleSpeedKmh(settings: AppSettings): number {
  const map: Record<VehicleType, number> = {
    bici: settings.speed_bici_kmh || 16,
    moto: settings.speed_moto_kmh || 32,
    auto: settings.speed_auto_kmh || 28,
  };
  return map[settings.active_vehicle] || 30;
}

export interface RouteStopEstimate {
  orderId: string;
  orderNumber: number;
  customerName: string;
  zoneName: string;
  addressReference: string;
  lat: number;
  lng: number;
  sequence: number;
  distanceFromPrevKm: number;
  travelMinutes: number;
  stopDurationMinutes: number;
  estimatedArrivalIso: string;
  estimatedArrivalTimeStr: string;
  isDelayedByTwoOrMoreMin: boolean;
  delayMinutes: number;
}

export function computeOptimizedRouteSchedule(
  orders: OrderRecord[],
  settings: AppSettings,
  driverCurrentLat?: number | null,
  driverCurrentLng?: number | null
): RouteStopEstimate[] {
  if (!orders.length) return [];

  const speedKmh = getActiveVehicleSpeedKmh(settings);
  const effectiveSpeedKmh = speedKmh * 0.82;

  const remaining = [...orders];
  const ordered: OrderRecord[] = [];

  let currentLat = driverCurrentLat ?? settings.store_lat;
  let currentLng = driverCurrentLng ?? settings.store_lng;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = calculateHaversineKm(
        currentLat,
        currentLng,
        remaining[i].lat,
        remaining[i].lng
      );
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const [nextOrder] = remaining.splice(bestIdx, 1);
    ordered.push(nextOrder);
    currentLat = nextOrder.lat;
    currentLng = nextOrder.lng;
  }

  const now = new Date();
  const uyNow = getMontevideoNow(now);
  const [openH, openM] = (settings.opening_hour || '11:30').split(':').map(Number);
  const openingDate = new Date(
    `${uyNow.isoDate}T${String(openH).padStart(2, '0')}:${String(openM).padStart(2, '0')}:00-03:00`
  );

  let cursorTimeMs = Math.max(now.getTime(), openingDate.getTime());
  let prevLat = driverCurrentLat ?? settings.store_lat;
  let prevLng = driverCurrentLng ?? settings.store_lng;

  return ordered.map((ord, index) => {
    const distKm = calculateHaversineKm(prevLat, prevLng, ord.lat, ord.lng);
    const travelMinutes = Math.max(2, Math.ceil((distKm / effectiveSpeedKmh) * 60));
    const stopDurationMinutes =
      (settings.stop_minutes_base || 4) +
      (ord.cash_needs_change ? settings.stop_minutes_cash_extra || 2 : 0);

    cursorTimeMs += travelMinutes * 60 * 1000;
    const arrivalDate = new Date(cursorTimeMs);

    let delayMinutes = 0;
    if (ord.estimated_arrival_at) {
      const originalMs = new Date(ord.estimated_arrival_at).getTime();
      const diffMin = Math.round((arrivalDate.getTime() - originalMs) / 60000);
      if (diffMin >= 2) {
        delayMinutes = diffMin;
      }
    }

    const arrivalStr = new Intl.DateTimeFormat('es-UY', {
      timeZone: UY_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(arrivalDate);

    cursorTimeMs += stopDurationMinutes * 60 * 1000;
    prevLat = ord.lat;
    prevLng = ord.lng;

    return {
      orderId: ord.id,
      orderNumber: ord.order_number,
      customerName: ord.customer_name,
      zoneName: ord.zone_name,
      addressReference: ord.address_reference,
      lat: ord.lat,
      lng: ord.lng,
      sequence: index + 1,
      distanceFromPrevKm: distKm,
      travelMinutes,
      stopDurationMinutes,
      estimatedArrivalIso: arrivalDate.toISOString(),
      estimatedArrivalTimeStr: arrivalStr,
      isDelayedByTwoOrMoreMin: delayMinutes >= 2,
      delayMinutes,
    };
  });
}
