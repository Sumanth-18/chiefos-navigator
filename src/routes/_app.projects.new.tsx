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
import { Switch } from "@/components/ui/switch";
import { Zap, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import type { Employee, Task, Leave, AISuggestion } from "@/lib/types";
import { computeEmployeeLoad } from "@/lib/types";

export const Route = createFileRoute("/_app/projects/new")({
  component: NewProjectWizard,
});

function NewProjectWizard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [autoTasks, setAutoTasks] = useState(true);
  const [editedTasks, setEditedTasks] = useState<AISuggestion["suggestedTasks"]>([]);

  const [form, setForm] = useState({
    name: "", brief: "", required_skills: "", deadline: "",
    priority: "medium" as const, budget: "", client_name: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("tasks").select("*"),
      supabase.from("leaves").select("*"),
    ]).then(([eRes, tRes, lRes]) => {
      setEmployees((eRes.data as Employee[]) || []);
      setTasks((tRes.data as Task[]) || []);
      setLeaves((lRes.data as Leave[]) || []);
    });
  }, [user]);

  const requestAISuggestion = async () => {
    if (!user) return;
    setAiLoading(true);
    try {
      const project = {
        name: form.name, brief: form.brief,
        required_skills: form.required_skills.split(",").map((s) => s.trim()).filter(Boolean),
        deadline: form.deadline, priority: form.priority,
      };
      // Send computed loads to AI instead of static
      const empData = employees.map((e) => ({
        id: e.id, name: e.name, skills: e.skills,
        current_load: computeEmployeeLoad(e.id, tasks, leaves),
        delivery_score: e.delivery_score,
        on_time_count: e.on_time_count,
        leaves_booked: leaves.filter((l) => l.employee_id === e.id && l.status === "approved" && new Date(l.end_date) >= new Date()).length,
        active_tasks: tasks.filter((t) => t.assignee_id === e.id && t.status !== "done").length,
      }));

      const { data, error } = await supabase.functions.invoke("ai-team-suggest", {
        body: { project, employees: empData },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setSuggestion(data);
      setEditedTasks(data.suggestedTasks || []);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  };

  const launchProject = async () => {
    if (!user || !suggestion) return;
    try {
      const { data: project, error: pErr } = await supabase.from("projects").insert({
        name: form.name, brief: form.brief || null,
        required_skills: form.required_skills.split(",").map((s) => s.trim()).filter(Boolean),
        deadline: form.deadline || null, priority: form.priority,
        budget: form.budget ? parseFloat(form.budget) : null,
        client_name: form.client_name || null,
        status: "active", user_id: user.id,
      }).select().single();
      if (pErr) throw pErr;

      // Add team members
      const memberInserts = suggestion.suggestedTeam.map((m) => ({
        project_id: project.id, employee_id: m.employeeId,
        match_score: m.matchScore, role: "member",
      }));
      if (memberInserts.length > 0) {
        await supabase.from("project_members").insert(memberInserts);
      }

      // Create tasks and auto-assign to team members
      if (autoTasks && editedTasks.length > 0) {
        const teamIds = suggestion.suggestedTeam.map((m) => m.employeeId);
        const taskInserts = editedTasks.map((t, i) => ({
          title: t.title, description: t.description,
          story_points: t.storyPoints, priority: t.priority,
          estimated_hours: t.storyPoints * 4, // estimate: 4h per SP
          project_id: project.id, user_id: user.id,
          // Round-robin assign to team members
          assignee_id: teamIds.length > 0 ? teamIds[i % teamIds.length] : null,
        }));
        await supabase.from("tasks").insert(taskInserts);

        // Audit: task assignments
        for (const ti of taskInserts) {
          if (ti.assignee_id) {
            await supabase.from("audit_log").insert({
              action: "task_assigned", entity_type: "task",
              details: { title: ti.title, assignee_id: ti.assignee_id, auto: true },
              user_id: user.id,
            });
          }
        }
      }

      // Audit log
      await supabase.from("audit_log").insert({
        action: "launched_with_ai", entity_type: "project", entity_id: project.id,
        details: { name: form.name, teamSize: suggestion.suggestedTeam.length, tasksCreated: editedTasks.length },
        user_id: user.id,
      });

      toast.success("Project launched with AI-assigned team & tasks!");
      navigate({ to: "/projects" });
    } catch (err: any) {
      toast.error(err.message || "Failed to launch project");
    }
  };

  const removeTask = (index: number) => {
    setEditedTasks(editedTasks.filter((_, i) => i !== index));
  };

  if (authLoading) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          <Sparkles className="mr-2 inline h-7 w-7 text-primary" />
          AI Project Wizard
        </h1>
        <p className="mt-1 text-muted-foreground">AI analyzes real workload, skills & availability to build your team</p>
      </div>

      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${step >= s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{s}</div>
            {s < 3 && <div className={`h-0.5 w-12 rounded transition-all ${step > s ? "bg-primary" : "bg-secondary"}`} />}
          </div>
        ))}
        <div className="ml-3 text-sm text-muted-foreground">
          {step === 1 ? "Project Brief" : step === 2 ? "AI Suggestions" : "Confirm & Launch"}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            <Card className="glass-card">
              <CardHeader><CardTitle>Project Brief</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Project Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Cloud Migration for TCS" /></div>
                <div className="space-y-2"><Label>Brief / Description</Label><Textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={4} placeholder="Describe goals, scope, deliverables..." /></div>
                <div className="space-y-2"><Label>Required Skills *</Label><Input value={form.required_skills} onChange={(e) => setForm({ ...form, required_skills: e.target.value })} placeholder="React, AWS, Docker, CI/CD" /></div>
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
                <div className="flex justify-end pt-2">
                  <Button onClick={requestAISuggestion} disabled={!form.name || !form.required_skills || aiLoading || employees.length === 0}>
                    {aiLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing workloads...</> : <><Zap className="mr-2 h-4 w-4" />Get AI Suggestions</>}
                  </Button>
                </div>
                {employees.length === 0 && <p className="text-sm text-warning">Add employees first to get team suggestions.</p>}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 2 && suggestion && (
          <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
            <Card className="glass-card">
              <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" />Suggested Team</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {suggestion.suggestedTeam.map((member) => {
                  const emp = employees.find((e) => e.id === member.employeeId);
                  if (!emp) return null;
                  const load = computeEmployeeLoad(emp.id, tasks, leaves);
                  return (
                    <div key={member.employeeId} className="flex items-center gap-4 rounded-lg border border-border/50 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                        {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{emp.name}</p>
                          <Badge className="bg-primary/20 text-primary text-xs">{member.matchScore}% match</Badge>
                          <Badge variant="outline" className={`text-[10px] ${load > 80 ? "text-destructive" : "text-success"}`}>{load}% load</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{member.reason}</p>
                        <div className="mt-1 flex gap-1">
                          {member.matchedSkills.map((s) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {suggestion.risks.length > 0 && (
              <Card className="glass-card border-warning/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-warning"><AlertTriangle className="h-5 w-5" />AI Risk Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {suggestion.risks.map((risk, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1 text-warning">•</span>{risk}</li>)}
                  </ul>
                  <p className="mt-3 text-sm text-muted-foreground">Estimated timeline: <span className="font-semibold text-foreground">{suggestion.estimatedWeeks} weeks</span></p>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              <Button onClick={() => setStep(3)}>Confirm & Launch <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </motion.div>
        )}

        {step === 3 && suggestion && (
          <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
            <Card className="glass-card">
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-xs text-muted-foreground">Project</p><p className="font-medium">{form.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Priority</p><Badge className="capitalize">{form.priority}</Badge></div>
                  <div><p className="text-xs text-muted-foreground">Team Size</p><p className="font-medium">{suggestion.suggestedTeam.length} members</p></div>
                  <div><p className="text-xs text-muted-foreground">Timeline</p><p className="font-medium">{suggestion.estimatedWeeks} weeks</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-generate & assign tasks</Label>
                    <p className="text-xs text-muted-foreground">Tasks will be auto-assigned to team via round-robin</p>
                  </div>
                  <Switch checked={autoTasks} onCheckedChange={setAutoTasks} />
                </div>
              </CardContent>
            </Card>

            {autoTasks && editedTasks.length > 0 && (
              <Card className="glass-card">
                <CardHeader><CardTitle className="text-base">Generated Tasks ({editedTasks.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {editedTasks.map((task, i) => {
                    const assigneeId = suggestion.suggestedTeam.length > 0 ? suggestion.suggestedTeam[i % suggestion.suggestedTeam.length].employeeId : null;
                    const assignee = assigneeId ? employees.find((e) => e.id === assigneeId) : null;
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
                        <CheckCircle className="h-4 w-4 text-success" />
                        <span className="flex-1 text-sm">{task.title}</span>
                        {assignee && <Badge variant="outline" className="text-[10px]">{assignee.name}</Badge>}
                        <Badge variant="outline" className="text-[10px]">{task.storyPoints} SP</Badge>
                        <button onClick={() => removeTask(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
              <Button onClick={launchProject} className="glow-primary">
                <Sparkles className="mr-2 h-4 w-4" />Launch Project
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
