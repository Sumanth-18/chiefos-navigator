ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS joined_at date NOT NULL DEFAULT CURRENT_DATE;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  amount numeric NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own expenses" ON public.expenses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own expenses" ON public.expenses FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own expenses" ON public.expenses FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.attrition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  exit_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  logged_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attrition_events TO authenticated;
GRANT ALL ON public.attrition_events TO service_role;
ALTER TABLE public.attrition_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own attrition_events" ON public.attrition_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create attrition_events" ON public.attrition_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own attrition_events" ON public.attrition_events FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own attrition_events" ON public.attrition_events FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_name text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  stage text NOT NULL DEFAULT 'Lead',
  expected_close_date date,
  owner_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  won_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own deals" ON public.deals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can create deals" ON public.deals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own deals" ON public.deals FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own deals" ON public.deals FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();