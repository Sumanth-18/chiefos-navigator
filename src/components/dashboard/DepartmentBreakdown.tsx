import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Employee, Task, Leave, AuditLogEntry } from '@/lib/types';
import { computeEmployeeLoad } from '@/lib/types';
import { Building2 } from 'lucide-react';

interface Props {
  employees: Employee[];
  tasks: Task[];
  leaves: Leave[];
  events: AuditLogEntry[];
}

interface DeptRow {
  department: string;
  headcount: number;
  avgLoad: number;
  openTasks: number;
  doneTasks: number;
  onLeave: number;
  events: number;
}

/**
 * Department metrics are derived from the same event log + task/leave records
 * the rest of the app uses — no separate department counters are stored.
 */
export function DepartmentBreakdown({ employees, tasks, leaves, events }: Props) {
  const rows = useMemo<DeptRow[]>(() => {
    const byDept = new Map<string, Employee[]>();
    employees.forEach((e) => {
      const list = byDept.get(e.department) ?? [];
      list.push(e);
      byDept.set(e.department, list);
    });

    const now = new Date();

    return Array.from(byDept.entries())
      .map(([department, members]) => {
        const ids = new Set(members.map((m) => m.id));
        const names = new Set(members.map((m) => m.name));
        const deptTasks = tasks.filter((t) => t.assignee_id && ids.has(t.assignee_id));
        const loads = members.map((m) => computeEmployeeLoad(m.id, tasks, leaves));

        const eventCount = events.filter((ev) => {
          const d = (ev.details ?? {}) as Record<string, unknown>;
          const assignee = typeof d['assignee_id'] === 'string' ? (d['assignee_id'] as string) : null;
          const empName = typeof d['employee'] === 'string' ? (d['employee'] as string) : null;
          const movedBy = typeof d['moved_by'] === 'string' ? (d['moved_by'] as string) : null;
          const dept = typeof d['department'] === 'string' ? (d['department'] as string) : null;
          if (dept) return dept === department;
          if (assignee) return ids.has(assignee);
          if (empName) return names.has(empName);
          if (movedBy) return names.has(movedBy);
          return false;
        }).length;

        return {
          department,
          headcount: members.length,
          avgLoad: loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : 0,
          openTasks: deptTasks.filter((t) => t.status !== 'done').length,
          doneTasks: deptTasks.filter((t) => t.status === 'done').length,
          onLeave: leaves.filter(
            (l) =>
              ids.has(l.employee_id) &&
              l.status === 'approved' &&
              new Date(l.start_date) <= now &&
              new Date(l.end_date) >= now
          ).length,
          events: eventCount,
        };
      })
      .sort((a, b) => b.avgLoad - a.avgLoad);
  }, [employees, tasks, leaves, events]);

  const loadColor = (n: number) =>
    n > 90 ? 'bg-destructive' : n > 70 ? 'bg-warning' : 'bg-success';

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5 text-primary" /> Department Breakdown
        </CardTitle>
        <span className="text-xs text-muted-foreground">derived from activity log</span>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No departments yet</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.department} className="rounded-lg border border-border/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium capitalize">{r.department}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {r.headcount} {r.headcount === 1 ? 'person' : 'people'}
                    </Badge>
                    {r.onLeave > 0 && (
                      <Badge className="bg-info/20 text-[10px] text-info">{r.onLeave} on leave</Badge>
                    )}
                  </div>
                  <span className="text-sm font-bold tabular-nums">{r.avgLoad}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full ${loadColor(r.avgLoad)} transition-all`}
                    style={{ width: `${Math.min(100, r.avgLoad)}%` }}
                  />
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>{r.openTasks} open</span>
                  <span>{r.doneTasks} done</span>
                  <span>{r.events} events</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
