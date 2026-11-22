import PwaOneTapInstaller from '@/components/PwaOneTapInstaller';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sabor Goo · Comida Casera Abundante en Maldonado y Playa Mansa',
  description:
    'Platos caseros muy bien servidos, abundantes y contundentes sin escatimar. Reparto en todo Maldonado y Playa Mansa (Paradas 1 a 25) con seguimiento en vivo del repartidor.',
  manifest: '/manifest.json', icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  keywords: [
    'viandas Maldonado',
    'comida casera Maldonado',
    'delivery Playa Mansa Punta del Este',
    'almuerzo abundante Maldonado',
    'Sabor Goo',
  ],
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-UY">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        {children}
        <PwaOneTapInstaller />
      </body>
    </html>
  );
}
