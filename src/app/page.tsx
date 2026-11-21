'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Clock,
  Flame,
  Gift,
  MapPin,
  Navigation,
  Plus,
  Minus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import AiConciergeChat from '@/components/AiConciergeChat';
import PwaOneTapInstaller from '@/components/PwaOneTapInstaller';
import { validateDeliveryCoverage } from '@/lib/geo';
import { CustomerProfile, MenuItem } from '@/types';

const InteractiveDeliveryMap = dynamic(
  () => import('@/components/InteractiveDeliveryMap'),
  { ssr: false }
);

interface BookingWindow {
  targetDeliveryDate: string;
  targetMenuDayOfWeek: number;
  targetDayLabel: string;
  isAfterCutoffOrWeekend: boolean;
  countdownTargetIso: string;
  bannerMessage: string;
}

const TIME_SLOTS = [
  '12:00 - 12:30 hs',
  '12:30 - 13:00 hs',
  '13:00 - 13:30 hs',
  '13:30 - 14:00 hs',
];

export default function HomePage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [bookingWindow, setBookingWindow] = useState<BookingWindow | null>(null);
  const [storeLocation, setStoreLocation] = useState({ lat: -34.9089, lng: -54.9583 });
  const [countdownText, setCountdownText] = useState('--:--:--');

  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [requestedTimeSlot, setRequestedTimeSlot] = useState('12:00 - 12:30 hs');
  const [addressReference, setAddressReference] = useState('');
  const [pinLat, setPinLat] = useState<number>(-34.9125);
  const [pinLng, setPinLng] = useState<number>(-54.9595);

  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'mercadopago'>('efectivo');
  const [cashNeedsChange, setCashNeedsChange] = useState(false);
  const [cashPaidWithUyu, setCashPaidWithUyu] = useState<string>('');
  const [referralCodeUsed, setReferralCodeUsed] = useState('');
  const [deviceToken, setDeviceToken] = useState('');

  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam) {
      setReferralCodeUsed(refParam.toUpperCase());
      localStorage.setItem('sabor_goo_ref_used', refParam.toUpperCase());
    } else {
      const savedRef = localStorage.getItem('sabor_goo_ref_used');
      if (savedRef) setReferralCodeUsed(savedRef);
    }

    let token = localStorage.getItem('sabor_goo_device_token');
    if (!token) {
      token = `sg_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem('sabor_goo_device_token', token);
    }
    setDeviceToken(token);

    const savedName = localStorage.getItem('sabor_goo_name') || '';
    const savedPhone = localStorage.getItem('sabor_goo_phone') || '';
    const savedAddress = localStorage.getItem('sabor_goo_address') || '';
    if (savedName) setCustomerName(savedName);
    if (savedPhone) setCustomerPhone(savedPhone);
    if (savedAddress) setAddressReference(savedAddress);

    fetchCatalogAndProfile(savedPhone);
  }, []);

  async function fetchCatalogAndProfile(phoneToQuery?: string) {
    try {
      const query = phoneToQuery ? `?phone=${encodeURIComponent(phoneToQuery)}` : '';
      const res = await fetch(`/api/orders${query}`);
      const data = await res.json();

      if (data.menus) setMenus(data.menus);
      if (data.bookingWindow) {
        setBookingWindow(data.bookingWindow);
        setSelectedDay(data.bookingWindow.targetMenuDayOfWeek || 1);
      }
      if (data.settings?.store_lat && data.settings?.store_lng) {
        setStoreLocation({
          lat: data.settings.store_lat,
          lng: data.settings.store_lng,
        });
      }
      if (data.customer) setCustomerProfile(data.customer);
      if (data.activeOrder?.id) setActiveOrderId(data.activeOrder.id);
    } catch {
      // Silencio en carga inicial
    }
  }

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length >= 8) {
      const timer = setTimeout(() => {
        fetchCatalogAndProfile(customerPhone);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [customerPhone]);

  useEffect(() => {
    if (!bookingWindow?.countdownTargetIso) return;
    const targetMs = new Date('2026-11-21T11:00:00-03:00').getTime();

    const updateTimer = () => {
      const diff = Math.max(0, targetMs - Date.now());
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdownText(
        `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(
          secs
        ).padStart(2, '0')}s`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [bookingWindow]);

  const geoValidation = useMemo(
    () => validateDeliveryCoverage(pinLat, pinLng, storeLocation.lat, storeLocation.lng),
    [pinLat, pinLng, storeLocation]
  );

  const cartItemsList = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([menuId, qty]) => {
        const menu = menus.find((m) => m.id === menuId);
        return menu ? { menu, qty } : null;
      })
      .filter((x): x is { menu: MenuItem; qty: number } => Boolean(x));
  }, [cart, menus]);

  const subtotalUyu = useMemo(
    () => cartItemsList.reduce((acc, item) => acc + item.menu.price_uyu * item.qty, 0),
    [cartItemsList]
  );

  const estimatedDiscountUyu = useMemo(() => {
    const firstItem = cartItemsList.at(0);
    if (!customerProfile || !firstItem) return 0;
    if (customerProfile.has_free_daily_meal) {
      return firstItem.menu.price_uyu;
    }
    if (customerProfile.has_25_off) {
      return Math.round(subtotalUyu * 0.25);
    }
    return 0;
  }, [customerProfile, cartItemsList, subtotalUyu]);

  const estimatedTotalUyu = Math.max(0, subtotalUyu - estimatedDiscountUyu);

  const cashChangePreview = useMemo(() => {
    if (paymentMethod !== 'efectivo' || !cashNeedsChange) return 0;
    const paid = Number(cashPaidWithUyu || 0);
    return paid >= estimatedTotalUyu ? paid - estimatedTotalUyu : 0;
  }, [paymentMethod, cashNeedsChange, cashPaidWithUyu, estimatedTotalUyu]);

  function updateItemQty(menu: MenuItem, delta: number) {
    setCart((prev) => {
      const current = prev[menu.id] || 0;
      const next = Math.max(0, Math.min(menu.daily_stock, current + delta));
      return { ...prev, [menu.id]: next };
    });
  }

  function handleUseCurrentGps() {
    if (!navigator.geolocation) {
      setErrorMsg('Tu navegador no soporta GPS automático. Marca tu punto en el mapa.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPinLat(Number(pos.coords.latitude.toFixed(6)));
        setPinLng(Number(pos.coords.longitude.toFixed(6)));
        setErrorMsg(null);
      },
      () => {
        setErrorMsg('No se pudo obtener tu GPS. Toca directamente sobre el mapa tu ubicación.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function handleShareReferralLink() {
    if (!customerProfile?.referral_code) return;
    const url = `${window.location.origin}/?ref=${customerProfile.referral_code}`;
    navigator.clipboard?.writeText(url);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 3000);
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (cartItemsList.length === 0) {
      setErrorMsg('Agrega al menos un plato abundante a tu pedido.');
      return;
    }
    if (!geoValidation.allowed) {
      setErrorMsg(geoValidation.reason || 'La ubicación marcada está fuera de zona de reparto.');
      return;
    }

    setSubmitting(true);
    try {
      localStorage.setItem('sabor_goo_name', customerName.trim());
      localStorage.setItem('sabor_goo_phone', customerPhone.trim());
      localStorage.setItem('sabor_goo_address', addressReference.trim());

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          deliveryDate: bookingWindow?.targetDeliveryDate,
          requestedTimeSlot,
          addressReference,
          lat: pinLat,
          lng: pinLng,
          items: cartItemsList.map((i) => ({
            menu_id: i.menu.id,
            qty: i.qty,
          })),
          paymentMethod,
          cashNeedsChange,
          cashPaidWithUyu: Number(cashPaidWithUyu || 0),
          referralCodeUsed: referralCodeUsed || null,
          deviceToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo procesar tu pedido.');
        setSubmitting(false);
        return;
      }

      if (data.requiresMercadoPago && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      if (data.trackingUrl) {
        window.location.href = data.trackingUrl;
      }
    } catch {
      setErrorMsg('Error de conexión al enviar tu pedido. Intenta nuevamente.');
      setSubmitting(false);
    }
  }

  const daysList = [
    { day: 1, label: 'Lunes' },
    { day: 2, label: 'Martes' },
    { day: 3, label: 'Miércoles' },
    { day: 4, label: 'Jueves' },
    { day: 5, label: 'Viernes' },
  ];

  const LAUNCH_CATALOG: MenuItem[] = [{id:'chivito-pan-1',day_of_week:1,day_label:'Chivetería',title:'Chivito al pan para 1',description:'Carne nalga de ternera, jamón, lechuga, tomate, panceta, huevo frito, aderezos y papas fritas',abundance_badge:'Hecho al instante',category:'menu_diario',price_uyu:620,ingredient_cost_uyu:0,image_url:'/menus/chivito-pan.jpg',daily_stock:99,is_active:true},{id:'chivito-plato-1',day_of_week:1,day_label:'Chivetería',title:'Chivito al plato para 1',description:'Carne de nalga de ternera, lechuga, tomate, jamón, panceta, huevo frito, muzzarella, papas fritas, mixta y rusa',abundance_badge:'Hecho al instante',category:'menu_diario',price_uyu:790,ingredient_cost_uyu:0,image_url:'/menus/chivito-plato.jpg',daily_stock:99,is_active:true},{id:'hamburguesa-especial-1',day_of_week:1,day_label:'Hamburguesas',title:'Hamburguesa especial de carne picada',description:'Carne picada, lechuga, tomate, jamón, queso muzza, huevo frito, panceta, con fritas',abundance_badge:'Hecho al instante',category:'hamburguesa',price_uyu:480,ingredient_cost_uyu:0,image_url:'/menus/hamburguesa-especial.jpg',daily_stock:99,is_active:true},{id:'napolitana-1',day_of_week:1,day_label:'Minutas',title:'Napolitana para 1',description:'Mila de carne o pollo, salsa, muzza, jamón, huevo frito y guarnición',abundance_badge:'Hecho al instante',category:'menu_diario',price_uyu:720,ingredient_cost_uyu:0,image_url:'/menus/napolitana.jpg',daily_stock:99,is_active:true},{id:'hamburguesa-clasica-1',day_of_week:1,day_label:'Hamburguesas',title:'Hamburguesa común de carne picada',description:'Carne picada, lechuga, tomate, huevo duro y aderezos',abundance_badge:'Hecho al instante',category:'hamburguesa',price_uyu:280,ingredient_cost_uyu:0,image_url:'/menus/hamburguesa-clasica.jpg',daily_stock:99,is_active:true}];const filteredMenus = LAUNCH_CATALOG;

  function addItem(menuId: string) {
    setCart((prev) => ({ ...prev, [menuId]: (prev[menuId] || 0) + 1 }));
  }

  function removeItem(menuId: string) {
    setCart((prev) => {
      const next = { ...prev };
      const current = next[menuId] || 0;
      if (current <= 1) delete next[menuId];
      else next[menuId] = current - 1;
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-orange-500/20">
              SG
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight text-white leading-none">
                Sabor <span className="text-orange-400">Goo</span>
              </h1>
              <p className="text-[11px] text-slate-400">Maldonado &amp; Playa Mansa (P.1 a P.25)</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-900 border border-orange-500/40 px-3.5 py-1.5 rounded-2xl">
            <Clock className="w-4 h-4 text-orange-400 animate-pulse" />
            <div className="text-xs">
              <span className="text-slate-400 block leading-none">Cierre reservas (21:00 hs):</span>
              <span className="font-mono font-black text-orange-400 text-sm">{countdownText}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PwaOneTapInstaller customerPhone={customerPhone} />
            <Link
              href="/admin"
              className="text-xs px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-6 pb-2"><div className="rounded-3xl bg-gradient-to-r from-amber-500/20 via-orange-600/20 to-amber-500/20 border-2 border-amber-400/60 p-5 md:p-7 text-center shadow-2xl space-y-3"><div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider">🚀 LANZAMIENTO · 21/11/2026 a las 11:00 AM</div><h2 className="text-2xl md:text-4xl font-black text-white">Cuenta regresiva para el gran estreno</h2><div className="font-mono text-3xl md:text-5xl font-black text-amber-300 tracking-wider">{countdownText}</div><p className="text-xs md:text-sm text-amber-100/95 bg-slate-950/70 border border-amber-400/30 rounded-2xl px-4 py-2.5 max-w-2xl mx-auto">🛠️ <strong>Aviso:</strong> Estamos ultimando detalles y cargando mejoras en la app. Si notás que falta alguna sección, ¡no te preocupes! Tendremos todo 100% listo para el horario de lanzamiento.</p></div></section><section className="max-w-6xl mx-auto px-4 pt-8 pb-6">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/40 border border-slate-800 p-6 md:p-10 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-bold mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            PORCIONES GRANDES Y CONTUNDENTES · SIN ESCATIMAR
          </div>

          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight max-w-3xl">
            Comida casera abundante y hamburguesas reales,{' '}
            <span className="text-orange-400">reservadas hoy para mañana.</span>
          </h2>

          <p className="text-slate-300 mt-4 max-w-2xl text-sm md:text-base leading-relaxed">
            Platos muy bien servidos pensados para trabajadores y familias de Maldonado y Playa Mansa (Paradas 1 a 25).
            Seguimiento en vivo del repartidor hasta que llegue a tu puerta.
          </p>

          {bookingWindow && (
            <div className="mt-5 p-3.5 rounded-2xl bg-slate-950/80 border border-amber-500/30 text-xs md:text-sm text-amber-200 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {bookingWindow.bannerMessage} · Entrega programada para:{' '}
                <strong className="text-white">
                  {bookingWindow.targetDayLabel} ({bookingWindow.targetDeliveryDate})
                </strong>
              </span>
            </div>
          )}

          {customerProfile && (
            <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase font-bold text-emerald-400">
                  Hola {customerProfile.full_name} · Tu progreso Sabor Goo
                </p>
                <p className="text-sm text-white font-semibold">
                  Racha: {customerProfile.consecutive_business_days}/3 días · Referidos activos:{' '}
                  {customerProfile.active_daily_referrals_count}/10
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {customerProfile.has_free_daily_meal && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950">
                      COMIDA GRATIS DIARIA ACTIVA
                    </span>
                  )}
                  {customerProfile.has_25_off && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-orange-500 text-white">
                      25% OFF ACTIVO
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleShareReferralLink}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
              >
                <Share2 className="w-4 h-4" />
                {copiedRef ? '¡Link copiado!' : `Compartir mi link (${customerProfile.referral_code})`}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-6">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-orange-400">
              Paso a paso y beneficios exclusivos
            </span>
            <h3 className="text-2xl font-black text-white mt-1">
              ¿Cómo funciona Sabor Goo y cómo comer GRATIS todos los días?
            </h3>
          </div>

          <div className="grid md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="font-black text-orange-400 text-sm">1. Reserva antes de las 21:00</span>
              <p className="text-slate-300 leading-relaxed">
                Elige tu menú diario o hamburguesa de Lunes a Viernes. Si es finde o pasó las 21:00, reservas para el
                próximo día hábil o el lunes.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="font-black text-orange-400 text-sm">2. Pin exacto y pago fácil</span>
              <p className="text-slate-300 leading-relaxed">
                Marca tu puerta en Maldonado o Mansa (Paradas 1 a 25) y paga con Mercado Pago o efectivo con cálculo
                automático de cambio.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="font-black text-orange-400 text-sm">3. Confirmación en WhatsApp</span>
              <p className="text-slate-300 leading-relaxed">
                Al aprobarse el pedido, se abre tu WhatsApp con toda tu comanda lista y tu link de seguimiento en vivo
                del repartidor hasta tu puerta.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
              <span className="font-black text-orange-400 text-sm">4. Platos sin escatimar</span>
              <p className="text-slate-300 leading-relaxed">
                Cada vianda y hamburguesa sale abundante, fresca y bien servida para que quedes realmente satisfecho.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/70 to-slate-950 border border-emerald-500/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                <Gift className="w-5 h-5" />
                COMIDA GRATIS TODOS LOS DÍAS
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                Consigue <strong>10 compañeros o amigos referidos</strong> que compren a diario y te llevas{' '}
                <strong>1 comida 100% GRATIS cada día</strong> mientras mantengas tus 10 directos activos. Si bajas a
                9, conservas automáticamente tu 25% OFF.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-950 border border-orange-500/30 space-y-2">
              <div className="flex items-center gap-2 text-orange-400 font-black text-sm">
                <TrendingUp className="w-5 h-5" />
                25% OFF DESDE EL PRIMER DÍA
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                Haz tu pedido hoy, comparte tu link único en tu obra, oficina o grupo y si{' '}
                <strong>5 personas compran hoy mismo</strong>, tu primer pedido ya te queda con{' '}
                <strong>25% de descuento</strong>.
              </p>
            </div>

                        <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <ShieldCheck className="w-5 h-5" />
                25% OFF DE POR VIDA POR RACHA
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                Compra <strong>3 días hábiles seguidos</strong> (Lunes a Viernes; el finde no corta tu racha) y desde el
                4.º día pagas siempre <strong>25% menos</strong> mientras sigas pidiendo a diario.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-white">Menús Semanales y Hamburguesas</h3>
            <p className="text-xs text-slate-400">Selecciona el día para ver los platos disponibles y stock diario</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {daysList.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => setSelectedDay(d.day)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                  selectedDay === d.day
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {filteredMenus.length === 0 ? (
          <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
            Aún no hay menús cargados para este día. El administrador puede publicarlos desde el Panel Admin.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-5">
            {filteredMenus.map((item) => {
              const qty = cart[item.id] || 0;
              const outOfStock = item.daily_stock <= 0;
              return (
                <div
                  key={item.id}
                  className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="relative h-48 bg-slate-800">
                      <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/85 text-orange-300 text-[10px] font-bold">
                        {item.abundance_badge}
                      </span>
                      <span
                        className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[10px] font-black ${
                          outOfStock ? 'bg-red-600 text-white' : 'bg-emerald-500 text-slate-950'
                        }`}
                      >
                        {outOfStock ? 'AGOTADO HOY' : `Stock: ${item.daily_stock}`}
                      </span>
                    </div>

                    <div className="p-5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-black text-white text-lg leading-snug">{item.title}</h4>
                        <span className="font-black text-orange-400 text-lg shrink-0">${item.price_uyu}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                    </div>
                  </div>

                  <div className="px-5 pb-5">
                    {qty === 0 ? (
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => addItem(item.id)}
                        className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs transition"
                      >
                        {outOfStock ? 'Sin stock por hoy' : 'Agregar a mi pedido'}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-slate-950 border border-orange-500/40 rounded-2xl p-1.5">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-white"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-black text-sm text-white">{qty} en pedido</span>
                        <button
                          type="button"
                          disabled={qty >= item.daily_stock}
                          onClick={() => addItem(item.id)}
                          className="w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 flex items-center justify-center text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section id="checkout" className="max-w-6xl mx-auto px-4 py-6">
        <form
          onSubmit={handleSubmitOrder}
          className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 grid lg:grid-cols-2 gap-8"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-orange-400" />
              <h3 className="text-xl font-black text-white">Completa tu Reserva</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Tu Nombre</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Martín Rodríguez"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Tu Celular (WhatsApp)</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ej. 099123456"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Franja Horaria Deseada</label>
                <select
                  value={requestedTimeSlot}
                  onChange={(e) => setRequestedTimeSlot(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Código de Referido (Opcional)</label>
                <input
                  type="text"
                  value={referralCodeUsed}
                  onChange={(e) => setReferralCodeUsed(e.target.value.toUpperCase())}
                  placeholder="Ej. SG-A1B2C3"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Dirección exacta / Edificio / Obra / Timbre
              </label>
              <input
                type="text"
                required
                value={addressReference}
                onChange={(e) => setAddressReference(e.target.value)}
                placeholder="Ej. Av. Roosevelt Parada 12, Edificio Torre Sur, Portería"
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="space-y-2.5 pt-2">
              <label className="block text-xs font-bold text-slate-300">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('efectivo')}
                  className={`py-3 rounded-xl text-xs font-black border transition ${
                    paymentMethod === 'efectivo'
                      ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Efectivo al recibir
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mercadopago')}
                  className={`py-3 rounded-xl text-xs font-black border transition ${
                    paymentMethod === 'mercadopago'
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Tarjeta (Mercado Pago)
                </button>
              </div>

              {paymentMethod === 'efectivo' && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cashNeedsChange}
                      onChange={(e) => setCashNeedsChange(e.target.checked)}
                    />
                    ¿Necesitas cambio?
                  </label>

                  {cashNeedsChange && (
                    <div className="space-y-1.5">
                      <input
                        type="number"
                        min={estimatedTotalUyu}
                        value={cashPaidWithUyu}
                        onChange={(e) => setCashPaidWithUyu(e.target.value)}
                        placeholder="¿Con cuánto pagas? Ej. 500 o 1000"
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                      />
                      <p className="text-xs text-emerald-400 font-bold">
                        Cambio exacto que llevará el repartidor: ${cashChangePreview} UYU
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-orange-400" />
                  Marca tu punto exacto en el mapa
                </span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    geoValidation.allowed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {geoValidation.allowed ? geoValidation.zoneName : 'Fuera de cobertura'}
                </span>
              </div>

              <div className="h-60 rounded-2xl overflow-hidden border border-slate-800">
                  <InteractiveDeliveryMap
                  selectedLat={pinLat}
                  selectedLng={pinLng}
                  centerLat={storeLocation.lat}
                  centerLng={storeLocation.lng}
                  onSelectLocation={(newLat: number, newLng: number) => {
                    setPinLat(newLat);
                    setPinLng(newLng);
                  }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal ({cartItemsList.reduce((acc, i) => acc + i.qty, 0)} platos):</span>
                <span>${subtotalUyu} UYU</span>
              </div>
              {estimatedDiscountUyu > 0 && (
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Descuento / Beneficio aplicado:</span>
                  <span>-${estimatedDiscountUyu} UYU</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-slate-800">
                <span>Total estimado a pagar:</span>
                <span className="text-orange-400">${estimatedTotalUyu} UYU</span>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {activeOrderId && (
              <Link
                href={`/seguimiento/${activeOrderId}`}
                className="w-full py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4" />
                Ver seguimiento en vivo de mi repartidor
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}

            <button
              type="submit"
              disabled={submitting || cartItemsList.length === 0 || !geoValidation.allowed}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-xl shadow-orange-500/20 transition"
            >
              {submitting
                ? 'Procesando reserva...'
                : paymentMethod === 'mercadopago'
                  ? 'Pagar con Mercado Pago y Confirmar'
                  : 'Confirmar Pedido y Enviar a WhatsApp'}
            </button>
          </div>
        </form>
      </section>

      <AiConciergeChat />
    </main>
  );
}
