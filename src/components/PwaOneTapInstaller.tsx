'use client';

import React, { useEffect, useState } from 'react';
import { Download, BellRing, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function playSoftAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.46);
  } catch {
    // Silencio si el navegador aún no tuvo interacción previa
  }
}

export default function PwaOneTapInstaller({ customerPhone }: { customerPhone?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pushReady, setPushReady] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SABOR_GOO_PUSH_SOUND') {
          playSoftAlertChime();
        }
      });
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
    });

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setPushReady(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function subscribeBackgroundPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setPushReady(true);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          customerPhone: customerPhone || null,
        }),
      });

      setPushReady(true);
      playSoftAlertChime();
    } catch {
      // Ignorar si usuario bloquea permisos
    }
  }

  async function handleOneTapInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    }
    await subscribeBackgroundPush();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {deferredPrompt && !installed && (
        <button
          type="button"
          onClick={handleOneTapInstall}
          className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold px-3.5 py-2 rounded-xl shadow-lg transition"
        >
          <Download className="w-4 h-4" />
          Instalar App Sabor Goo
        </button>
      )}

      {!pushReady ? (
        <button
          type="button"
          onClick={subscribeBackgroundPush}
          className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold px-3 py-2 rounded-xl transition"
        >
          <BellRing className="w-3.5 h-3.5" />
          Activar Avisos en Vivo
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold px-2.5 py-1.5 bg-emerald-950/50 border border-emerald-500/30 rounded-xl">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Avisos Activos
        </span>
      )}
    </div>
  );
}
