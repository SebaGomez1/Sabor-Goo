-- ============================================================================
-- SABOR GOO (MALDONADO, URUGUAY) - ESQUEMA COMPLETO DE BASE DE DATOS + RLS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CONFIGURACIÓN GLOBAL DEL SISTEMA Y LOGÍSTICA (app_settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'Sabor Goo',
  whatsapp_number TEXT NOT NULL DEFAULT '59899000000',
  store_lat DOUBLE PRECISION NOT NULL DEFAULT -34.9089,
  store_lng DOUBLE PRECISION NOT NULL DEFAULT -54.9583,
  opening_hour TEXT NOT NULL DEFAULT '11:30',
  cutoff_hour INTEGER NOT NULL DEFAULT 21,
  active_vehicle TEXT NOT NULL DEFAULT 'moto' CHECK (active_vehicle IN ('bici', 'moto', 'auto')),
  speed_bici_kmh DOUBLE PRECISION NOT NULL DEFAULT 16.0,
  speed_moto_kmh DOUBLE PRECISION NOT NULL DEFAULT 32.0,
  speed_auto_kmh DOUBLE PRECISION NOT NULL DEFAULT 28.0,
  stop_minutes_base INTEGER NOT NULL DEFAULT 4,
  stop_minutes_cash_extra INTEGER NOT NULL DEFAULT 2,
  daily_order_goal INTEGER NOT NULL DEFAULT 35,
  engines_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  night_warmup_active BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_mode_forced BOOLEAN NOT NULL DEFAULT FALSE,
  last_engine_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. CUENTAS ADMIN Y RADAR PRIVADO ENTRE SOCIAS (admin_accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin_driver')),
  password_hash TEXT NOT NULL,
  is_on_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  last_gps_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. CATÁLOGO DE MENÚS DIARIOS Y STOCK (menus)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Lunes .. 5=Viernes
  day_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  abundance_badge TEXT NOT NULL DEFAULT 'Porción Abundante Casera · Sin Escatimar',
  category TEXT NOT NULL DEFAULT 'menu_diario' CHECK (category IN ('menu_diario', 'hamburguesa')),
  price_uyu INTEGER NOT NULL CHECK (price_uyu > 0),
  ingredient_cost_uyu INTEGER NOT NULL DEFAULT 0 CHECK (ingredient_cost_uyu >= 0),
  image_url TEXT NOT NULL,
  daily_stock INTEGER NOT NULL DEFAULT 25 CHECK (daily_stock >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. CLIENTES INVISIBLES, RACHAS Y REFERIDOS (customers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by_code TEXT,
  device_token TEXT,
  consecutive_business_days INTEGER NOT NULL DEFAULT 0,
  missed_business_days INTEGER NOT NULL DEFAULT 0,
  has_25_off BOOLEAN NOT NULL DEFAULT FALSE,
  has_free_daily_meal BOOLEAN NOT NULL DEFAULT FALSE,
  active_daily_referrals_count INTEGER NOT NULL DEFAULT 0,
  same_day_referrals_count INTEGER NOT NULL DEFAULT 0,
  last_order_business_date DATE,
  last_free_meal_date DATE,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent_uyu INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON public.customers(referral_code);
CREATE INDEX IF NOT EXISTS idx_customers_referred_by ON public.customers(referred_by_code);

-- ----------------------------------------------------------------------------
-- 5. LISTA NEGRA ANTI-MOROSOS (SOLO POR CELULAR) (blacklist)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  reference_address TEXT NOT NULL,
  reason TEXT NOT NULL,
  blocked_by_admin TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON public.blacklist(phone);

-- ----------------------------------------------------------------------------
-- 6. PEDIDOS, PAGOS MERCADO PAGO Y TRACKING EN VIVO (orders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number SERIAL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  requested_time_slot TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  address_reference TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  items JSONB NOT NULL, -- [{menu_id, title, qty, unit_price, unit_cost, is_free_reward}]
  subtotal_uyu INTEGER NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  discount_amount_uyu INTEGER NOT NULL DEFAULT 0,
  free_meal_applied BOOLEAN NOT NULL DEFAULT FALSE,
  total_uyu INTEGER NOT NULL,
  total_cost_uyu INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mercadopago', 'efectivo')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'rejected', 'cash_on_delivery')),
  mp_preference_id TEXT,
  mp_payment_id TEXT UNIQUE,
  cash_needs_change BOOLEAN NOT NULL DEFAULT FALSE,
  cash_paid_with_uyu INTEGER DEFAULT 0,
  cash_change_uyu INTEGER DEFAULT 0,
  order_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (
    order_status IN ('awaiting_payment', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled')
  ),
  assigned_driver_id UUID REFERENCES public.admin_accounts(id) ON DELETE SET NULL,
  route_sequence INTEGER DEFAULT 1,
  estimated_arrival_at TIMESTAMPTZ,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  delay_notified BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
  referral_code_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);

-- ----------------------------------------------------------------------------
-- 7. SUSCRIPCIONES WEB PUSH EN SEGUNDO PLANO (push_subscriptions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_phone TEXT,
  admin_id UUID REFERENCES public.admin_accounts(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. CAPTACIÓN B2B, REELS IA Y LOGS DE LOS 5 MOTORES AUTÓNOMOS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_leads_b2b (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  place_name TEXT NOT NULL,
  sector TEXT NOT NULL, -- obra, hospital, oficina, taller, comercio
  zone_name TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_info TEXT,
  pitch_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'converted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.media_reels_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_audience TEXT NOT NULL,
  script_text TEXT NOT NULL,
  voiceover_ssml TEXT NOT NULL,
  subtitles_json JSONB NOT NULL,
  video_prompt TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'published', 'failed')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.engine_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engine_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'normal', -- normal, night_warmup, emergency_13h
  action_summary TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. FUNCIÓN DE NEGOCIO: ACTUALIZACIÓN DE RACHAS Y REFERIDOS AL CONFIRMAR PEDIDO
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_confirmed_order_rewards(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_customer RECORD;
  v_referrer RECORD;
  v_item JSONB;
  v_menu_id UUID;
  v_qty INTEGER;
  v_is_consecutive BOOLEAN := FALSE;
  v_new_streak INTEGER := 1;
  v_same_day_count INTEGER := 0;
  v_active_refs_count INTEGER := 0;
  v_has_25 BOOLEAN := FALSE;
  v_has_free BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Evitar doble procesamiento si el webhook reintenta
  IF v_order.order_status NOT IN ('confirmed', 'preparing', 'on_the_way', 'delivered') THEN
    UPDATE public.orders
    SET order_status = 'confirmed', updated_at = NOW()
    WHERE id = p_order_id;
  END IF;

  -- 1. Descontar stock diario de cada item del pedido
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items)
  LOOP
    v_menu_id := (v_item->>'menu_id')::UUID;
    v_qty := COALESCE((v_item->>'qty')::INTEGER, 1);

    UPDATE public.menus
    SET daily_stock = GREATEST(0, daily_stock - v_qty),
        updated_at = NOW()
    WHERE id = v_menu_id;
  END LOOP;

  -- 2. Obtener cliente asociado al pedido
  SELECT * INTO v_customer FROM public.customers WHERE phone = v_order.customer_phone;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 3. Verificar continuidad de días hábiles (Lunes a Viernes; sábado y domingo no cortan racha)
  IF v_customer.last_order_business_date IS NULL THEN
    v_new_streak := 1;
  ELSIF v_customer.last_order_business_date = v_order.delivery_date THEN
    v_new_streak := GREATEST(1, v_customer.consecutive_business_days);
  ELSE
    v_is_consecutive := (
      (v_order.delivery_date = v_customer.last_order_business_date + INTERVAL '1 day')
      OR (EXTRACT(DOW FROM v_customer.last_order_business_date) = 5 AND v_order.delivery_date = v_customer.last_order_business_date + INTERVAL '3 days')
    );

    IF v_is_consecutive THEN
      v_new_streak := v_customer.consecutive_business_days + 1;
    ELSE
      v_new_streak := 1;
    END IF;
  END IF;

  v_has_25 := v_customer.has_25_off OR (v_new_streak >= 3);
  v_has_free := v_customer.has_free_daily_meal;

  -- Actualizar métricas y racha del cliente
  UPDATE public.customers
  SET consecutive_business_days = v_new_streak,
      missed_business_days = 0,
      has_25_off = v_has_25,
      last_order_business_date = v_order.delivery_date,
      last_free_meal_date = CASE WHEN v_order.free_meal_applied THEN v_order.delivery_date ELSE last_free_meal_date END,
      total_orders = total_orders + 1,
      total_spent_uyu = total_spent_uyu + v_order.total_uyu,
      updated_at = NOW()
  WHERE id = v_customer.id;

  -- 4. Evaluar recompensas del referidor (si este cliente fue referido)
  IF COALESCE(v_order.referral_code_used, v_customer.referred_by_code) IS NOT NULL THEN
    SELECT * INTO v_referrer
    FROM public.customers
    WHERE referral_code = COALESCE(v_order.referral_code_used, v_customer.referred_by_code);

    IF FOUND AND v_referrer.phone <> v_customer.phone THEN
      -- Referidos distintos que compraron en el mismo día de entrega
      SELECT COUNT(DISTINCT customer_phone) INTO v_same_day_count
      FROM public.orders
      WHERE referral_code_used = v_referrer.referral_code
        AND delivery_date = v_order.delivery_date
        AND order_status IN ('confirmed', 'preparing', 'on_the_way', 'delivered');

      -- Referidos directos activos comprando en la jornada actual
      SELECT COUNT(DISTINCT c.id) INTO v_active_refs_count
      FROM public.customers c
      WHERE c.referred_by_code = v_referrer.referral_code
        AND c.last_order_business_date >= v_order.delivery_date;

      UPDATE public.customers
      SET same_day_referrals_count = v_same_day_count,
          active_daily_referrals_count = v_active_refs_count,
          has_25_off = CASE
            WHEN v_same_day_count >= 5 OR v_active_refs_count >= 5 OR consecutive_business_days >= 3 THEN TRUE
            ELSE has_25_off
          END,
          has_free_daily_meal = CASE
            WHEN v_active_refs_count >= 10 THEN TRUE
            ELSE FALSE
          END,
          updated_at = NOW()
      WHERE id = v_referrer.id;
    END IF;
  END IF;
END;
$$;

-- ============================================================================
-- 10. BLINDAJE DE SEGURIDAD: ROW LEVEL SECURITY (RLS) Y PERMISOS
-- ============================================================================

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_leads_b2b ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_reels_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_logs ENABLE ROW LEVEL SECURITY;

-- Lectura pública controlada solo para catálogo activo (el resto pasa 100% por Vercel API con Service Role)
DROP POLICY IF EXISTS "menus_public_read" ON public.menus;
CREATE POLICY "menus_public_read"
  ON public.menus
  FOR SELECT
  USING (is_active = TRUE);

-- Habilitar Realtime para tracking en vivo y radar de admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_accounts;
  END IF;
END $$;
