import type { Task, Employee, Leave, Project } from './types';
import { computeEmployeeLoad } from './types';

export interface TaskCascade {
  taskId: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string;
  oldDueDate: string | null;
  newDueDate: string | null;
  atRisk: boolean;
  riskReason: string | null;
}

export interface CascadeResult {
  shiftDays: number;
  direction: 'pulled_in' | 'pushed_out' | 'unchanged';
  tasks: TaskCascade[];
  atRiskCount: number;
  overloadedAssignees: { employeeId: string; name: string; load: number }[];
}

const DAY = 86400000;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function overlapsLeave(dateISO: string, employeeId: string, leaves: Leave[]): boolean {
  const t = new Date(dateISO).getTime();
  return leaves.some(
    (l) =>
      l.employee_id === employeeId &&
      l.status === 'approved' &&
      new Date(l.start_date).getTime() <= t &&
      new Date(l.end_date).getTime() >= t
  );
}

/**
 * Recalculates every task due date when a project deadline moves.
 * Task dates are compressed/expanded proportionally across the remaining
 * window, then each task is checked against assignee leave and capacity.
 */
export function computeDeadlineCascade(
  project: Project,
  projectTasks: Task[],
  allTasks: Task[],
  employees: Employee[],
  leaves: Leave[],
  newDeadline: string
): CascadeResult {
  const oldEnd = project.deadline ? new Date(project.deadline).getTime() : null;
  const newEnd = new Date(newDeadline).getTime();
  const shiftDays = oldEnd ? Math.round((newEnd - oldEnd) / DAY) : 0;

  // Anchor: earliest task due date, or today
  const dated = projectTasks.filter((t) => t.due_date);
  const start = dated.length
    ? Math.min(...dated.map((t) => new Date(t.due_date!).getTime()), Date.now())
    : Date.now();

  const oldSpan = oldEnd ? Math.max(1, oldEnd - start) : 0;
  const newSpan = Math.max(1, newEnd - start);
  const ratio = oldSpan > 0 ? newSpan / oldSpan : 1;

  const tasks: TaskCascade[] = projectTasks
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const emp = employees.find((e) => e.id === t.assignee_id);
      let newDue: string | null = null;

      if (t.due_date && oldEnd) {
        const offset = new Date(t.due_date).getTime() - start;
        const shifted = start + offset * ratio;
        newDue = toISODate(new Date(Math.min(shifted, newEnd)));
      } else if (t.due_date) {
        newDue = toISODate(new Date(Math.min(new Date(t.due_date).getTime(), newEnd)));
      } else {
        newDue = toISODate(new Date(newEnd));
      }

      let atRisk = false;
      let riskReason: string | null = null;

      if (newDue && new Date(newDue).getTime() < Date.now()) {
        atRisk = true;
        riskReason = 'New due date is already in the past';
      } else if (emp && newDue && overlapsLeave(newDue, emp.id, leaves)) {
        atRisk = true;
        riskReason = `${emp.name} is on approved leave that day`;
      } else if (emp) {
        const load = computeEmployeeLoad(emp.id, allTasks, leaves);
        if (load > 90) {
          atRisk = true;
          riskReason = `${emp.name} is at ${load}% capacity`;
        }
      } else if (!emp) {
        atRisk = true;
        riskReason = 'No assignee';
      }

      return {
        taskId: t.id,
        title: t.title,
        assigneeId: t.assignee_id,
        assigneeName: emp?.name ?? 'Unassigned',
        oldDueDate: t.due_date,
        newDueDate: newDue,
        atRisk,
        riskReason,
      };
    });

  const overloadedIds = Array.from(
    new Set(tasks.map((t) => t.assigneeId).filter(Boolean) as string[])
  )
    .map((id) => {
      const emp = employees.find((e) => e.id === id)!;
      return { employeeId: id, name: emp?.name ?? 'Unknown', load: computeEmployeeLoad(id, allTasks, leaves) };
    })
    .filter((e) => e.load > 90);

  return {
    shiftDays,
    direction: shiftDays === 0 ? 'unchanged' : shiftDays > 0 ? 'pushed_out' : 'pulled_in',
    tasks,
    atRiskCount: tasks.filter((t) => t.atRisk).length,
    overloadedAssignees: overloadedIds,
  };
}
