'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  AlertTriangle,
  PackageCheck,
} from 'lucide-react';
import { MapMarkerPoint } from '@/components/InteractiveDeliveryMap';

const InteractiveDeliveryMap = dynamic(
  () => import('@/components/InteractiveDeliveryMap'),
  { ssr: false }
);

interface TrackingOrderData {
  id: string;
  order_number: number;
  customer_name: string;
  delivery_date: string;
  requested_time_slot: string;
  zone_name: string;
  address_reference: string;
  lat: number;
  lng: number;
  items: Array<{
    title: string;
    qty: number;
    unit_price: number;
    is_free_reward?: boolean;
  }>;
  total_uyu: number;
  payment_method: 'mercadopago' | 'efectivo';
  payment_status: string;
  cash_needs_change: boolean;
  cash_paid_with_uyu: number;
  cash_change_uyu: number;
  order_status: string;
  estimated_arrival_at: string | null;
  delay_minutes: number;
}

export default function OrderTrackingPage() {
  const params = useParams();
  const orderId = String(params?.id || '');

  const [order, setOrder] = useState<TrackingOrderData | null>(null);
  const [driverLocation, setDriverLocation] = useState<{
    lat: number;
    lng: number;
    distanceKm: number;
  } | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let active = true;
    async function loadTracking() {
      try {
        const res = await fetch(`/api/orders/tracking?id=${encodeURIComponent(orderId)}`);
        const data = await res.json();
        if (!active) return;

        if (!res.ok) {
          setError(data.error || 'No se encontró el pedido.');
          setLoading(false);
          return;
        }

        setOrder(data.order);
        setDriverLocation(data.driverLiveLocation || null);
        setWhatsappUrl(data.whatsappUrl || null);
        setLoading(false);
      } catch {
        if (active) {
          setError('Error conectando con el seguimiento en vivo.');
          setLoading(false);
        }
      }
    }

    loadTracking();
    const interval = setInterval(loadTracking, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <p className="text-sm font-bold animate-pulse">
          Cargando seguimiento en vivo de tu pedido...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 gap-4">
        <p className="text-red-400 font-bold">{error || 'Pedido no disponible.'}</p>
        <Link
          href="/"
          className="bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold"
        >
          Volver a Sabor Goo
        </Link>
      </div>
    );
  }

  const isPaymentConfirmed =
    order.payment_status === 'approved' || order.payment_status === 'cash_on_delivery';

  const statusLabels: Record<string, string> = {
    awaiting_payment: 'Esperando confirmación de pago online',
    confirmed: 'Pedido confirmado · En cola de cocina',
    preparing: 'Preparando tu bandeja casera abundante',
    on_the_way: 'Repartidor en camino hacia tu puerta',
    delivered: 'Pedido entregado · ¡Buen provecho!',
    cancelled: 'Pedido cancelado',
  };

  const etaFormatted = order.estimated_arrival_at
    ? new Intl.DateTimeFormat('es-UY', {
        timeZone: 'America/Montevideo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(order.estimated_arrival_at))
    : order.requested_time_slot;

  const extraMarkers: MapMarkerPoint[] = [];
  if (driverLocation) {
    extraMarkers.push({
      lat: driverLocation.lat,
      lng: driverLocation.lng,
      label: `Repartidor en vivo (${driverLocation.distanceKm} km)`,
      color: 'emerald',
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <header className="border-b border-slate-800 bg-slate-950/90 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Menú
          </Link>
          <span className="font-black text-orange-400 text-sm">
            PEDIDO #{order.order_number}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                Seguimiento en vivo del repartidor hasta tu puerta
              </span>
              <h1 className="text-2xl font-black text-white mt-0.5">
                {statusLabels[order.order_status] || order.order_status}
              </h1>
            </div>

            <div className="bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-2xl text-right">
              <span className="block text-[11px] text-slate-400 uppercase">Llegada estimada</span>
              <span className="font-mono text-xl font-black text-emerald-400">
                {etaFormatted} hs
              </span>
            </div>
          </div>

          {order.delay_minutes >= 2 && (
            <div className="p-4 rounded-2xl bg-amber-950/70 border border-amber-500/40 text-amber-200 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  Actualización automática en ruta (+{order.delay_minutes} min)
                </p>
                <p className="text-xs text-amber-100/90 mt-0.5">
                  El tránsito en ruta sumó {order.delay_minutes} minutos al recorrido. Tu horario
                  estimado ya fue actualizado automáticamente.
                </p>
              </div>
            </div>
          )}

          {!isPaymentConfirmed ? (
            <div className="p-4 rounded-2xl bg-red-950/70 border border-red-500/40 text-red-200 text-sm">
              El pago online aún no figura aprobado. Una vez confirmado el pago, se habilitará el
              envío directo de tu comanda a WhatsApp.
            </div>
          ) : (
            whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm px-5 py-3.5 rounded-2xl shadow-lg transition"
              >
                <CheckCircle2 className="w-5 h-5" />
                Enviar / Reabrir Comanda en WhatsApp
                <ExternalLink className="w-4 h-4" />
              </a>
            )
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase text-slate-300 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-emerald-400" />
              Mapa en Tiempo Real ({order.zone_name})
            </span>
            {driverLocation && (
              <span className="text-emerald-400 font-bold">
                Repartidor a {driverLocation.distanceKm} km de tu puerta
              </span>
            )}
          </div>

          <InteractiveDeliveryMap
            centerLat={order.lat}
            centerLng={order.lng}
            selectedLat={order.lat}
            selectedLng={order.lng}
            extraMarkers={extraMarkers}
            heightClass="h-80"
          />

          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-orange-400" />
            Destino: {order.address_reference} · Fecha: {order.delivery_date}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
          <h2 className="font-black text-lg text-white flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-orange-400" />
            Detalle de tu Pedido Abundante
          </h2>

          <div className="space-y-2 text-sm">
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800"
              >
                <span className="text-slate-200 font-semibold">
                  {item.qty}x {item.title}{' '}
                  {item.is_free_reward && (
                    <span className="text-emerald-400 text-xs font-bold">(COMIDA GRATIS)</span>
                  )}
                </span>
                <span className="font-bold text-amber-300">
                  ${item.unit_price * item.qty} UYU
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-400 flex items-center gap-1.5">

              Pago: <strong className="text-slate-200 uppercase">{order.payment_method}</strong>
            </span>
            <span className="text-lg font-black text-orange-400">
              Total: ${order.total_uyu} UYU
            </span>
         </div>
      </div>
    </main>
  </div>
  );
}
