export type VehicleType = 'bici' | 'moto' | 'auto';

export type OrderStatus =
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'mercadopago' | 'efectivo';

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cash_on_delivery';

export interface AppSettings {
  id: number;
  business_name: string;
  whatsapp_number: string;
  store_lat: number;
  store_lng: number;
  opening_hour: string;
  cutoff_hour: number;
  active_vehicle: VehicleType;
  speed_bici_kmh: number;
  speed_moto_kmh: number;
  speed_auto_kmh: number;
  stop_minutes_base: number;
  stop_minutes_cash_extra: number;
  daily_order_goal: number;
  engines_enabled: boolean;
  night_warmup_active: boolean;
  emergency_mode_forced: boolean;
  last_engine_run_at: string | null;
  updated_at: string;
}

export interface MenuItem {
  id: string;
  day_of_week: number;
  day_label: string;
  title: string;
  description: string;
  abundance_badge: string;
  category: 'menu_diario' | 'hamburguesa';
  price_uyu: number;
  ingredient_cost_uyu?: number;
  image_url: string;
  daily_stock: number;
  is_active: boolean;
}

export interface CartItem {
  menu_id: string;
  title: string;
  qty: number;
  unit_price: number;
  unit_cost?: number;
  is_free_reward?: boolean;
}

export interface CustomerProfile {
  id: string;
  phone: string;
  full_name: string;
  referral_code: string;
  referred_by_code: string | null;
  consecutive_business_days: number;
  missed_business_days: number;
  has_25_off: boolean;
  has_free_daily_meal: boolean;
  active_daily_referrals_count: number;
  same_day_referrals_count: number;
  last_order_business_date: string | null;
  last_free_meal_date: string | null;
  total_orders: number;
  total_spent_uyu: number;
}

export interface OrderRecord {
  id: string;
  order_number: number;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_date: string;
  requested_time_slot: string;
  zone_name: string;
  address_reference: string;
  lat: number;
  lng: number;
  items: CartItem[];
  subtotal_uyu: number;
  discount_percent: number;
  discount_amount_uyu: number;
  free_meal_applied: boolean;
  total_uyu: number;
  total_cost_uyu: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  cash_needs_change: boolean;
  cash_paid_with_uyu: number;
  cash_change_uyu: number;
  order_status: OrderStatus;
  assigned_driver_id: string | null;
  route_sequence: number;
  estimated_arrival_at: string | null;
  delay_minutes: number;
  delay_notified: boolean;
  whatsapp_sent: boolean;
  referral_code_used: string | null;
  created_at: string;
}

export interface AdminAccountPublic {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: 'superadmin' | 'admin_driver';
  is_on_delivery: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_gps_at: string | null;
  is_active: boolean;
}

export interface GeoValidationResult {
  allowed: boolean;
  zoneName: string;
  distanceFromStoreKm: number;
  reason?: string;
}
