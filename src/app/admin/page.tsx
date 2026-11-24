'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Shield,
  Lock,
  LogOut,
  Truck,
  Navigation,
  DollarSign,
  Ban,
  Bot,
  UtensilsCrossed,
  Play,
  Square,
  Plus,
  QrCode,
  Copy,
  Check,
  Download,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { AdminAccountPublic, AppSettings, MenuItem, OrderRecord, VehicleType } from '@/types';
import { RouteStopEstimate } from '@/lib/logistics';
import { playSoftAlertChime, startPedidosYaAlarm, stopPedidosYaAlarm } from '@/components/PwaOneTapInstaller';
import { MapMarkerPoint } from '@/components/InteractiveDeliveryMap';

const InteractiveDeliveryMap = dynamic(
  () => import('@/components/InteractiveDeliveryMap'),
  { ssr: false }
);

interface FinancePeriod {
  ordersCount: number;
  revenueUyu: number;
  ingredientCostUyu: number;
  freeMealsDiscountUyu: number;
  netProfitUyu: number;
  marginPercent: number;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);useEffect(()=>{if(authenticated===true)(window as any).SaborGooAdmin?.enableAlarm?.();},[authenticated]);
  const [adminUser, setAdminUser] = useState<{
    id: string;
    email: string;
    fullName: string;
    role: string;
  } | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submittingLogin, setSubmittingLogin] = useState(false);

    const [manForm,setManForm]=useState({name:'',phone:'',address:'',menuId:'',qty:1,notes:'Pedido WhatsApp',payment:'efectivo'});const [savingMan,setSavingMan]=useState(false);const [activeTab, setActiveTab] = useState<'pedidos' | 'manual' | 'ruta' | 'menus' | 'finanzas' | 'motores'>('pedidos');
    const [showQrModal, setShowQrModal] = useState(false);
  const [copiedQrUrl, setCopiedQrUrl] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!showQrModal || typeof window === 'undefined') return;
    QRCode.toDataURL(window.location.origin, {
      width: 600,
      margin: 2,
      color: { dark: '#020617', light: '#ffffff' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [showQrModal]);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [routeSchedule, setRouteSchedule] = useState<RouteStopEstimate[]>([]);
  const [finances, setFinances] = useState<{
    daily: FinancePeriod;
    weekly: FinancePeriod;
    monthly: FinancePeriod;
  } | null>(null);
  const [engineLogs, setEngineLogs] = useState<Array<{ id: string; engine_name: string; mode: string; action_summary: string; created_at: string }>>([]);
  const [menus, setMenus] = useState<MenuItem[]>([]);
  const [blacklist, setBlacklist] = useState<Array<{ id: string; phone: string; customer_name: string; reference_address: string; reason: string; is_blocked: boolean }>>([]);
  const [radarAdmins, setRadarAdmins] = useState<AdminAccountPublic[]>([]);

  const [gpsActive, setGpsActive] = useState(false);
  const [delayAlertBanner, setDelayAlertBanner] = useState(false);

  const fileRef=require("react").useRef(null);const [menuForm, setMenuForm] = useState<any>({
    day_of_week: 1,
    day_label: 'Lunes',
    title: '',
    description: '',
    category: 'menu_diario' as 'menu_diario' | 'hamburguesa',
    price_uyu: 300,
    ingredient_cost_uyu: 130,
    image_url: 'https://unsplash.com',
    daily_stock: 30,
  });

  const [blForm, setBlForm] = useState({
    phone: '',
    customer_name: '',
    reference_address: '',
    reason: '',
  });

  useEffect(() => {
    fetch('/api/admin/auth')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setAuthenticated(true);
          setAdminUser(data.admin);
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  async function loadAllAdminData() {
    const [settingsRes, menusRes, blRes, radarRes] = await Promise.all([
      fetch('/api/admin/settings'),
      fetch('/api/admin/menus'),
      fetch('/api/admin/blacklist'),
      fetch('/api/admin/radar'),
    ]);

    if (settingsRes.ok) {
      const sData = await settingsRes.json();
      setSettings(sData.settings);
      setOrders(sData.orders || []);
      setRouteSchedule(sData.routeSchedule || []);
      setFinances(sData.finances || null);
      setEngineLogs(sData.engineLogs || []);
    }
    if (menusRes.ok) {
      const mData = await menusRes.json();
      setMenus(mData.menus || []);
    }
    if (blRes.ok) {
      const bData = await blRes.json();
      setBlacklist(bData.items || []);
    }
    if (radarRes.ok) {
      const rData = await radarRes.json();
      setRadarAdmins(rData.admins || []);
    }
  }

  useEffect(() => {
    if (authenticated) {
      loadAllAdminData();
    }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !gpsActive || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const res = await fetch('/api/admin/radar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            isOnDelivery: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.driverDelayAlert) {
            setDelayAlertBanner(true);
            startPedidosYaAlarm({title:'¡NUEVO PEDIDO CONFIRMADO!',body:'Toca para abrir o silenciar la alarma.'});
          }
          loadAllAdminData();
        }
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [authenticated, gpsActive]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setSubmittingLogin(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Credenciales incorrectas.');
      } else {
        setAuthenticated(true);
        setAdminUser(data.admin);
      }
    } catch {
      setLoginError('Error de conexión.');
    } finally {
      setSubmittingLogin(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAuthenticated(false);
    setAdminUser(null);
  }

    async function handleChangeVehicle(vehicle: VehicleType) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_vehicle: vehicle }),
    });
    if (res.ok) loadAllAdminData();
  }

  async function handleOrderStatus(orderId: string, orderStatus: string) {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, orderStatus }),
    });
    if (res.ok) loadAllAdminData();
  }

  async function handleSaveMenu(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(menuForm),
    });
    if (res.ok) {
      setMenuForm({ day_of_week: 1, day_label: 'Lunes', title: '', description: '', category: 'menu_diario', price_uyu: 300, ingredient_cost_uyu: 130, image_url: 'https://unsplash.com', daily_stock: 30 });
      loadAllAdminData();
    }
  }

  async function handleUpdateMenuStockOrPrice(menu: MenuItem, field: 'daily_stock' | 'price_uyu' | 'ingredient_cost_uyu', value: number) {
    await fetch('/api/admin/menus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: menu.id,
        day_of_week: menu.day_of_week,
        day_label: menu.day_label,
        title: menu.title,
        description: menu.description,
        category: menu.category,
        price_uyu: field === 'price_uyu' ? value : menu.price_uyu,
        ingredient_cost_uyu: field === 'ingredient_cost_uyu' ? value : (menu.ingredient_cost_uyu || 0),
        image_url: menu.image_url,
        daily_stock: field === 'daily_stock' ? value : menu.daily_stock,
        is_active: menu.is_active,
      }),
    });
    loadAllAdminData();
  }

  async function handleAddBlacklist(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/admin/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blForm),
    });
    if (res.ok) {
      setBlForm({ phone: '', customer_name: '', reference_address: '', reason: '' });
      loadAllAdminData();
    }
  }

  async function handleToggleBlacklist(id: string, isBlocked: boolean) {
    await fetch('/api/admin/blacklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_blocked: isBlocked }),
    });
    loadAllAdminData();
  }

  async function handleToggleEngines(enabled: boolean) {
    const res = await fetch('/api/admin/engines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) loadAllAdminData();
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-sm font-bold animate-pulse">Verificando acceso seguro...</p>
      </div>
    );
  }

  if (!authenticated || !adminUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-5 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-xl text-white">Panel Sabor Goo</h1>
              <p className="text-xs text-slate-400">Acceso exclusivo socias y administración</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Email Administrador
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="socia1@saborgoo.uy"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
              />
            </div>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 font-semibold">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={submittingLogin}
            className="w-full py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-sm flex items-center justify-center gap-2 transition"
          >
            <Lock className="w-4 h-4" />
            {submittingLogin ? 'Ingresando...' : 'Ingresar al Panel'}
          </button></form>
      </div>
    );
  }

  const radarMarkers: MapMarkerPoint[] = [
    ...routeSchedule.map((s) => ({
      lat: s.lat,
      lng: s.lng,
      label: `#${s.sequence} ${s.customerName} (${s.estimatedArrivalTimeStr} hs)`,
      color: 'orange' as const,
    })),
    ...radarAdmins
      .filter((a) => typeof a.current_lat === 'number' && typeof a.current_lng === 'number')
      .map((a) => ({
        lat: a.current_lat as number,
        lng: a.current_lng as number,
        label: `Admin: ${a.full_name}`,
        color: 'blue' as const,
      })),
  ];

    return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <header className="border-b border-slate-800 bg-slate-900/90 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-black text-lg text-white">Sabor Goo · Panel Operativo</h1>
            <p className="text-xs text-amber-400">
              {adminUser.fullName} ({adminUser.role})
            </p>
          </div>

                    <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs shadow transition"
            >
              <QrCode className="w-4 h-4" />
              QR Web
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold px-3.5 py-2 rounded-xl text-slate-200"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        </div>

        {showQrModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-base text-white flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-400" />
                  Código QR de la Web
                </h2>
                <button
                  type="button"
                  onClick={() => setShowQrModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400">
                Escaneá este código para ir directo al menú y hacer pedidos al instante.
              </p>

                            {(() => {
                const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://sabor-goo.vercel.app';
                return (
                  <>
                    <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-inner">
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt="Código QR Sabor Goo"
                          className="w-52 h-52 object-contain"
                        />
                      ) : (
                        <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-500">
                          Generando QR...
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono break-all">
                      {siteUrl}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(siteUrl);
                          setCopiedQrUrl(true);
                          setTimeout(() => setCopiedQrUrl(false), 2000);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition"
                      >
                        {copiedQrUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copiedQrUrl ? '¡Copiado!' : 'Copiar Link'}
                      </button>

                      <button
                        type="button"
                        disabled={!qrDataUrl}
                        onClick={() => {
                          if (!qrDataUrl) return;
                          const link = document.createElement('a');
                          link.href = qrDataUrl;
                          link.download = 'qr-chiveteria-sabor-goo.png';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition"
                      >
                        <Download className="w-4 h-4" />
                        Descargar QR
                      </button>
                    </div>
                  </>
                );
              })()}

            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {[
            { id: 'pedidos', label: 'Pedidos en Vivo', icon: Truck },{ id: 'manual', label: 'Pedido Manual (WA)', icon: Plus },
            { id: 'ruta', label: 'Repartidor & Radar', icon: Navigation },
            { id: 'menus', label: 'Menús, Costos y Stock', icon: UtensilsCrossed },
            { id: 'finanzas', label: 'Finanzas & Lista Negra', icon: DollarSign },
            { id: 'motores', label: '5 Motores IA 24/7', icon: Bot },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === tab.id
                    ? 'bg-orange-600 text-white shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {activeTab === 'manual' && (<section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-w-xl"><h3 className="text-lg font-black text-white">Cargar Pedido Manual (WhatsApp / Mostrador)</h3><div className="grid grid-cols-2 gap-3"><input placeholder="Nombre cliente" value={manForm.name} onChange={e=>setManForm({...manForm,name:e.target.value})} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/><input placeholder="Telefono WhatsApp" value={manForm.phone} onChange={e=>setManForm({...manForm,phone:e.target.value})} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div><input placeholder="Direccion y Zona" value={manForm.address} onChange={e=>setManForm({...manForm,address:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/><div className="grid grid-cols-3 gap-3"><select value={manForm.menuId||(menus[0]?.id||'')} onChange={e=>setManForm({...manForm,menuId:e.target.value})} className="col-span-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">{menus.map(it=><option key={it.id} value={it.id}>{it.title} (${it.price_uyu})</option>)}</select><input type="number" min={1} value={manForm.qty} onChange={e=>setManForm({...manForm,qty:Number(e.target.value)||1})} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/></div><input placeholder="Gustos, proteina, extras y notas" value={manForm.notes} onChange={e=>setManForm({...manForm,notes:e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"/><button type="button" disabled={savingMan} onClick={async()=>{const it=menus.find(x=>x.id===(manForm.menuId||menus[0]?.id));if(!it||!manForm.name.trim())return;setSavingMan(true);try{const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:manForm.name,customerPhone:manForm.phone||'099000000',deliveryDate:new Date().toISOString().slice(0,10),requestedTimeSlot:'Inmediata',zoneName:'Maldonado',addressReference:manForm.address||'Retiro / WhatsApp',totalUyu:it.price_uyu*manForm.qty,lat:-34.9126,lng:-54.9583,notes:manForm.notes,paymentMethod:manForm.payment,items:[{menu_id:it.id,id:it.id,title:it.title,qty:manForm.qty,unit_price:it.price_uyu}]})});if(res.ok){const d=await res.json();if(d.order)setOrders(prev=>[d.order,...prev]);setManForm({name:'',phone:'',address:'',menuId:'',qty:1,notes:'Pedido WhatsApp',payment:'efectivo'});setActiveTab('pedidos');}}finally{setSavingMan(false);}}} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs">{savingMan?'Guardando...':'Cargar Pedido Manualmente'}</button></section>)}{activeTab === 'pedidos' && (
          <section className="grid md:grid-cols-2 gap-4">
            {orders.map((ord) => (
              <div key={ord.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-orange-400">
                    Pedido #{ord.order_number} · ${ord.total_uyu} UYU
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 font-bold uppercase">
                    {ord.order_status}
                  </span>
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <p><strong>Cliente:</strong> {ord.customer_name} ({ord.customer_phone})</p>
                  <p><strong>Entrega:</strong> {ord.delivery_date} · {ord.requested_time_slot}</p>
                  <p><strong>Zona:</strong> {ord.zone_name} — {ord.address_reference}</p>
                  <p>
                    <strong>Pago:</strong>{' '}
                    {ord.payment_method === 'mercadopago'
                      ? `Mercado Pago (${ord.payment_status})`
                      : ord.cash_needs_change
                      ? `Efectivo · Paga con $${ord.cash_paid_with_uyu} · Cambio $${ord.cash_change_uyu}`
                      : 'Efectivo justo'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800">
                  {[
                    { st: 'preparing', label: 'En Cocina' },
                    { st: 'on_the_way', label: 'En Camino' },
                    { st: 'delivered', label: 'Entregado' },
                    { st: 'cancelled', label: 'Cancelar' },
                  ].map((b) => (
                    <button
                      key={b.st}
                      type="button"
                      onClick={() => handleOrderStatus(ord.id, b.st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        ord.order_status === b.st ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'ruta' && settings && (
          <section className="space-y-5">
            {delayAlertBanner && (
              <div className="p-4 rounded-2xl bg-amber-950/80 border border-amber-500 text-amber-200 text-sm font-bold">
                Atraso de 2+ minutos detectado: los clientes ya fueron notificados automáticamente. Conduce tranquilo.
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="font-black text-sm text-white">Locomoción Activa en Tiempo Real</h2>
                <div className="grid grid-cols-3 gap-2">
                  {(['bici', 'moto', 'auto'] as VehicleType[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleChangeVehicle(v)}
                      className={`py-2.5 rounded-xl font-black text-xs uppercase ${
                        settings.active_vehicle === v
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {v === 'bici' ? 'Bicicleta' : v === 'moto' ? 'Moto' : 'Auto'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="font-black text-sm text-white">GPS Repartidor & Radar Privado entre Admins</h2>
                <button
                  type="button"
                  onClick={() => setGpsActive((p) => !p)}
                  className={`w-full py-2.5 rounded-xl font-black text-xs ${
                    gpsActive ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-amber-300'
                  }`}
                >
                  {gpsActive ? 'GPS Activo (Transmitiendo ruta y radar)' : 'Activar mi GPS en Vivo'}
                </button>
              </div>
            </div>

            <InteractiveDeliveryMap
              centerLat={settings.store_lat}
              centerLng={settings.store_lng}
              extraMarkers={radarMarkers}
              heightClass="h-80"
            />

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
              <h3 className="font-black text-sm text-white">Ruta Más Corta ({routeSchedule.length} paradas)</h3>
              {routeSchedule.map((stop) => (
                <div key={stop.orderId} className="flex justify-between bg-slate-950 p-3 rounded-xl text-xs border border-slate-800">
                  <span><strong className="text-orange-400">#{stop.sequence}</strong> {stop.customerName} — {stop.addressReference}</span>
                  <span className="font-mono text-emerald-400 font-bold">{stop.estimatedArrivalTimeStr} hs</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'menus' && (
          <section className="space-y-6">
            <form onSubmit={handleSaveMenu} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
    <div>
      <h3 className="text-base font-black text-white tracking-tight">{menuForm.id ? 'Editar Producto' : 'Nuevo Producto en Catálogo'}</h3>
      <p className="text-11x text-slate-400">Configura imagen, precio, costo de producción y rentabilidad en tiempo real</p>
    </div>
    <button type="button" onClick={() => setMenuForm({ day_of_week: 1, day_label: 'Carta', title: '', description: '', category: 'menu_diario', price_uyu: 350, ingredient_cost_uyu: 140, image_url: '', daily_stock: 30 })} className="text-11x text-slate-400 hover:text-white underline">Limpiar campos</button>
  </div>
  <div className="grid lg:grid-cols-12 gap-6">
    <div className="lg:col-span-4 space-y-3">
      <span className="text-11x font-bold uppercase tracking-wider text-slate-400 block">Foto del Producto</span>
<div onClick={() => document.getElementById('up-img')?.click()} className="h-48 border-2 border-dashed border-slate-700 hover:border-orange-500 rounded-xl flex flex-col items-center justify-center cursor-pointer relative overflow-hidden bg-slate-950/60">{menuForm.image_url && <img src={menuForm.image_url} className="absolute inset-0 w-full h-full object-cover opacity-80" />}<span className="relative z-10 text-xs font-bold text-white bg-slate-950/80 px-3 py-1.5 rounded-lg">{menuForm._uploading ? 'Subiendo...' : 'Clic para subir foto'}</span><input id="up-img" type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.item(0); if (!f) return; setMenuForm((p: any) => ({ ...p, _uploading: true })); const fd = new FormData(); fd.append('file', f); const r = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', headers: { 'x-admin-token': localStorage.getItem('admin_token') ?? '' }, body: fd }); const d = await r.json(); if (d.error) alert(d.error); setMenuForm((p: any) => ({ ...p, _uploading: false, image_url: d.url || p.image_url })); }} /></div>
      <input type="text" placeholder="O pega URL de imagen directa..." value={menuForm.image_url || ''} onChange={(e) => setMenuForm({ ...menuForm, image_url: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-11x text-slate-300" />
    </div>
    <div className="lg:col-span-8 space-y-4">
      <label className="space-y-1 block">
        <span className="text-11x font-bold uppercase text-slate-400">Título del Producto *</span>
        <input type="text" required placeholder="Ej. Chivito al pan completo" value={menuForm.title} onChange={(e) => setMenuForm({ ...menuForm, title: e.target.value, day_of_week: 1, day_label: 'Carta' })} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-orange-500 outline-none" />
      </label>
      <label className="space-y-1 block">
        <span className="text-11x font-bold uppercase text-slate-400">Descripción e Ingredientes *</span>
        <textarea rows={2} required placeholder="Detalla los ingredientes, porciones y guarnición..." value={menuForm.description} onChange={(e) => setMenuForm({ ...menuForm, description: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-orange-500 outline-none" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-11x font-bold uppercase text-slate-400">Precio Venta ($)</span>
          <input type="number" required min={0} value={menuForm.price_uyu} onChange={(e) => setMenuForm({ ...menuForm, price_uyu: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white" />
        </label>
        <label className="space-y-1">
          <span className="text-11x font-bold uppercase text-slate-400">Costo Producción ($)</span>
          <input type="number" required min={0} value={menuForm.ingredient_cost_uyu} onChange={(e) => setMenuForm({ ...menuForm, ingredient_cost_uyu: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-amber-300" />
        </label>
        <label className="space-y-1">
          <span className="text-11x font-bold uppercase text-slate-400">Stock Diario</span>
          <input type="number" required min={0} value={menuForm.daily_stock || 30} onChange={(e) => setMenuForm({ ...menuForm, daily_stock: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
        <div className="flex items-center gap-5">
          <div><span className="text-10x uppercase text-slate-500 block">Ganancia Neta / Unidad</span><span className="{Number(menuForm.price_uyu - (menuForm.ingredient_cost_uyu || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'} text-lg font-black">$ {Number(menuForm.price_uyu - (menuForm.ingredient_cost_uyu || 0))} UYU</span></div>
          <div className="h-8 w-px bg-slate-800" />
          <div><span className="text-10x uppercase text-slate-500 block">Margen Neto</span><span className="text-lg font-black text-orange-400">{menuForm.price_uyu > 0 ? Math.round(((menuForm.price_uyu - (menuForm.ingredient_cost_uyu || 0)) / menuForm.price_uyu) * 100) : 0}%</span></div>
        </div>
        <div className="flex items-center gap-2">
          {!menuForm.id && (<div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2"><p className="text-10px font-black uppercase text-orange-400">Gustos / Aderezos (20 opciones)</p><div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">{["Lechuga","Tomate","Mayonesa","Ketchup","Mostaza","Cheddar","Panceta","Huevo frito","Cebolla caramelizada","Cebolla cruda","Jamon","Muzzarella","Aceitunas","Choclo","Morrones","Pepinillos","Salsa golf","Barbacoa","Alioli","Chimichurri"].map(x=><label key={x} className="flex items-center gap-1.5 text-11px text-slate-200 cursor-pointer"><input type="checkbox" checked={(menuForm.allowed_condiments||[]).includes(x)} onChange={e=>{const c=menuForm.allowed_condiments||[];setMenuForm({...menuForm,allowed_condiments:e.target.checked?[...c,x]:c.filter((k:string)=>k!==x)});}}/><span>{x}</span></label>)}</div></div>)}{menuForm.id && <button type="button" onClick={() => setMenuForm({ day_of_week: 1, day_label: 'Carta', title: '', description: '', category: 'menu_diario', price_uyu: 350, ingredient_cost_uyu: 140, image_url: '/menus/chivito-pan.jpg', daily_stock: 30 })} className="bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl px-4 py-2.5 text-xs">Cancelar</button>}
          <button type="submit" disabled={menuForm._uploading} className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl px-6 py-2.5 text-xs flex items-center gap-1.5 shadow-lg shadow-orange-900/30">{menuForm.id ? 'Guardar Cambios' : <><Plus className="w-4 h-4" /> Publicar Producto</>}</button>
        </div>
      </div>
    </div>
  </div>
</form>

            <div className="grid md:grid-cols-2 gap-4">
              {menus.map((m) => (
                <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between font-bold">
                    <span className="text-orange-400">{m.day_label} · {m.title}</span>
                    <div className="flex items-center gap-2"><span className="text-emerald-400">Stock: {m.daily_stock}</span><button type="button" onClick={() => { setMenuForm(m); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white">Editar</button><button type="button" onClick={async () => { if (!confirm("¿Borrar " + m.title + "?")) return; await fetch("/api/admin/menus?id=" + m.id, { method: "DELETE" }); loadAllAdminData(); }} className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white">Borrar</button></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <label className="space-y-1">
                      <span className="text-slate-400 block">Precio ($)</span>
                      <input
                        type="number"
                        defaultValue={m.price_uyu}
                        onBlur={(e) => handleUpdateMenuStockOrPrice(m, 'price_uyu', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400 block">Costo ($)</span>
                      <input
                        type="number"
                        defaultValue={m.ingredient_cost_uyu || 0}
                        onBlur={(e) => handleUpdateMenuStockOrPrice(m, 'ingredient_cost_uyu', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400 block">Stock Hoy</span>
                      <input
                        type="number"
                        defaultValue={m.daily_stock}
                        onBlur={(e) => handleUpdateMenuStockOrPrice(m, 'daily_stock', Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-white"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'finanzas' && (
          <section className="space-y-6">
            {finances && (
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { label: 'Hoy (Diario)', data: finances.daily },
                  { label: 'Últimos 7 Días (Semanal)', data: finances.weekly },
                  { label: 'Últimos 30 Días (Mensual)', data: finances.monthly },
                ].map((box) => (
                  <div key={box.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
                    <h3 className="font-black text-sm text-amber-400">{box.label}</h3>
                    <p>Pedidos confirmados: <strong>{box.data.ordersCount}</strong></p>
                    <p>Ventas brutas: <strong className="text-white">${box.data.revenueUyu} UYU</strong></p>
                    <p>Costo insumos: <strong className="text-red-400">-${box.data.ingredientCostUyu} UYU</strong></p>
                    <p className="text-sm pt-2 border-t border-slate-800">
                      Ganancia Neta: <strong className="text-emerald-400">${box.data.netProfitUyu} UYU ({box.data.marginPercent}%)</strong>
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-sm text-red-400 flex items-center gap-2">
                <Ban className="w-4 h-4" />
                Lista Negra Anti-Morosos (Bloqueo estricto solo por celular)
              </h3>
              <form onSubmit={handleAddBlacklist} className="grid sm:grid-cols-4 gap-2 text-xs">
                <input
                  type="text"
                  required
                  placeholder="Celular (099...)"
                  value={blForm.phone}
                  onChange={(e) => setBlForm({ ...blForm, phone: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Nombre cliente"
                  value={blForm.customer_name}
                  onChange={(e) => setBlForm({ ...blForm, customer_name: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Dirección referencia"
                  value={blForm.reference_address}
                  onChange={(e) => setBlForm({ ...blForm, reference_address: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Motivo"
                    value={blForm.reason}
                    onChange={(e) => setBlForm({ ...blForm, reason: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 rounded-xl">
                    Bloquear
                  </button>
                </div>
              </form>

              <div className="space-y-2 text-xs">
                {blacklist.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div>
                      <strong>{b.customer_name}</strong> ({b.phone}) — Ref: {b.reference_address} · <em>{b.reason}</em>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBlacklist(b.id, !b.is_blocked)}
                      className={`px-3 py-1 rounded-lg font-bold ${
                        b.is_blocked ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {b.is_blocked ? 'Bloqueado (Desbloquear)' : 'Desbloqueado (Bloquear)'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'motores' && settings && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-black text-lg text-white">5 Motores Autónomos 24/7 + Cerebro Multimedia</h2>
                <p className="text-xs text-slate-400">
                  Calentamiento nocturno inmediato al encender de noche y Modo Emergencia automático de 13:00 a 21:00 hs si no se alcanza la meta ({settings.daily_order_goal} pedidos/día).
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleEngines(!settings.engines_enabled)}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition ${
                  settings.engines_enabled
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {settings.engines_enabled ? (
                  <>
                    <Square className="w-4 h-4" /> Apagar Motores
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" /> Encender Motores (Calentamiento Inmediato)
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <h3 className="font-bold text-slate-300 uppercase">Actividad reciente de los motores</h3>
              {engineLogs.map((log) => (
                <div key={log.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <div className="flex justify-between font-bold text-amber-300">
                    <span>{log.engine_name}</span>
                    <span className="uppercase text-[10px]">{log.mode}</span>
                  </div>
                  <p className="text-slate-300 mt-1">{log.action_summary}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

