import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Users, CheckSquare, TrendingUp, AlertTriangle, Clock, Zap, Activity, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import type { Project, Employee, Task, Leave, AuditLogEntry } from "@/lib/types";
import { computeEmployeeLoad, computeProjectHealth } from "@/lib/types";
import { formatINR, toneClass, varianceTone, type Expense } from "@/lib/finance";
import { DepartmentBreakdown } from "@/components/dashboard/DepartmentBreakdown";


export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);


  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [pRes, eRes, tRes, lRes, aRes, xRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("employees").select("*").eq("is_active", true),
        supabase.from("tasks").select("*"),
        supabase.from("leaves").select("*"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("expenses").select("*"),
      ]);
      setProjects((pRes.data as Project[]) || []);
      setEmployees((eRes.data as Employee[]) || []);
      setTasks((tRes.data as Task[]) || []);
      setLeaves((lRes.data as Leave[]) || []);
      setEvents((aRes.data as AuditLogEntry[]) || []);
      setExpenses((xRes.data as unknown as Expense[]) || []);
      setLoading(false);

    }
    fetchData();
  }, [user]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  // Computed values
  const employeesWithLoad = employees.map((e) => ({
    ...e,
    computed_load: computeEmployeeLoad(e.id, tasks, leaves),
    active_task_count: tasks.filter((t) => t.assignee_id === e.id && t.status !== "done").length,
  }));

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const avgLoad = employeesWithLoad.length
    ? Math.round(employeesWithLoad.reduce((s, e) => s + e.computed_load, 0) / employeesWithLoad.length)
    : 0;
  const criticalTasks = tasks.filter((t) => t.priority === "critical" && t.status !== "done").length;
  const overloadedCount = employeesWithLoad.filter((e) => e.computed_load > 90).length;
  const onLeaveCount = leaves.filter((l) => l.status === "approved" && new Date(l.start_date) <= new Date() && new Date(l.end_date) >= new Date()).length;

  const totalBudgeted = projects.filter((p) => p.status === "active").reduce((s, p) => s + Number(p.budget || 0), 0);
  const totalSpent = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const overallVariancePct = totalBudgeted > 0 ? Math.round(((totalBudgeted - totalSpent) / totalBudgeted) * 100) : 0;
  const financeTone = varianceTone(totalBudgeted, totalSpent);

  const kpis = [

    { label: "Active Projects", value: activeProjects, total: projects.length, icon: FolderKanban, color: "text-primary" },
    { label: "Team Members", value: employees.length, icon: Users, color: "text-info" },
    { label: "Tasks Done", value: completedTasks, total: tasks.length, icon: CheckSquare, color: "text-success" },
    { label: "Avg Load", value: `${avgLoad}%`, icon: TrendingUp, color: avgLoad > 80 ? "text-destructive" : avgLoad > 60 ? "text-warning" : "text-success" },
  ];

  const recentProjects = projects.slice(0, 5);

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-info/20 text-info",
    high: "bg-warning/20 text-warning",
    critical: "bg-destructive/20 text-destructive",
  };

  const healthColors: Record<string, string> = {
    green: "text-success",
    yellow: "text-warning",
    red: "text-destructive",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Your command center — all metrics computed in real-time</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="glass-card">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl bg-secondary p-3 ${kpi.color}`}><kpi.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold">
                    {kpi.value}
                    {kpi.total !== undefined && <span className="text-sm font-normal text-muted-foreground">/{kpi.total}</span>}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project Health Cards */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Project Health</CardTitle>
            <button onClick={() => navigate({ to: "/projects" })} className="text-sm text-primary hover:underline">View all →</button>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentProjects.map((project) => {
                  const health = computeProjectHealth(project.id, tasks);
                  const projectTasks = tasks.filter((t) => t.project_id === project.id);
                  const doneTasks = projectTasks.filter((t) => t.status === "done").length;
                  return (
                    <div key={project.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3 transition-colors hover:bg-accent/50 cursor-pointer" onClick={() => navigate({ to: "/projects" })}>
                      <div className="flex items-center gap-3 flex-1">
                        <div className={`h-2 w-2 rounded-full ${health.status === 'green' ? 'bg-success' : health.status === 'yellow' ? 'bg-warning' : 'bg-destructive'}`} />
                        <div>
                          <p className="font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{doneTasks}/{projectTasks.length} tasks · {health.completion_rate}% complete</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${healthColors[health.status]}`}>{health.health_score}</span>
                        <Badge className={priorityColors[project.priority]}>{project.priority}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-lg">Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {criticalTasks > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">{criticalTasks} Critical Tasks</p>
                  <p className="text-xs text-muted-foreground">Require immediate attention</p>
                </div>
              </div>
            )}
            {overloadedCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">{overloadedCount} Overloaded</p>
                  <p className="text-xs text-muted-foreground">Team members above 90% computed capacity</p>
                </div>
              </div>
            )}
            {onLeaveCount > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/5 p-3">
                <Activity className="mt-0.5 h-4 w-4 text-info" />
                <div>
                  <p className="text-sm font-medium text-info">{onLeaveCount} On Leave Today</p>
                  <p className="text-xs text-muted-foreground">Capacity is reduced</p>
                </div>
              </div>
            )}
            {projects.filter((p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== "completed").length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Clock className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Overdue Projects</p>
                  <p className="text-xs text-muted-foreground">
                    {projects.filter((p) => p.deadline && new Date(p.deadline) < new Date() && p.status !== "completed").length} past deadline
                  </p>
                </div>
              </div>
            )}
            {criticalTasks === 0 && overloadedCount === 0 && onLeaveCount === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
                <Zap className="mt-0.5 h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">All Clear</p>
                  <p className="text-xs text-muted-foreground">No critical alerts</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Wallet className="h-4 w-4 text-primary" />
          <CardTitle className="text-lg">Finance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Total budgeted</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(totalBudgeted)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total spent</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(totalSpent)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Overall variance</p>
            <p className={`text-2xl font-bold tabular-nums ${toneClass[financeTone]}`}>{overallVariancePct}%</p>
          </div>
        </CardContent>
      </Card>

      <DepartmentBreakdown employees={employees} tasks={tasks} leaves={leaves} events={events} />

    </div>
  );
}
