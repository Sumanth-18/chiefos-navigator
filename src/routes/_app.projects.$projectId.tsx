import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Project, Task, Employee, ProjectMember, Leave } from "@/lib/types";
import { computeProjectHealth, computeEmployeeLoad } from "@/lib/types";
import { KanbanBoard } from "@/components/project/KanbanBoard";
import { TaskDetailPanel } from "@/components/project/TaskDetailPanel";
import { AITaskBreakdownModal } from "@/components/project/AITaskBreakdownModal";
import { DeadlineCascadeDialog } from "@/components/project/DeadlineCascadeDialog";
import { ProjectScopeAnalyzer, type ScopeApplyPayload } from "@/components/project/ProjectScopeAnalyzer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, IndianRupee, CalendarDays } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectDetailPage,
});

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/20 text-info",
  high: "bg-warning/20 text-warning",
  critical: "bg-destructive/20 text-destructive",
};

const statusColors: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-primary/20 text-primary",
  completed: "bg-success/20 text-success",
  on_hold: "bg-warning/20 text-warning",
  cancelled: "bg-destructive/20 text-destructive",
};

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAIBreakdown, setShowAIBreakdown] = useState(false);
  const [showDeadlineDialog, setShowDeadlineDialog] = useState(false);
  const [showScope, setShowScope] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [pRes, tRes, eRes, mRes, lRes, allTRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("employees").select("*"),
      supabase.from("project_members").select("*").eq("project_id", projectId),
      supabase.from("leaves").select("*"),
      supabase.from("tasks").select("*"),
    ]);
    if (pRes.data) setProject(pRes.data as Project);
    setTasks((tRes.data as Task[]) || []);
    setEmployees((eRes.data as Employee[]) || []);
    setMembers((mRes.data as ProjectMember[]) || []);
    setLeaves((lRes.data as Leave[]) || []);
    setAllTasks((allTRes.data as Task[]) || []);
    setLoading(false);
  }, [user, projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const health = useMemo(() => project ? computeProjectHealth(project.id, tasks) : null, [project, tasks]);
  const overdueTasks = useMemo(
    () => tasks.filter(t => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date()),
    [tasks]
  );

  const handleTaskStatusChange = useCallback(async (taskId: string, newStatus: Task["status"], oldStatus: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !user) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    const labels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done" };
    toast.success(`Task moved to ${labels[newStatus]}`);

    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error("Failed to update task");
      // Revert
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus as Task["status"] } : t));
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: oldStatus as Task["status"] } : t));
      return;
    }
    const assignee = employees.find(e => e.id === task.assignee_id);
    await supabase.from("audit_log").insert({
      action: "task_status_changed", entity_type: "task", entity_id: taskId,
      details: { title: task.title, from: oldStatus, to: newStatus, moved_by: assignee?.name || "Unknown" },
      user_id: user.id,
    });
  }, [tasks, employees, user]);

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

  const handleMarkComplete = useCallback(async () => {
    if (!user || !project) return;
    const { error } = await supabase.from("projects").update({ status: "completed" }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_log").insert({
      action: "project_completed", entity_type: "project", entity_id: project.id,
      details: { name: project.name }, user_id: user.id,
    });
    toast.success("Project marked complete");
    fetchData();
  }, [user, project, fetchData]);

  const handleScopeApply = useCallback(async (payload: ScopeApplyPayload) => {
    if (!user || !project) return;
    const updates: { required_skills: string[]; budget?: number } = { required_skills: payload.skills };
    if (payload.budget > 0) updates.budget = payload.budget;
    const { error } = await supabase.from("projects").update(updates).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_log").insert({
      action: "project_scope_analyzed", entity_type: "project", entity_id: project.id,
      details: {
        name: project.name, skills: payload.skills, budget: payload.budget,
        team_size: payload.teamSize, weeks: payload.weeks,
      },
      user_id: user.id,
    });
    toast.success("Project skills and budget updated");
    setShowScope(false);
    fetchData();
  }, [user, project, fetchData]);


  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  if (!project || !health) {
    return <div className="py-20 text-center text-muted-foreground">Project not found</div>;
  }

  const teamMembers = members.map(m => ({ member: m, employee: employees.find(e => e.id === m.employee_id) })).filter(t => t.employee);
  const healthDot = health.status === "green" ? "bg-success" : health.status === "yellow" ? "bg-warning" : "bg-destructive";

  // Deadline computation
  let deadlineLabel = "—";
  let deadlineClass = "text-muted-foreground";
  if (project.deadline) {
    const days = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000);
    if (days < 0) {
      deadlineLabel = `⚠ Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""}`;
      deadlineClass = "text-destructive";
    } else if (days === 0) {
      deadlineLabel = "Due today";
      deadlineClass = "text-warning";
    } else {
      deadlineLabel = `Due in ${days} day${days !== 1 ? "s" : ""}`;
      deadlineClass = days <= 7 ? "text-warning" : "text-success";
    }
  }

  const formatINR = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(n)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects" })} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Projects
        </Button>
        <div className="flex-1 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${healthDot}`} />
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <Badge className={priorityColors[project.priority]}>{project.priority}</Badge>
          <Badge className={statusColors[project.status]}>{project.status}</Badge>
          {project.client_name && <span className="text-sm text-muted-foreground">· {project.client_name}</span>}
        </div>
      </div>

      <div className="flex gap-6">
        {/* LEFT PANEL */}
        <aside className="w-[280px] flex-shrink-0 space-y-4">
          {/* Health */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Health</span>
              <span className={`text-2xl font-bold ${health.status === "green" ? "text-success" : health.status === "yellow" ? "text-warning" : "text-destructive"}`}>
                {health.health_score}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-muted-foreground">Complete</p><p className="font-semibold">{health.completion_rate}%</p></div>
              <div><p className="text-muted-foreground">On Time</p><p className="font-semibold">{health.on_time_ratio}%</p></div>
            </div>
          </div>

          {/* Deadline + Budget */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className={`text-sm font-medium ${deadlineClass}`}>{deadlineLabel}</span>
              <button
                onClick={() => setShowDeadlineDialog(true)}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Change
              </button>
            </div>
            {project.budget != null && (
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{formatINR(project.budget)}</span>
              </div>
            )}
          </div>

          {/* Required skills */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Required Skills</span>
              <span className="text-xs text-muted-foreground">{project.required_skills?.length || 0}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(project.required_skills || []).map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
              {(project.required_skills || []).length === 0 && <span className="text-xs text-muted-foreground">None set — analyze a document</span>}
            </div>
          </div>



          {/* Risks */}
          {overdueTasks.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm mb-2">
                <AlertTriangle className="h-4 w-4" /> {overdueTasks.length} task{overdueTasks.length !== 1 ? "s" : ""} overdue
              </div>
              <ul className="space-y-1 text-xs text-destructive/90">
                {overdueTasks.slice(0, 5).map(t => (
                  <li key={t.id} className="truncate">• {t.title}</li>
                ))}
                {overdueTasks.length > 5 && <li className="text-muted-foreground">+ {overdueTasks.length - 5} more</li>}
              </ul>
            </div>
          )}

          {/* Team */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Team</span>
              <span className="text-xs text-muted-foreground">{teamMembers.length}</span>
            </div>
            <div className="space-y-3">
              {teamMembers.map(({ member, employee }) => {
                const load = computeEmployeeLoad(employee!.id, allTasks, leaves);
                const loadColor = load > 85 ? "bg-destructive" : load > 70 ? "bg-warning" : "bg-success";
                return (
                  <div key={member.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{employee!.name.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{employee!.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{member.role || employee!.role}</p>
                      </div>
                      <span className="text-[10px] font-semibold tabular-nums">{load}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full ${loadColor} transition-all`} style={{ width: `${load}%` }} />
                    </div>
                  </div>
                );
              })}
              {teamMembers.length === 0 && <p className="text-xs text-muted-foreground">No team members assigned</p>}
            </div>
          </div>

          {project.status !== "completed" && (
            <Button onClick={handleMarkComplete} className="w-full gap-2" variant="outline">
              <CheckCircle2 className="h-4 w-4" /> Mark Complete
            </Button>
          )}
        </aside>

        {/* RIGHT PANEL — Kanban */}
        <section className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScope(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-all hover:border-primary hover:text-primary"
              >
                <FileUp className="h-4 w-4" /> Upload & Analyze Document
              </button>
              <button
                onClick={() => setShowAIBreakdown(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md shadow-indigo-600/30 transition-all"
              >
                <Sparkles className="h-4 w-4" /> AI Task Breakdown
              </button>
            </div>
          </div>
          <KanbanBoard
            tasks={tasks}
            employees={employees}
            onTaskStatusChange={handleTaskStatusChange}
            onTaskClick={setSelectedTask}
          />
        </section>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          employees={employees}
          allTasks={allTasks}
          leaves={leaves}
          onClose={() => setSelectedTask(null)}
          onSave={handleTaskUpdate}
        />
      )}

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

      {showDeadlineDialog && user && (
        <DeadlineCascadeDialog
          project={project}
          projectTasks={tasks}
          allTasks={allTasks}
          employees={employees}
          leaves={leaves}
          userId={user.id}
          onClose={() => setShowDeadlineDialog(false)}
          onApplied={fetchData}
        />
      )}
    </div>
  );
}
