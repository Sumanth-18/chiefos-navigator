import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, FolderKanban, Trash2, Calendar, Zap } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Project, Task, ProjectMember } from "@/lib/types";
import { computeProjectHealth } from "@/lib/types";

export const Route = createFileRoute("/_app/projects")({
  component: ProjectsPage,
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

const healthDot: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
};

function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [form, setForm] = useState({
    name: "", brief: "", required_skills: "", deadline: "",
    priority: "medium" as const, budget: "", client_name: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = async () => {
    if (!user) return;
    const [pRes, tRes, mRes] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase.from("tasks").select("*"),
      supabase.from("project_members").select("*"),
    ]);
    setProjects((pRes.data as Project[]) || []);
    setTasks((tRes.data as Task[]) || []);
    setMembers((mRes.data as ProjectMember[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error, data } = await supabase.from("projects").insert({
      name: form.name, brief: form.brief || null,
      required_skills: form.required_skills ? form.required_skills.split(",").map((s) => s.trim()) : [],
      deadline: form.deadline || null, priority: form.priority,
      budget: form.budget ? parseFloat(form.budget) : null,
      client_name: form.client_name || null, user_id: user.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("audit_log").insert({
      action: "created", entity_type: "project", entity_id: data.id,
      details: { name: form.name }, user_id: user.id,
    });
    toast.success("Project created!");
    setForm({ name: "", brief: "", required_skills: "", deadline: "", priority: "medium", budget: "", client_name: "" });
    setShowCreate(false);
    fetchData();
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Project deleted"); setSelectedProject(null); fetchData(); }
  };

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const selectedHealth = selectedProject ? computeProjectHealth(selectedProject.id, tasks) : null;
  const selectedTasks = selectedProject ? tasks.filter((t) => t.project_id === selectedProject.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">{projects.length} projects — health computed dynamically</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate({ to: "/projects/new" })}><Zap className="mr-2 h-4 w-4" />AI Wizard</Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />New Project</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">No projects found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project, i) => {
            const health = computeProjectHealth(project.id, tasks);
            const projectTasks = tasks.filter((t) => t.project_id === project.id);
            const doneTasks = projectTasks.filter((t) => t.status === "done").length;
            const teamSize = members.filter((m) => m.project_id === project.id).length;
            return (
              <motion.div key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="glass-card cursor-pointer transition-all hover:border-primary/30 hover:glow-primary" onClick={() => navigate({ to: "/projects/$projectId", params: { projectId: project.id } })}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${healthDot[health.status]}`} />
                        <CardTitle className="text-base">{project.name}</CardTitle>
                      </div>
                      <Badge className={priorityColors[project.priority]}>{project.priority}</Badge>
                    </div>
                    {project.client_name && <p className="text-xs text-muted-foreground">{project.client_name}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[project.status]}>{project.status}</Badge>
                      <span className="text-xs font-semibold ml-auto">{health.health_score}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{teamSize} members</span>
                      <span>{doneTasks}/{projectTasks.length} tasks</span>
                    </div>
                    {project.deadline && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(project.deadline).toLocaleDateString()}
                        {new Date(project.deadline) < new Date() && project.status !== "completed" && (
                          <Badge className="bg-destructive/20 text-destructive text-[9px] ml-1">Overdue</Badge>
                        )}
                      </div>
                    )}
                    {projectTasks.length > 0 && (
                      <div className="h-1.5 w-full rounded-full bg-secondary">
                        <div className={`h-full rounded-full transition-all ${health.status === "red" ? "bg-destructive" : health.status === "yellow" ? "bg-warning" : "bg-primary"}`}
                          style={{ width: `${health.completion_rate}%` }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="dark max-w-lg border-border bg-card">
          <DialogHeader><DialogTitle>Create Project</DialogTitle><DialogDescription>Add a new project</DialogDescription></DialogHeader>
          <form onSubmit={createProject} className="space-y-4">
            <div className="space-y-2"><Label>Project Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Brief</Label><Textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Client</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              <div className="space-y-2"><Label>Budget (₹)</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Required Skills (comma-separated)</Label><Input placeholder="React, Node.js, AWS" value={form.required_skills} onChange={(e) => setForm({ ...form, required_skills: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit">Create Project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="dark max-w-lg border-border bg-card max-h-[85vh] overflow-y-auto">
          {selectedProject && selectedHealth && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedProject.name}</DialogTitle>
                <DialogDescription>{selectedProject.brief || "No description"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Badge className={priorityColors[selectedProject.priority]}>{selectedProject.priority}</Badge>
                  <Badge className={statusColors[selectedProject.status]}>{selectedProject.status}</Badge>
                </div>

                {/* Health Score */}
                <div className="rounded-lg border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground mb-2">Health Score</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className={`text-lg font-bold ${selectedHealth.status === "green" ? "text-success" : selectedHealth.status === "yellow" ? "text-warning" : "text-destructive"}`}>
                        {selectedHealth.health_score}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Overall</p>
                    </div>
                    <div><p className="text-lg font-bold">{selectedHealth.completion_rate}%</p><p className="text-[10px] text-muted-foreground">Complete</p></div>
                    <div><p className="text-lg font-bold">{selectedHealth.on_time_ratio}%</p><p className="text-[10px] text-muted-foreground">On-time</p></div>
                    <div><p className="text-lg font-bold">{selectedHealth.load_balance}%</p><p className="text-[10px] text-muted-foreground">Balance</p></div>
                  </div>
                </div>

                {selectedProject.client_name && <p className="text-sm"><span className="text-muted-foreground">Client:</span> {selectedProject.client_name}</p>}
                {selectedProject.deadline && <p className="text-sm"><span className="text-muted-foreground">Deadline:</span> {new Date(selectedProject.deadline).toLocaleDateString()}</p>}
                {selectedProject.budget && <p className="text-sm"><span className="text-muted-foreground">Budget:</span> ₹{selectedProject.budget.toLocaleString()}</p>}

                {/* Task List */}
                {selectedTasks.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Tasks ({selectedTasks.length})</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedTasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-xs rounded border border-border/30 px-2 py-1">
                          <span>{t.title}</span>
                          <Badge variant="outline" className="text-[9px]">{t.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedProject.required_skills.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm text-muted-foreground">Required Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedProject.required_skills.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="destructive" size="sm" onClick={() => deleteProject(selectedProject.id)}>
                  <Trash2 className="mr-2 h-3 w-3" />Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
