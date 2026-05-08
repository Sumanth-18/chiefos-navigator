import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Project, Task, Employee, ProjectMember, Leave } from "@/lib/types";
import { computeProjectHealth, computeEmployeeLoad } from "@/lib/types";
import { KanbanBoard } from "@/components/project/KanbanBoard";
import { TaskDetailPanel } from "@/components/project/TaskDetailPanel";
import { AITaskBreakdownModal } from "@/components/project/AITaskBreakdownModal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain, Calendar, Users, Activity } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAIBreakdown, setShowAIBreakdown] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [pRes, tRes, eRes, mRes, lRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("employees").select("*"),
      supabase.from("project_members").select("*").eq("project_id", projectId),
      supabase.from("leaves").select("*"),
    ]);
    if (pRes.data) setProject(pRes.data as Project);
    setTasks((tRes.data as Task[]) || []);
    setEmployees((eRes.data as Employee[]) || []);
    setMembers((mRes.data as ProjectMember[]) || []);
    setLeaves((lRes.data as Leave[]) || []);
    setLoading(false);
  }, [user, projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const health = useMemo(() => project ? computeProjectHealth(project.id, tasks) : null, [project, tasks]);

  const handleTaskStatusChange = useCallback(async (taskId: string, newStatus: Task["status"], oldStatus: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !user) return;
    const assignee = employees.find(e => e.id === task.assignee_id);
    const assigneeName = assignee?.name || "Unknown";

    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) { toast.error(error.message); return; }

    await supabase.from("audit_log").insert({
      action: "task_moved", entity_type: "task", entity_id: taskId,
      details: { title: task.title, from: oldStatus, to: newStatus, moved_by: assigneeName },
      user_id: user.id,
    });

    const statusLabels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done" };
    toast.success(`Task moved to ${statusLabels[newStatus]}`);
    fetchData();
  }, [tasks, employees, user, fetchData]);

  const handleTaskUpdate = useCallback(async (taskId: string, updates: Partial<Task>) => {
    if (!user) return;
    const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    const task = tasks.find(t => t.id === taskId);
    await supabase.from("audit_log").insert({
      action: "task_updated", entity_type: "task", entity_id: taskId,
      details: { title: task?.title, changes: Object.keys(updates) },
      user_id: user.id,
    });
    toast.success("Task updated");
    setSelectedTask(null);
    fetchData();
  }, [user, tasks, fetchData]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  if (!project || !health) {
    return <div className="py-20 text-center text-muted-foreground">Project not found</div>;
  }

  const teamMembers = members.map(m => employees.find(e => e.id === m.employee_id)).filter(Boolean) as Employee[];
  const healthDot = health.status === "green" ? "bg-success" : health.status === "yellow" ? "bg-warning" : "bg-destructive";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/projects" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${healthDot}`} />
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="outline">{project.priority}</Badge>
            <Badge variant="outline">{project.status}</Badge>
          </div>
          {project.client_name && <p className="mt-1 text-sm text-muted-foreground ml-6">{project.client_name}</p>}
        </div>
        <Button onClick={() => setShowAIBreakdown(true)} className="gap-2">
          <Brain className="h-4 w-4" />
          AI Task Breakdown
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{health.health_score}%</p>
              <p className="text-xs text-muted-foreground">Health Score</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-success/20 flex items-center justify-center text-success text-xs font-bold">✓</div>
            <div>
              <p className="text-2xl font-bold">{health.completion_rate}%</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-info" />
            <div>
              <p className="text-2xl font-bold">{teamMembers.length}</p>
              <p className="text-xs text-muted-foreground">Team Members</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-warning" />
            <div>
              <p className="text-2xl font-bold">{project.deadline ? new Date(project.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</p>
              <p className="text-xs text-muted-foreground">Deadline</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      <KanbanBoard
        tasks={tasks}
        employees={employees}
        onTaskStatusChange={handleTaskStatusChange}
        onTaskClick={setSelectedTask}
      />

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          employees={employees}
          allTasks={tasks}
          leaves={leaves}
          onClose={() => setSelectedTask(null)}
          onSave={handleTaskUpdate}
        />
      )}

      {/* AI Task Breakdown Modal */}
      {showAIBreakdown && (
        <AITaskBreakdownModal
          project={project}
          employees={employees}
          members={members}
          existingTasks={tasks}
          leaves={leaves}
          onClose={() => setShowAIBreakdown(false)}
          onTasksCreated={fetchData}
        />
      )}
    </div>
  );
}
