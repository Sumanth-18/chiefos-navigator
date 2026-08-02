import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Project, Task, Employee, Leave } from '@/lib/types';
import { computeDeadlineCascade } from '@/lib/cascade';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight, CalendarDays, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  project: Project;
  projectTasks: Task[];
  allTasks: Task[];
  employees: Employee[];
  leaves: Leave[];
  userId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function DeadlineCascadeDialog({
  project,
  projectTasks,
  allTasks,
  employees,
  leaves,
  userId,
  onClose,
  onApplied,
}: Props) {
  const [newDeadline, setNewDeadline] = useState(project.deadline ?? '');
  const [saving, setSaving] = useState(false);

  const cascade = useMemo(
    () =>
      newDeadline
        ? computeDeadlineCascade(project, projectTasks, allTasks, employees, leaves, newDeadline)
        : null,
    [newDeadline, project, projectTasks, allTasks, employees, leaves]
  );

  const apply = async () => {
    if (!cascade || !newDeadline || saving) return;
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from('projects')
        .update({ deadline: newDeadline })
        .eq('id', project.id);
      if (pErr) throw pErr;

      for (const t of cascade.tasks) {
        if (t.newDueDate && t.newDueDate !== t.oldDueDate) {
          await supabase.from('tasks').update({ due_date: t.newDueDate }).eq('id', t.taskId);
        }
      }

      await supabase.from('audit_log').insert({
        action: 'deadline_cascade',
        entity_type: 'project',
        entity_id: project.id,
        details: {
          name: project.name,
          from: project.deadline,
          to: newDeadline,
          shift_days: cascade.shiftDays,
          tasks_rescheduled: cascade.tasks.filter((t) => t.newDueDate !== t.oldDueDate).length,
          at_risk: cascade.atRiskCount,
        },
        user_id: userId,
      });

      toast.success(`Deadline moved — ${cascade.tasks.length} tasks recalculated`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply cascade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[720px] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5 text-primary" /> Change Deadline
            </h2>
            <p className="text-sm text-muted-foreground">
              Task schedules and risk flags recalculate automatically.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Current deadline</Label>
            <Input value={project.deadline ?? '—'} disabled />
          </div>
          <div className="space-y-2">
            <Label>New deadline</Label>
            <Input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />
          </div>
        </div>

        {cascade && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {cascade.direction === 'unchanged'
                  ? 'No shift'
                  : `${Math.abs(cascade.shiftDays)} days ${cascade.direction === 'pushed_out' ? 'later' : 'earlier'}`}
              </Badge>
              <Badge variant="outline">{cascade.tasks.length} open tasks</Badge>
              {cascade.atRiskCount > 0 && (
                <Badge className="bg-destructive/20 text-destructive">
                  {cascade.atRiskCount} at risk
                </Badge>
              )}
            </div>

            {cascade.overloadedAssignees.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" /> Capacity warnings
                </div>
                {cascade.overloadedAssignees.map((o) => (
                  <p key={o.employeeId} className="text-xs">
                    {o.name} is at {o.load}% capacity for this window
                  </p>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                Recalculated schedule
              </div>
              <div className="max-h-[280px] divide-y divide-border overflow-y-auto">
                {cascade.tasks.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No open tasks to reschedule.</p>
                )}
                {cascade.tasks.map((t) => (
                  <div key={t.taskId} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.assigneeName}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                      <span>{t.oldDueDate ?? '—'}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-semibold text-foreground">{t.newDueDate ?? '—'}</span>
                    </div>
                    {t.atRisk && (
                      <Badge className="bg-destructive/20 text-[10px] text-destructive" title={t.riskReason ?? ''}>
                        at risk
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!newDeadline || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Apply cascade
          </Button>
        </div>
      </div>
    </div>
  );
}
