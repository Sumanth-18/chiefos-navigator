import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, CheckSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Task, Project, Employee } from "@/lib/types";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksPage,
});

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/20 text-info",
  high: "bg-warning/20 text-warning",
  critical: "bg-destructive/20 text-destructive",
};

const statusLabels: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done",
};

function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", priority: "medium" as const,
    project_id: "", assignee_id: "", due_date: "", story_points: "1",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = async () => {
    if (!user) return;
    const [tRes, pRes, eRes] = await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("*"),
      supabase.from("employees").select("*"),
    ]);
    setTasks((tRes.data as Task[]) || []);
    setProjects((pRes.data as Project[]) || []);
    setEmployees((eRes.data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("tasks").insert({
      title: form.title, description: form.description || null,
      priority: form.priority, project_id: form.project_id || null,
      assignee_id: form.assignee_id || null, due_date: form.due_date || null,
      story_points: parseInt(form.story_points) || 1, user_id: user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Task created!");
      setForm({ title: "", description: "", priority: "medium", project_id: "", assignee_id: "", due_date: "", story_points: "1" });
      setShowCreate(false);
      fetchData();
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) toast.error(error.message);
    else fetchData();
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Task deleted"); fetchData(); }
  };

  const filtered = tasks.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statuses = ["todo", "in_progress", "in_review", "done"] as const;

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-1 text-muted-foreground">{tasks.length} tasks total</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />New Task
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban-style columns */}
      <div className="grid gap-4 lg:grid-cols-4">
        {statuses.map((status) => {
          const statusTasks = filtered.filter((t) => t.status === status);
          return (
            <div key={status} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">{statusLabels[status]}</h3>
                <Badge variant="outline" className="text-xs">{statusTasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {statusTasks.map((task, i) => {
                  const assignee = employees.find((e) => e.id === task.assignee_id);
                  const project = projects.find((p) => p.id === task.project_id);
                  return (
                    <motion.div key={task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card className="glass-card">
                        <CardContent className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{task.title}</p>
                            <Badge className={`text-[10px] ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                          </div>
                          {project && <p className="text-xs text-muted-foreground">{project.name}</p>}
                          <div className="flex items-center justify-between">
                            {assignee && (
                              <div className="flex items-center gap-1">
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary">
                                  {assignee.name.split(" ").map((n) => n[0]).join("")}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{assignee.name}</span>
                              </div>
                            )}
                            {task.story_points && (
                              <Badge variant="outline" className="text-[10px]">{task.story_points} SP</Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {statuses.filter((s) => s !== task.status).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateTaskStatus(task.id, s)}
                                className="rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                → {statusLabels[s]}
                              </button>
                            ))}
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="ml-auto rounded px-1 py-0.5 text-[9px] text-destructive/60 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="dark max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>Add a new task</DialogDescription>
          </DialogHeader>
          <form onSubmit={createTask} className="space-y-4">
            <div className="space-y-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Story Points</Label><Input type="number" min="1" value={form.story_points} onChange={(e) => setForm({ ...form, story_points: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Select value={form.assignee_id} onValueChange={(v) => setForm({ ...form, assignee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Create Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
