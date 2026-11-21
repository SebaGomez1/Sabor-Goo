import { CartItem, PaymentMethod } from '@/types';
import { buildGoogleMapsPinUrl } from './geo';

export function normalizeUruguayPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('598')) return digits;
  if (digits.startsWith('09')) return `598${digits.slice(1)}`;
  if (digits.startsWith('9') && digits.length === 8) return `598${digits}`;
  return digits;
}

export interface WhatsAppOrderMessageInput {
  businessWhatsapp: string;
  orderNumber: number;
  orderId: string;
  customerName: string;
  customerPhone: string;
  deliveryDate: string;
  requestedTimeSlot: string;
  zoneName: string;
  addressReference: string;
  lat: number;
  lng: number;
  items: CartItem[];
  subtotalUyu: number;
  discountPercent: number;
  discountAmountUyu: number;
  freeMealApplied: boolean;
  totalUyu: number;
  paymentMethod: PaymentMethod;
  cashNeedsChange: boolean;
  cashPaidWithUyu: number;
  cashChangeUyu: number;
  appBaseUrl: string;
}

export function buildWhatsAppOrderUrl(input: WhatsAppOrderMessageInput): string {
  const cleanStorePhone = normalizeUruguayPhone(input.businessWhatsapp);
  const mapsUrl = buildGoogleMapsPinUrl(input.lat, input.lng);
  const trackingUrl = `${input.appBaseUrl.replace(/\/$/, '')}/tracking/${input.orderId}`;

  const itemsLines = input.items
    .map((item) => {
      const tag = item.is_free_reward ? ' (COMIDA GRATIS 10 REFERIDOS)' : '';
      return `• ${item.qty}x ${item.title}${tag} - $${item.unit_price * item.qty} UYU`;
    })
    .join('\n');

  const paymentLine =
    input.paymentMethod === 'mercadopago'
      ? 'Pago: Mercado Pago (APROBADO ONLINE)'
      : input.cashNeedsChange
      ? `Pago: Efectivo en puerta (Abona con $${input.cashPaidWithUyu} UYU · Cambio a devolver: $${input.cashChangeUyu} UYU)`
      : 'Pago: Efectivo en puerta (Pago justo, sin cambio)';

  const discountLine = input.freeMealApplied
    ? 'Beneficio aplicado: 1 Comida Gratis por 10 referidos activos'
    : input.discountPercent > 0
    ? `Descuento aplicado: ${input.discountPercent}% OFF (-$${input.discountAmountUyu} UYU)`
    : '';

  const lines = [
    `*NUEVO PEDIDO CONFIRMADO - SABOR GOO #${input.orderNumber}*`,
    `Cliente: ${input.customerName} (${input.customerPhone})`,
    `Entrega: ${input.deliveryDate} · Franja: ${input.requestedTimeSlot}`,
    `Zona: ${input.zoneName}`,
    `Referencia: ${input.addressReference}`,
    ``,
    `*Detalle del Pedido (Porciones Abundantes):*`,
    itemsLines,
    discountLine,
    `*TOTAL A COBRAR: $${input.totalUyu} UYU*`,
    paymentLine,
    ``,
    `GPS exacto: ${mapsUrl}`,
    `Seguimiento en vivo del repartidor: ${trackingUrl}`,
  ].filter(Boolean);

  const encodedMessage = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${cleanStorePhone}?text=${encodedMessage}`;
}
