'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapMarkerPoint {
  lat: number;
  lng: number;
  label: string;
  color?: 'orange' | 'emerald' | 'blue' | 'red';
}

interface InteractiveDeliveryMapProps {
  centerLat: number;
  centerLng: number;
  selectedLat?: number | null;
  selectedLng?: number | null;
  onSelectLocation?: (lat: number, lng: number) => void;
  extraMarkers?: MapMarkerPoint[];
  heightClass?: string;
}

const COVERAGE_POLYGON_COORDS: Array<[number, number]> = [
  [-34.8685, -54.9960],
  [-34.8690, -54.9220],
  [-34.9020, -54.9150],
  [-34.9280, -54.9260],
  [-34.9558, -54.9385],
  [-34.9520, -54.9475],
  [-34.9395, -54.9595],
  [-34.9265, -54.9725],
  [-34.9175, -54.9865],
  [-34.9050, -54.9985],
];

function createPinIcon(color: 'orange' | 'emerald' | 'blue' | 'red' = 'orange') {
  const colorMap = {
    orange: '#ea580c',
    emerald: '#10b981',
    blue: '#3b82f6',
    red: '#ef4444',
  };
  const hex = colorMap[color] || '#ea580c';

  return L.divIcon({
    className: 'sabor-goo-custom-pin',
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:${hex};border:3px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.45);"></div>`,
                   iconSize: L.point(24, 24),
    iconAnchor: L.point(12, 12),
  });
}

export default function InteractiveDeliveryMap({
  centerLat,
  centerLng,
  selectedLat,
  selectedLng,
  onSelectLocation,
  extraMarkers = [],
  heightClass = 'h-72',
}: InteractiveDeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const mainMarkerRef = useRef<L.Marker | null>(null);
  const extraLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [selectedLat ?? centerLat, selectedLng ?? centerLng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    L.polygon(COVERAGE_POLYGON_COORDS, {
      color: '#ea580c',
      weight: 2,
      fillColor: '#f97316',
      fillOpacity: 0.08,
    }).addTo(map);

    extraLayerRef.current = L.layerGroup().addTo(map);

    if (onSelectLocation) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onSelectLocation(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (typeof selectedLat === 'number' && typeof selectedLng === 'number') {
      if (!mainMarkerRef.current) {
        mainMarkerRef.current = L.marker([selectedLat, selectedLng], {
          icon: createPinIcon('orange'),
          draggable: Boolean(onSelectLocation),
        }).addTo(map);

        if (onSelectLocation) {
          mainMarkerRef.current.on('dragend', () => {
            const pos = mainMarkerRef.current?.getLatLng();
            if (pos) {
              onSelectLocation(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
            }
          });
        }
      } else {
        mainMarkerRef.current.setLatLng([selectedLat, selectedLng]);
      }
      map.panTo([selectedLat, selectedLng]);
    }
  }, [selectedLat, selectedLng, onSelectLocation]);

  useEffect(() => {
    const layerGroup = extraLayerRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();
    for (const pt of extraMarkers) {
      const m = L.marker([pt.lat, pt.lng], {
        icon: createPinIcon(pt.color || 'emerald'),
      });
      m.bindTooltip(pt.label, { permanent: false, direction: 'top' });
      m.addTo(layerGroup);
    }
  }, [extraMarkers]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-700 z-0`}
    />
  );
}
