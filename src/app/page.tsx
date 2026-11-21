'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
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
  AlertTriangle,
  ExternalLink,
  X,
  Check,
  Trash2,
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

interface SmartCartItem {
  cartKey: string;
  menu: MenuItem;
  qty: number;
  protein: 'Carne' | 'Pollo';
  condiments: string[];
  extras: string[];
  unitTotalUyu: number;
}

const FREE_CONDIMENTS = ['Lechuga','Tomate','Mayonesa','Mostaza','Ketchup','Picantina','Criolla','Pesto'];
const PAID_EXTRAS = [{name:'Extra de Muzza',price:80},{name:'Doble Carne',price:140}];

const LAUNCH_CATALOG: MenuItem[] = [
  { id: 'chivito-pan-1', day_of_week: 1, day_label: 'Chivitería', title: 'Chivito al pan para 1', description: 'Carne nalga de ternera, jamón, lechuga, tomate, panceta, huevo frito y aderezos. Incluye papas fritas.', abundance_badge: 'Hecho al instante', category: 'menu_diario', price_uyu: 620, ingredient_cost_uyu: 0, image_url: '/menus/chivito-pan.jpg', daily_stock: 99, is_active: true },
  { id: 'chivito-plato-1', day_of_week: 1, day_label: 'Chivitería', title: 'Chivito al plato para 1', description: 'Carne de nalga de ternera, lechuga, tomate, jamón, panceta, huevo frito, muzzarella, papas fritas, mixta y rusa.', abundance_badge: 'Hecho al instante', category: 'menu_diario', price_uyu: 790, ingredient_cost_uyu: 0, image_url: '/menus/chivito-plato.jpg', daily_stock: 99, is_active: true },
  { id: 'hamburguesa-especial-1', day_of_week: 1, day_label: 'Hamburguesas', title: 'Hamburguesa especial de carne picada', description: 'Carne picada, lechuga, tomate, jamón, queso muzza, huevo frito, panceta, con fritas.', abundance_badge: 'Hecho al instante', category: 'hamburguesa', price_uyu: 380, ingredient_cost_uyu: 0, image_url: '/menus/hamburguesa-especial.jpg', daily_stock: 99, is_active: true },
  { id: 'napolitana-1', day_of_week: 1, day_label: 'Minutas', title: 'Napolitana para 1', description: 'Milanesa de carne al plato, salsa, muzza, jamón, huevo frito y guarnición.', abundance_badge: 'Hecho al instante', category: 'menu_diario', price_uyu: 720, ingredient_cost_uyu: 0, image_url: '/menus/napolitana.jpg', daily_stock: 99, is_active: true },
  { id: 'hamburguesa-clasica-1', day_of_week: 1, day_label: 'Hamburguesas', title: 'Hamburguesa común de carne picada', description: 'Carne picada, lechuga, tomate, huevo duro y aderezos.', abundance_badge: 'Hecho al instante', category: 'hamburguesa', price_uyu: 280, ingredient_cost_uyu: 0, image_url: '/menus/hamburguesa-clasica.jpg', daily_stock: 99, is_active: true },
];

