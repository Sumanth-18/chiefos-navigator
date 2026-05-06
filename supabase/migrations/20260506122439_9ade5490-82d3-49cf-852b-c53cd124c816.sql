
-- 1. Create leaves table
CREATE TABLE public.leaves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'casual',
  status TEXT NOT NULL DEFAULT 'approved',
  reason TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own leaves" ON public.leaves
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create leaves" ON public.leaves
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own leaves" ON public.leaves
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own leaves" ON public.leaves
  FOR DELETE USING (user_id = auth.uid());

-- 2. Add estimated_hours and dependency_ids to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 8,
  ADD COLUMN IF NOT EXISTS dependency_ids UUID[] DEFAULT '{}';

-- 3. Dynamic employee load calculation function
CREATE OR REPLACE FUNCTION public.calculate_employee_load(emp_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_task_hours NUMERIC;
  leave_days INTEGER;
  available_hours NUMERIC;
  weekly_hours NUMERIC := 40;
BEGIN
  -- Sum estimated hours of active (non-done) tasks assigned to this employee
  SELECT COALESCE(SUM(estimated_hours), 0)
  INTO total_task_hours
  FROM public.tasks
  WHERE assignee_id = emp_id
    AND status IN ('todo', 'in_progress', 'in_review');

  -- Count leave days in current/future period
  SELECT COALESCE(SUM(
    GREATEST(0, (LEAST(end_date, CURRENT_DATE + INTERVAL '14 days')::date - GREATEST(start_date, CURRENT_DATE)::date + 1))
  ), 0)
  INTO leave_days
  FROM public.leaves
  WHERE employee_id = emp_id
    AND status = 'approved'
    AND end_date >= CURRENT_DATE;

  -- Available hours over 2-week sprint (minus leave days * 8hrs)
  available_hours := (weekly_hours * 2) - (leave_days * 8);
  IF available_hours <= 0 THEN
    RETURN 100;
  END IF;

  RETURN LEAST(100, ROUND((total_task_hours / available_hours) * 100));
END;
$$;

-- 4. Project health score function
CREATE OR REPLACE FUNCTION public.calculate_project_health(proj_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_tasks INTEGER;
  done_tasks INTEGER;
  overdue_tasks INTEGER;
  completion_rate NUMERIC;
  on_time_ratio NUMERIC;
  load_balance NUMERIC;
  health_score NUMERIC;
  result JSONB;
BEGIN
  SELECT COUNT(*) INTO total_tasks FROM public.tasks WHERE project_id = proj_id;
  IF total_tasks = 0 THEN
    RETURN jsonb_build_object('health_score', 100, 'completion_rate', 0, 'on_time_ratio', 100, 'load_balance', 100, 'status', 'green');
  END IF;

  SELECT COUNT(*) INTO done_tasks FROM public.tasks WHERE project_id = proj_id AND status = 'done';
  SELECT COUNT(*) INTO overdue_tasks FROM public.tasks WHERE project_id = proj_id AND status != 'done' AND due_date IS NOT NULL AND due_date < CURRENT_DATE;

  completion_rate := (done_tasks::NUMERIC / total_tasks) * 100;
  on_time_ratio := CASE WHEN total_tasks > 0 THEN ((total_tasks - overdue_tasks)::NUMERIC / total_tasks) * 100 ELSE 100 END;

  -- Load balance: check spread of tasks among assignees
  SELECT CASE
    WHEN COUNT(DISTINCT assignee_id) <= 1 THEN 50
    ELSE GREATEST(0, 100 - (STDDEV(task_count) / NULLIF(AVG(task_count), 0) * 100))
  END INTO load_balance
  FROM (
    SELECT assignee_id, COUNT(*) as task_count
    FROM public.tasks
    WHERE project_id = proj_id AND assignee_id IS NOT NULL AND status != 'done'
    GROUP BY assignee_id
  ) sub;

  load_balance := COALESCE(load_balance, 100);
  health_score := (0.4 * completion_rate) + (0.3 * on_time_ratio) + (0.3 * load_balance);

  RETURN jsonb_build_object(
    'health_score', ROUND(health_score),
    'completion_rate', ROUND(completion_rate),
    'on_time_ratio', ROUND(on_time_ratio),
    'load_balance', ROUND(load_balance),
    'status', CASE
      WHEN health_score >= 80 THEN 'green'
      WHEN health_score >= 60 THEN 'yellow'
      ELSE 'red'
    END
  );
END;
$$;

-- Enable realtime for leaves
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaves;
