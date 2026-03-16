-- Agenda Premium - Compromissos manuais e calendário
-- Execute no Supabase SQL Editor

-- Tabela de compromissos manuais (eventos da agenda)
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  workorder_id uuid REFERENCES public.workorders(id) ON DELETE SET NULL,
  user_id uuid,
  color text DEFAULT '#3d86ff',
  all_day boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_company ON public.appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON public.appointments(company_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_ticket ON public.appointments(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_workorder ON public.appointments(workorder_id) WHERE workorder_id IS NOT NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RLS: descomente e ajuste se usar Row Level Security
-- ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "appointments_select" ON public.appointments FOR SELECT USING (true);
-- CREATE POLICY "appointments_insert" ON public.appointments FOR INSERT WITH CHECK (true);
-- CREATE POLICY "appointments_update" ON public.appointments FOR UPDATE USING (true);
