export interface Project {
  id: string;
  name: string;
  brief: string | null;
  required_skills: string[];
  deadline: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'planning' | 'active' | 'completed' | 'on_hold' | 'cancelled';
  budget: number | null;
  client_name: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  skills: string[];
  current_load: number;
  delivery_score: number;
  on_time_count: number;
  total_projects: number;
  leaves_booked: number;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  // Computed fields (not in DB, calculated at runtime)
  computed_load?: number;
  active_task_count?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  story_points: number | null;
  estimated_hours: number | null;
  dependency_ids: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in_progress' | 'in_review' | 'done';
  project_id: string | null;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  employee_id: string;
  match_score: number | null;
  role: string | null;
  created_at: string;
}

export interface Leave {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
  reason: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
}

export interface ProjectHealth {
  health_score: number;
  completion_rate: number;
  on_time_ratio: number;
  load_balance: number;
  status: 'green' | 'yellow' | 'red';
}

export interface AISuggestion {
  suggestedTeam: {
    employeeId: string;
    matchScore: number;
    reason: string;
    matchedSkills: string[];
  }[];
  risks: string[];
  estimatedWeeks: number;
  suggestedTasks: {
    title: string;
    description: string;
    storyPoints: number;
    priority: string;
  }[];
}

// Utility: calculate employee load client-side from tasks and leaves
export function computeEmployeeLoad(
  employeeId: string,
  tasks: Task[],
  leaves: Leave[]
): number {
  const activeTasks = tasks.filter(
    (t) => t.assignee_id === employeeId && t.status !== 'done'
  );
  const totalHours = activeTasks.reduce((s, t) => s + (t.estimated_hours || 8), 0);

  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 86400000);
  const leaveDays = leaves
    .filter((l) => l.employee_id === employeeId && l.status === 'approved' && new Date(l.end_date) >= now)
    .reduce((sum, l) => {
      const start = new Date(Math.max(new Date(l.start_date).getTime(), now.getTime()));
      const end = new Date(Math.min(new Date(l.end_date).getTime(), twoWeeksLater.getTime()));
      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
      return sum + days;
    }, 0);

  const availableHours = (40 * 2) - (leaveDays * 8);
  if (availableHours <= 0) return 100;
  return Math.min(100, Math.round((totalHours / availableHours) * 100));
}

export function computeProjectHealth(
  projectId: string,
  tasks: Task[]
): ProjectHealth {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  const total = projectTasks.length;
  if (total === 0) {
    return { health_score: 100, completion_rate: 0, on_time_ratio: 100, load_balance: 100, status: 'green' };
  }

  const done = projectTasks.filter((t) => t.status === 'done').length;
  const overdue = projectTasks.filter(
    (t) => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()
  ).length;

  const completionRate = (done / total) * 100;
  const onTimeRatio = ((total - overdue) / total) * 100;

  // Load balance via coefficient of variation
  const assigneeCounts: Record<string, number> = {};
  projectTasks.filter((t) => t.assignee_id && t.status !== 'done').forEach((t) => {
    assigneeCounts[t.assignee_id!] = (assigneeCounts[t.assignee_id!] || 0) + 1;
  });
  const counts = Object.values(assigneeCounts);
  let loadBalance = 100;
  if (counts.length > 1) {
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stddev = Math.sqrt(counts.reduce((s, c) => s + (c - avg) ** 2, 0) / counts.length);
    loadBalance = Math.max(0, 100 - (stddev / (avg || 1)) * 100);
  } else if (counts.length === 1) {
    loadBalance = 50;
  }

  const healthScore = Math.round(0.4 * completionRate + 0.3 * onTimeRatio + 0.3 * loadBalance);
  return {
    health_score: healthScore,
    completion_rate: Math.round(completionRate),
    on_time_ratio: Math.round(onTimeRatio),
    load_balance: Math.round(loadBalance),
    status: healthScore >= 80 ? 'green' : healthScore >= 60 ? 'yellow' : 'red',
  };
}
