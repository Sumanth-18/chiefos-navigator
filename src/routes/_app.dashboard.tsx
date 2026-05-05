import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Users, CheckSquare, TrendingUp, AlertTriangle, Clock, Zap } from "lucide-react";
import { motion } from "framer-motion";
import type { Project, Employee, Task } from "@/lib/types";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [pRes, eRes, tRes] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("employees").select("*"),
        supabase.from("tasks").select("*"),
      ]);
      setProjects((pRes.data as Project[]) || []);
      setEmployees((eRes.data as Employee[]) || []);
      setTasks((tRes.data as Task[]) || []);
      setLoading(false);
    }
    fetchData();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const avgLoad = employees.length
    ? Math.round(employees.reduce((s, e) => s + e.current_load, 0) / employees.length)
    : 0;
  const criticalTasks = tasks.filter((t) => t.priority === "critical" && t.status !== "done").length;

  const kpis = [
    { label: "Active Projects", value: activeProjects, total: projects.length, icon: FolderKanban, color: "text-primary" },
    { label: "Team Members", value: employees.length, icon: Users, color: "text-info" },
    { label: "Tasks Done", value: completedTasks, total: tasks.length, icon: CheckSquare, color: "text-success" },
    { label: "Avg Load", value: `${avgLoad}%`, icon: TrendingUp, color: avgLoad > 80 ? "text-destructive" : "text-warning" },
  ];

  const recentProjects = projects.slice(0, 5);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Your command center overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="glass-card">
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-xl bg-secondary p-3 ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold">
                    {kpi.value}
                    {kpi.total !== undefined && (
                      <span className="text-sm font-normal text-muted-foreground">/{kpi.total}</span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Projects */}
        <Card className="glass-card lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Projects</CardTitle>
            <button
              onClick={() => navigate({ to: "/projects" })}
              className="text-sm text-primary hover:underline"
            >
              View all →
            </button>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No projects yet. Create your first project!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 p-3 transition-colors hover:bg-accent/50 cursor-pointer"
                    onClick={() => navigate({ to: "/projects" })}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.client_name || "No client"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={priorityColors[project.priority]}>{project.priority}</Badge>
                      <Badge className={statusColors[project.status]}>{project.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Alerts</CardTitle>
          </CardHeader>
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
            {employees.filter((e) => e.current_load > 90).length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
                <div>
                  <p className="text-sm font-medium text-warning">
                    {employees.filter((e) => e.current_load > 90).length} Overloaded
                  </p>
                  <p className="text-xs text-muted-foreground">Team members above 90% capacity</p>
                </div>
              </div>
            )}
            {projects.filter((p) => p.deadline && new Date(p.deadline) < new Date()).length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Clock className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Overdue Projects</p>
                  <p className="text-xs text-muted-foreground">
                    {projects.filter((p) => p.deadline && new Date(p.deadline) < new Date()).length} past deadline
                  </p>
                </div>
              </div>
            )}
            {criticalTasks === 0 && employees.filter((e) => e.current_load > 90).length === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
                <Zap className="mt-0.5 h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium text-success">All Clear</p>
                  <p className="text-xs text-muted-foreground">No critical alerts at this time</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
