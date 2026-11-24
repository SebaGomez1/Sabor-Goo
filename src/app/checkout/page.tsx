'use client';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const InteractiveDeliveryMap = dynamic(() => import('@/components/InteractiveDeliveryMap'), { ssr: false });

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [doorNumber, setDoorNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'mercadopago'>('efectivo');
  const [needsChange, setNeedsChange] = useState(false);
  const [paidWith, setPaidWith] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng_] = useState<number | null>(null);
  const [gpsLocked, setGpsLocked] = useState(false);
  const [detectedStreet, setDetectedStreet] = useState('');
  const [detectedCity, setDetectedCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try{const r=localStorage.getItem('sabor_goo_cart');const p=r?JSON.parse(r):[];if(!p.length){router.replace('/');return;}setItems(p);}catch{router.replace('/');}
    requestGps();
  }, []);

  function requestGps() {
    if (!navigator.geolocation) { setError('GPS no disponible.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(Number(pos.coords.latitude.toFixed(6))); setLng_(Number(pos.coords.longitude.toFixed(6))); setGpsLocked(true); setError(''); },
      () => setError('Activa el GPS obligatorio para continuar.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  useEffect(() => {
    if (lat === null || lng === null) return;
    let off = false;
    (async () => {
      try {
        const res = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' + lat + '&lon=' + lng);
        const d = await res.json();
        if (off) return;
        setDetectedStreet(d?.address?.road || d?.address?.pedestrian || '');
        setDetectedCity(d?.address?.city || d?.address?.town || 'Maldonado');
      } catch {}
    })();
    const [askNotif,setAskNotif]=useState(true);const grantClientNotif=()=>{try{(window as any).SaborGooAdmin?.requestClientNotif?.();if("Notification"in window&&Notification.permission==="default")Notification.requestPermission();}catch{}setAskNotif(false);};return () => { off = true; };
  }, [lat, lng]);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^av\.|^blvr|^rgma|^calle/g, '').trim();
  const w1 = norm(detectedStreet).split(' ').filter((w) => w.length > 3)[0] || '';
  const w2 = norm(street).split(' ').filter((w) => w.length > 3)[0] || '';
  const streetMatchesGps = !detectedStreet || !street.trim() || norm(street).includes(w1) || norm(detectedStreet).includes(w2);
  const totalUyu = items.reduce((a, b) => a + Number(b.unitTotalUyu || b.unit_price || b.price_uyu || 0) * Number(b.qty || 1), 0);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!gpsLocked || lat === null || lng === null) { if (!gpsLocked) {} setError('Activa el GPS y marca tu punto en el mapa.'); return; }
    if (!street.trim() || !doorNumber.trim()) { setError('Ingresa calle y número de puerta.'); return; }
    if (!streetMatchesGps) { setError('BLOQUEO GPS: La calle no coincide con el pin (' + detectedStreet + ').'); return; }
    setSubmitting(true); setError('');
    try {
      localStorage.setItem('sabor_goo_phone',phone.trim());try{const au=new Audio('/alarma-pedidosya.wav');au.volume=1;au.play().catch(()=>{});setTimeout(()=>{au.pause();au.currentTime=0;},2200);if('serviceWorker' in navigator){const r=await navigator.serviceWorker.ready;const s=await r.pushManager.getSubscription();if(s)await fetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:s,customerPhone:phone.trim()})});}}catch{} const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: name.trim(), customerPhone: phone.trim(), deliveryDate: new Date().toISOString().slice(0, 10), requestedTimeSlot: 'Inmediata', zoneName: detectedCity || 'Maldonado', addressReference: street.trim() + ' #' + doorNumber.trim(), lat, lng, notes: notes.trim(), paymentMethod, cashNeedsChange: needsChange, cashPaidWithUyu: needsChange ? Number(paidWith || 0) : 0, items: items.map((it) => ({ menu_id: it.menu_id || it.id, title: it.title, qty: it.qty || 1, unit_price: it.unitTotalUyu || it.unit_price || it.price_uyu, protein: it.protein || '', condiments: it.condiments || [], extras: it.extras || [] })) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear pedido');
      localStorage.removeItem('sabor_goo_cart');
      const mpUrl=data.checkoutUrl||data.initPoint||data.init_point||data.preferenceUrl;if(paymentMethod==='mercadopago'&&mpUrl){window.location.href=mpUrl;return;}
      if (data.whatsappUrl) window.open(data.whatsappUrl, '_blank');
      const oid=data.order?.id||data.orderId||data.id;if(oid)router.push('/tracking/'+oid);
    } catch (err: any) { setError(err.message || 'Error inesperado'); setSubmitting(false); }
  }
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between"><Link href="/" className="text-xs font-bold text-slate-400 hover:text-white">&larr; Volver al Menú</Link><span className="text-11x font-black uppercase text-orange-400 bg-orange-950/60 border border-orange-500/40 px-3 py-1 rounded-full">Radar GPS Obligatorio</span></div>
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-3.5"><div><p className="text-xs font-black text-white">1. Fij: ha tu Punto GPS en el Mapa</p><p className="text-11x text-slate-400">{detectedStreet ? 'Calle GPS: ' + detectedStreet + ' (' + detectedCity + ')' : 'Activa el GPS y arrastra el pin a tu puerta'}</p></div><button type="button" onClick={requestGps} className="px-3.5 py-2 rounded-xl bg-orange-600 text-xs font-black text-white">{gpsLocked ? 'GPS Activo' : 'Activar GPS'}</button></div>
            <InteractiveDeliveryMap centerLat={-34.9126} centerLng={-54.9583} selectedLat={lat} selectedLng={lng}  heightClass="h-96 lg:h-[480px]" />
          </div>
          <form onSubmit={handleConfirm} className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">{askNotif&&(<div className="mb-4 rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-sm text-white flex items-center justify-between gap-3"><span>🔔 Activa las notificaciones para avisarte por la app el avance de tu pedido en tiempo real.</span><button type="button" onClick={grantClientNotif} className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white">Activar notificaciones</button></div>)}
            <h3 className="text-base font-black text-white">2. Datos y Validación de Puerta</h3>
            <div className="grid grid-cols-2 gap-3"><input type="text" required placeholder="Tu Nombre *" value={name} onChange={(e) => setName(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" /><input type="tel" required placeholder="WhatsApp (099...) *" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" /></div>
            <div className="grid grid-cols-3 gap-2"><input type="text" required placeholder="Calle exacta *" value={street} onChange={(e) => setStreet(e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" /><input type="text" required placeholder="N° Puerta *" value={doorNumber} onChange={(e) => setDoorNumber(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" /></div>
            {detectedStreet && !streetMatchesGps && (<div className="p-3 rounded-xl bg-red-950/70 border border-red-500 text-11x text-red-200 space-y-2"><p><b>Bloqueo GPS:</b> El pin está en <b>{detectedStreet}</b>, no coincide con la calle escrita.</p><button type="button" onClick={() => setStreet(detectedStreet)} className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold">Usar calle detectada por GPS</button></div>)}
            <input type="text" placeholder="Apartamento, timbre o nota para cocina (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setPaymentMethod('efectivo')} className={'py-2.5 rounded-xl text-xs font-bold border ' + (paymentMethod === 'efectivo' ? 'border-orange-500 bg-orange-950/50 text-white' : 'border-slate-700 text-slate-400')}>Efectivo al recibir</button><button type="button" onClick={() => setPaymentMethod('mercadopago')} className={'py-2.5 rounded-xl text-xs font-bold border ' + (paymentMethod === 'mercadopago' ? 'border-orange-500 bg-orange-950/50 text-white' : 'border-slate-700 text-slate-400')}>Mercado Pago</button></div>
            {paymentMethod === 'efectivo' && (<div className="space-y-2"><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} /> ¿Necesitas cambio?</label>{needsChange && <input type="number" placeholder="Con cuánto pagas? (Ej. 1000)" value={paidWith} onChange={(e) => setPaidWith(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />}{needsChange&&Number(paidWith)>totalUyu&&<p className="text-xs font-black text-emerald-400">Vuelto a devolver: $ {Number(paidWith)-totalUyu} UYU</p>}{needsChange&&Number(paidWith)>0&&Number(paidWith)<=totalUyu&&<p className="text-xs font-bold text-amber-400">El monto debe superar el total</p>}</div>)}
            {error && <p className="text-xs text-red-400 font-bold">{error}</p>}
            <div className="border-t border-slate-800 pt-3 flex items-center justify-between"><span className="text-xs text-slate-400">Total a Pagar:</span><span className="text-xl text-orange-400 font-black">$ {totalUyu} UYU</span></div>
            <button type="submit" disabled={submitting || !gpsLocked || !streetMatchesGps} className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-black text-white shadow-lg">{submitting ? 'Confirmando y activando Radar GPS...' : 'Confirmar Pedido y Activar Radar 90min'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