export default function HomePage() {
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [storeLocation, setStoreLocation] = useState({ lat: -34.9089, lng: -54.9583 });
  const [smartCart, setSmartCart] = useState<SmartCartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<MenuItem | null>(null);
  const [modalProtein, setModalProtein] = useState<'Carne' | 'Pollo'>('Carne');
  const [modalCondiments, setModalCondiments] = useState<string[]>(['Lechuga', 'Tomate', 'Mayonesa']);
  const [modalExtras, setModalExtras] = useState<string[]>([]);
  const [modalQty, setModalQty] = useState<number>(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [requestedTimeSlot, setRequestedTimeSlot] = useState('Entrega inmediata');
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
    if (refParam) { setReferralCodeUsed(refParam.toUpperCase()); localStorage.setItem('sabor_goo_ref_used', refParam.toUpperCase()); }
    else { const savedRef = localStorage.getItem('sabor_goo_ref_used'); if (savedRef) setReferralCodeUsed(savedRef); }
    let token = localStorage.getItem('sabor_goo_device_token');
    if (!token) { token = 'sg_' + Math.random().toString(36).slice(2) + '_' + Date.now(); localStorage.setItem('sabor_goo_device_token', token); }
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
      const query = phoneToQuery ? '?phone=' + encodeURIComponent(phoneToQuery) : '';
      const res = await fetch('/api/orders' + query);
      const data = await res.json();
      if (Array.isArray(data.menus)) setMenus(data.menus);
      if (data.settings?.store_lat && data.settings?.store_lng) setStoreLocation({ lat: data.settings.store_lat, lng: data.settings.store_lng });
      if (data.customer) setCustomerProfile(data.customer);
      if (data.activeOrder?.id) setActiveOrderId(data.activeOrder.id);
    } catch {}
  }

  useEffect(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length >= 8) { const t = setTimeout(() => fetchCatalogAndProfile(customerPhone), 500); return () => clearTimeout(t); }
  }, [customerPhone]);

  const geoValidation = useMemo(() => validateDeliveryCoverage(pinLat, pinLng, storeLocation.lat, storeLocation.lng), [pinLat, pinLng, storeLocation]);
  const modalExtrasTotalUyu = useMemo(() => modalExtras.reduce((acc, n) => acc + (PAID_EXTRAS.find((e) => e.name === n)?.price || 0), 0), [modalExtras]);
  const modalUnitPriceUyu = selectedProduct ? selectedProduct.price_uyu + modalExtrasTotalUyu : 0;
  const subtotalUyu = useMemo(() => smartCart.reduce((acc, i) => acc + i.unitTotalUyu * i.qty, 0), [smartCart]);
  const totalDishesCount = useMemo(() => smartCart.reduce((acc, i) => acc + i.qty, 0), [smartCart]);
  const estimatedDiscountUyu = useMemo(() => {
    const first = smartCart.at(0);
    if (!customerProfile || !first) return 0;
    if (customerProfile.has_free_daily_meal) return first.unitTotalUyu;
    if (customerProfile.has_25_off) return Math.round(subtotalUyu * 0.25);
    return 0;
  }, [customerProfile, smartCart, subtotalUyu]);
  const estimatedTotalUyu = Math.max(0, subtotalUyu - estimatedDiscountUyu);
  const cashChangePreview = useMemo(() => {
    if (paymentMethod !== 'efectivo' || !cashNeedsChange) return 0;
    const paid = Number(cashPaidWithUyu || 0);
    return paid >= estimatedTotalUyu ? paid - estimatedTotalUyu : 0;
  }, [paymentMethod, cashNeedsChange, cashPaidWithUyu, estimatedTotalUyu]);

  function openProductModal(item: MenuItem) {
    if (item.daily_stock <= 0) return;
    setSelectedProduct(item); setModalProtein('Carne'); setModalCondiments(['Lechuga', 'Tomate', 'Mayonesa']); setModalExtras([]); setModalQty(1);
  }
  function toggleCondiment(name: string) { setModalCondiments((p) => p.includes(name) ? p.filter((c) => c !== name) : [...p, name]); }
  function togglePaidExtra(name: string) { setModalExtras((p) => p.includes(name) ? p.filter((e) => e !== name) : [...p, name]); }
  function handleConfirmAddToCart() {
    if (!selectedProduct) return;
    const sc = [...modalCondiments].sort();
    const se = [...modalExtras].sort();
    const cartKey = selectedProduct.id + '|' + modalProtein + '|' + sc.join(',') + '|' + se.join(',');
    setSmartCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], qty: u[idx].qty + modalQty }; return u; }
      return [...prev, { cartKey, menu: selectedProduct, qty: modalQty, protein: modalProtein, condiments: sc, extras: se, unitTotalUyu: modalUnitPriceUyu }];
    });
    setSelectedProduct(null);
  }
  function updateCartLineQty(cartKey: string, delta: number) { setSmartCart((prev) => prev.map((i) => (i.cartKey === cartKey ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0)); }
  function getMenuTotalInCart(menuId: string) { return smartCart.filter((i) => i.menu.id === menuId).reduce((acc, i) => acc + i.qty, 0); }

  function handleUseCurrentGps() {
    if (!navigator.geolocation) { setErrorMsg('Tu navegador no soporta GPS automático. Marca tu punto en el mapa.'); return; }
    navigator.geolocation.getCurrentPosition((pos) => { setPinLat(Number(pos.coords.latitude.toFixed(6))); setPinLng(Number(pos.coords.longitude.toFixed(6))); setErrorMsg(null); }, () => setErrorMsg('No se pudo obtener tu GPS. Toca directamente sobre el mapa tu ubicación.'), { enableHighAccuracy: true, timeout: 8000 });
  }
  function handleShareReferralLink() {
    if (!customerProfile?.referral_code) return;
    navigator.clipboard?.writeText(window.location.origin + '/?ref=' + customerProfile.referral_code);
    setCopiedRef(true); setTimeout(() => setCopiedRef(false), 3000);
  }
  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault(); setErrorMsg(null);
    if (smartCart.length === 0) { setErrorMsg('Agrega al menos un plato a tu carrito.'); return; }
    if (!geoValidation.allowed) { setErrorMsg(geoValidation.reason || 'La ubicación marcada está fuera de zona de reparto.'); return; }
    setSubmitting(true);
    try {
      localStorage.setItem('sabor_goo_name', customerName.trim());
      localStorage.setItem('sabor_goo_phone', customerPhone.trim());
      localStorage.setItem('sabor_goo_address', addressReference.trim());
      const customNotes = smartCart.map((i) => i.qty + 'x ' + i.menu.title + ' (' + i.protein + (i.condiments.length ? ' | ' + i.condiments.join(', ') : '') + (i.extras.length ? ' | EXTRAS: ' + i.extras.join(', ') : '') + ')').join(' // ');
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName, customerPhone, deliveryDate: new Date().toISOString().slice(0, 10),
          requestedTimeSlot: (requestedTimeSlot || 'Entrega inmediata').slice(0, 40),
          addressReference, lat: pinLat, lng: pinLng,
          items: smartCart.map((i) => ({ menu_id: i.menu.id, title: i.menu.title, qty: i.qty, unit_price: i.unitTotalUyu, protein: i.protein, condiments: i.condiments, extras: i.extras })),
          paymentMethod, cashNeedsChange, cashPaidWithUyu: Number(cashPaidWithUyu || 0), referralCodeUsed: referralCodeUsed || null, deviceToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || 'No se pudo procesar tu pedido.'); setSubmitting(false); return; }
      if (data.requiresMercadoPago && data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      if (data.whatsappUrl) { window.location.href = data.whatsappUrl; return; }
      if (data.trackingUrl) { window.location.href = data.trackingUrl; }
    } catch { setErrorMsg('Error de conexión al enviar tu pedido. Intenta nuevamente.'); setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-orange-500/20">SG</div>
            <div>
              <h1 className="font-black text-lg tracking-tight text-white leading-none">Sabor <span className="text-orange-400">Goo</span></h1>
              <p className="text-[11px] text-slate-400">Maldonado &amp; Playa Mansa (P.1 a P.25)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalDishesCount > 0 && (
              <a href="#checkout" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-orange-500/25 transition">
                <ShoppingBag className="w-4 h-4" />
                <span>{totalDishesCount} · ${estimatedTotalUyu} UYU</span>
              </a>
            )}
            <PwaOneTapInstaller customerPhone={customerPhone} />
            <Link href="/admin" className="text-xs px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400">Admin</Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-6 pb-4">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/40 border border-slate-800 p-6 md:p-10 shadow-2xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-bold mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            PORCIONES GRANDES Y CONTUNDENTES · SIN ESCATIMAR
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight max-w-3xl">Chivitos uruguayos reales y hamburguesas artesanales, <span className="text-amber-400">hechos al instante.</span></h2>
          <p className="text-slate-300 mt-4 max-w-2xl text-sm md:text-base leading-relaxed">Chivitos al pan, al plato, napolitanas y hamburguesas recién hechos en Maldonado y Playa Mansa (Paradas 1 a 25). Tocá tu plato favorito para elegir gustos y aderezos.</p>
          {customerProfile && (
            <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase font-bold text-emerald-400">Hola {customerProfile.full_name} · Tu progreso Sabor Goo</p>
                <p className="text-sm text-white font-semibold">Racha: {customerProfile.consecutive_business_days}/3 días · Referidos activos: {customerProfile.active_daily_referrals_count}/10</p>
              </div>
              <button type="button" onClick={handleShareReferralLink} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition">
                <Share2 className="w-4 h-4" />
                {copiedRef ? '¡Link copiado!' : 'Compartir mi link (' + customerProfile.referral_code + ')'}
              </button>
            </div>
          )}
        </div>
      </section>

      <section id="menu" className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl md:text-3xl font-black text-white">Nuestro Menú</h3>
            <p className="text-xs md:text-sm text-slate-400">Tocá cualquier menú para verlo en grande, elegir carne o pollo, aderezos gratis y extras</p>
          </div>
          {totalDishesCount > 0 && <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-orange-500/40 text-xs font-bold text-orange-300">Carrito: {totalDishesCount} {totalDishesCount === 1 ? 'plato' : 'platos'} · ${subtotalUyu} UYU</div>}
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {menus.map((item) => {
            const inCartQty = getMenuTotalInCart(item.id);
            const outOfStock = item.daily_stock <= 0;
            return (
              <div key={item.id} onClick={() => openProductModal(item)} className="group cursor-pointer rounded-3xl bg-slate-900 border border-slate-800 hover:border-orange-500/60 overflow-hidden flex flex-col justify-between transition shadow-lg">
                <div>
                  <div className="relative h-52 bg-slate-800 overflow-hidden">
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/85 text-orange-300 text-[10px] font-bold">{item.abundance_badge}</span>
                    <span className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[10px] font-black ${outOfStock ? 'bg-red-600 text-white' : 'bg-emerald-500 text-slate-950'}`}>{outOfStock ? 'AGOTADO HOY' : 'Stock: ' + item.daily_stock}</span>
                    {inCartQty > 0 && <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-orange-500 text-slate-950 font-black text-xs shadow-lg">{inCartQty} en carrito</span>}
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-black text-white text-lg leading-snug group-hover:text-orange-400 transition">{item.title}</h4>
                      <span className="font-black text-orange-400 text-lg shrink-0">${item.price_uyu}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <button type="button" disabled={outOfStock} onClick={(e) => { e.stopPropagation(); openProductModal(item); }} className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black text-xs transition flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" />{outOfStock ? 'Sin stock por hoy' : 'Elegir gustos y agregar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-6">
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-orange-400">Paso a paso y beneficios exclusivos</span>
            <h3 className="text-2xl font-black text-white mt-1">¿Cómo funciona Sabor Goo y cómo comer GRATIS todos los días?</h3>
          </div>
          <div className="grid md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"><span className="font-black text-orange-400 text-sm">1. Armá tu plato a medida</span><p className="text-slate-300 leading-relaxed">Elegí entre carne o pollo, todos los aderezos gratis que quieras y extras como muzza o doble carne.</p></div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"><span className="font-black text-orange-400 text-sm">2. Pin exacto y pago fácil</span><p className="text-slate-300 leading-relaxed">Marca tu puerta en Maldonado o Mansa (Paradas 1 a 25) y paga con Mercado Pago o efectivo con cálculo automático de cambio.</p></div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"><span className="font-black text-orange-400 text-sm">3. Confirmación en WhatsApp</span><p className="text-slate-300 leading-relaxed">Al confirmarse el pedido, se abre tu WhatsApp con toda tu comanda lista y tu link de seguimiento en vivo hasta tu puerta.</p></div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5"><span className="font-black text-orange-400 text-sm">4. Platos sin escatimar</span><p className="text-slate-300 leading-relaxed">Cada chivito, napolitana y hamburguesa sale abundante, fresca y bien servida para que quedes realmente satisfecho.</p></div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/70 to-slate-950 border border-emerald-500/40 space-y-2"><div className="flex items-center gap-2 text-emerald-400 font-black text-sm"><Gift className="w-5 h-5" />COMIDA GRATIS TODOS LOS DÍAS</div><p className="text-xs text-slate-200 leading-relaxed">Consigue <strong>10 compañeros o amigos referidos</strong> que compren a diario y te llevas <strong>1 comida 100% GRATIS cada día</strong> mientras mantengas tus 10 directos activos.</p></div>
            <div className="p-5 rounded-2xl bg-slate-950 border border-orange-500/30 space-y-2"><div className="flex items-center gap-2 text-orange-400 font-black text-sm"><TrendingUp className="w-5 h-5" />25% OFF DESDE EL PRIMER DÍA</div><p className="text-xs text-slate-200 leading-relaxed">Comparte tu link único y si <strong>5 personas compran hoy mismo</strong>, tu primer pedido ya te queda con <strong>25% de descuento</strong>.</p></div>
            <div className="p-5 rounded-2xl bg-slate-950 border border-amber-500/30 space-y-2"><div className="flex items-center gap-2 text-amber-400 font-black text-sm"><ShieldCheck className="w-5 h-5" />25% OFF DE POR VIDA POR RACHA</div><p className="text-xs text-slate-200 leading-relaxed">Compra <strong>3 días hábiles seguidos</strong> (Lunes a Viernes) y desde el 4.º día pagas siempre <strong>25% menos</strong> mientras sigas pidiendo a diario.</p></div>
          </div>
        </div>
      </section>

      <section id="checkout" className="max-w-6xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmitOrder} className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 grid lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-orange-400" /><h3 className="text-xl font-black text-white">Tu Carrito Inteligente</h3></div>
              {smartCart.length > 0 && <button type="button" onClick={() => setSmartCart([])} className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Vaciar</button>}
            </div>
            {smartCart.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-950 border border-dashed border-slate-700 text-center space-y-2">
                <p className="text-sm font-bold text-slate-300">Tu carrito está vacío</p>
                <p className="text-xs text-slate-400">Tocá cualquier plato del menú arriba para elegir carne o pollo, aderezos y sumarlo aquí.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {smartCart.map((line) => (
                  <div key={line.cartKey} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-black text-white">{line.menu.title} <span className="text-orange-400">({line.protein})</span></p>
                      {line.condiments.length > 0 && <p className="text-[11px] text-slate-400">Aderezos: {line.condiments.join(', ')}</p>}
                      {line.extras.length > 0 && <p className="text-[11px] text-amber-400 font-bold">Extras: {line.extras.join(', ')}</p>}
                      <p className="text-xs font-black text-emerald-400">${line.unitTotalUyu * line.qty} UYU <span className="text-slate-500 font-normal">(${line.unitTotalUyu} c/u)</span></p>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl p-1 shrink-0">
                      <button type="button" onClick={() => updateCartLineQty(line.cartKey, -1)} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="text-xs font-black text-white px-1.5">{line.qty}</span>
                      <button type="button" onClick={() => updateCartLineQty(line.cartKey, 1)} className="w-7 h-7 rounded-lg bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-white"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Tu Nombre</label><input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ej. Martín Rodríguez" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white" /></div>
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Tu Celular (WhatsApp)</label><input type="tel" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ej. 099123456" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Nota extra para cocina (Opcional)</label><input type="text" value={requestedTimeSlot} onChange={(e) => setRequestedTimeSlot(e.target.value)} placeholder="Ej. Papas bien crocantes" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white" /></div>
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Código de Referido (Opcional)</label><input type="text" value={referralCodeUsed} onChange={(e) => setReferralCodeUsed(e.target.value.toUpperCase())} placeholder="Ej. SG-A1B2C3" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white uppercase" /></div>
            </div>
            <div><label className="block text-xs font-bold text-slate-300 mb-1">Dirección exacta / Edificio / Apto / Timbre</label><input type="text" required value={addressReference} onChange={(e) => setAddressReference(e.target.value)} placeholder="Ej. Av. Roosevelt Parada 12, Edificio Torre Sur" className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white" /></div>
            <div className="space-y-2.5 pt-2">
              <label className="block text-xs font-bold text-slate-300">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setPaymentMethod('efectivo')} className={`py-3 rounded-xl text-xs font-black border transition ${paymentMethod === 'efectivo' ? 'bg-orange-500/20 border-orange-500 text-orange-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>Efectivo al recibir</button>
                <button type="button" onClick={() => setPaymentMethod('mercadopago')} className={`py-3 rounded-xl text-xs font-black border transition ${paymentMethod === 'mercadopago' ? 'bg-sky-500/20 border-sky-500 text-sky-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>Tarjeta (Mercado Pago)</button>
              </div>
              {paymentMethod === 'efectivo' && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer"><input type="checkbox" checked={cashNeedsChange} onChange={(e) => setCashNeedsChange(e.target.checked)} /> ¿Necesitas cambio?</label>
                  {cashNeedsChange && (<div className="space-y-1.5"><input type="number" min={estimatedTotalUyu} value={cashPaidWithUyu} onChange={(e) => setCashPaidWithUyu(e.target.value)} placeholder="¿Con cuánto pagas? Ej. 1000" className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" /><p className="text-xs text-emerald-400 font-bold">Cambio exacto: ${cashChangePreview} UYU</p></div>)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-300 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-orange-400" />Punto GPS</span><button type="button" onClick={handleUseCurrentGps} className="text-[11px] font-bold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40 px-2.5 py-1 rounded-lg transition">Usar mi GPS actual</button></div>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${geoValidation.allowed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{geoValidation.allowed ? geoValidation.zoneName + ' · ' + geoValidation.distanceFromStoreKm + ' km' : 'Fuera de cobertura'}</span>
              </div>
              <div className="h-64 rounded-2xl overflow-hidden border border-slate-800"><InteractiveDeliveryMap selectedLat={pinLat} selectedLng={pinLng} centerLat={storeLocation.lat} centerLng={storeLocation.lng} onSelectLocation={(newLat: number, newLng: number) => { setPinLat(newLat); setPinLng(newLng); }} /></div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400"><span>Subtotal ({totalDishesCount} platos):</span><span className="font-bold text-white">${subtotalUyu} UYU</span></div>
              {estimatedDiscountUyu > 0 && <div className="flex justify-between text-emerald-400 font-bold"><span>Descuento aplicado:</span><span>-${estimatedDiscountUyu} UYU</span></div>}
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-slate-800"><span>Total a pagar:</span><span className="text-orange-400">${estimatedTotalUyu} UYU</span></div>
            </div>
            {errorMsg && <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0 text-red-400" /><span>{errorMsg}</span></div>}
            {activeOrderId && <Link href={`/tracking/${activeOrderId}`} className="w-full py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2"><Navigation className="w-4 h-4" />Ver seguimiento en vivo<ExternalLink className="w-3.5 h-3.5" /></Link>}
            <button type="submit" disabled={submitting || smartCart.length === 0 || !geoValidation.allowed} className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-40 text-slate-950 font-black text-sm shadow-xl shadow-orange-500/20 transition">
              {submitting ? 'Confirmando pedido...' : 'Confirmar Pedido ($' + estimatedTotalUyu + ' UYU) y Enviar a WhatsApp'}
            </button>
          </div>
        </form>
      </section>

      {selectedProduct && (
        <div onClick={() => setSelectedProduct(null)} className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl my-auto">
            <div className="relative h-64 sm:h-72 bg-slate-800">
              <img src={selectedProduct.image_url} alt={selectedProduct.title} className="w-full h-full object-cover" />
              <button type="button" onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-950/85 hover:bg-slate-900 text-white flex items-center justify-center border border-slate-700"><X className="w-5 h-5" /></button>
              <span className="absolute bottom-3 left-4 px-3 py-1 rounded-full bg-orange-500 text-slate-950 font-black text-xs">Base: ${selectedProduct.price_uyu} UYU</span>
            </div>
            <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
              <div><h3 className="text-2xl font-black text-white">{selectedProduct.title}</h3><p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">{selectedProduct.description}</p></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-orange-400">1. Elegí el gusto principal</span><span className="text-[11px] font-bold text-emerald-400">Incluido (Gratis)</span></div>
                <div className="grid grid-cols-2 gap-3">
                  {(['Carne', 'Pollo'] as const).map((option) => (<button key={option} type="button" onClick={() => setModalProtein(option)} className={`py-3 px-4 rounded-2xl font-black text-sm border flex items-center justify-between transition ${modalProtein === option ? 'bg-orange-500/20 border-orange-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}><span>{option}</span>{modalProtein === option && <Check className="w-4 h-4 text-orange-400" />}</button>))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-orange-400">2. Gustos y Aderezos</span><span className="text-[11px] font-bold text-emerald-400">Todos Gratis</span></div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FREE_CONDIMENTS.map((cond) => { const active = modalCondiments.includes(cond); return (<button key={cond} type="button" onClick={() => toggleCondiment(cond)} className={`py-2.5 px-3 rounded-xl text-xs font-bold border flex items-center justify-between transition ${active ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}><span>{cond}</span>{active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}</button>); })}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-wider text-amber-400">3. Extras opcionales (Pagos)</span><span className="text-[11px] text-slate-400">Sumá potencia</span></div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {PAID_EXTRAS.map((extra) => { const active = modalExtras.includes(extra.name); return (<button key={extra.name} type="button" onClick={() => togglePaidExtra(extra.name)} className={`py-3 px-4 rounded-2xl text-xs font-black border flex items-center justify-between transition ${active ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'}`}><span>{extra.name}</span><span className="text-amber-400">+${extra.price} UYU</span></button>); })}
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-2xl p-1.5">
                <button type="button" onClick={() => setModalQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"><Minus className="w-4 h-4" /></button>
                <span className="font-black text-base text-white px-2">{modalQty}</span>
                <button type="button" onClick={() => setModalQty((q) => Math.min(selectedProduct.daily_stock, q + 1))} className="w-9 h-9 rounded-xl bg-orange-500 hover:bg-orange-400 flex items-center justify-center text-white"><Plus className="w-4 h-4" /></button>
              </div>
              <button type="button" onClick={handleConfirmAddToCart} className="flex-1 min-w-[200px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-black text-sm shadow-lg shadow-orange-500/25 transition">Agregar al carrito · ${modalUnitPriceUyu * modalQty} UYU</button>
            </div>
          </div>
        </div>
      )}
      <AiConciergeChat />
    </main>
  );
}
