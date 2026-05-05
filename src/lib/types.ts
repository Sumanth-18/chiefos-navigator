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
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  story_points: number | null;
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

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
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
