import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { UserMinus } from "lucide-react";
import type { Employee, Project } from "@/lib/types";
import type { AttritionEvent } from "@/lib/finance";
import { toneClass } from "@/lib/finance";

export const Route = createFileRoute("/_app/hr")({
  component: HROpsPage,
});

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

function HROpsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [exits, setExits] = useState<AttritionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", exit_date: new Date().toISOString().slice(0, 10), reason: "" });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [eRes, pRes, aRes] = await Promise.all([
      supabase.from("employees").select("*").order("name"),
      supabase.from("projects").select("*"),
      supabase.from("attrition_events").select("*").order("exit_date", { ascending: false }),
    ]);
    setEmployees((eRes.data as unknown as Employee[]) || []);
    setProjects((pRes.data as Project[]) || []);
    setExits((aRes.data as unknown as AttritionEvent[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["employees", "attrition_events", "projects", "tasks"], fetchData, !!user);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const activeEmployees = employees.filter((e) => (e as Employee & { is_active?: boolean }).is_active !== false);
  const headcount = activeEmployees.length;

  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const recentExits = exits.filter((x) => new Date(x.exit_date) >= yearAgo);
  const avgHeadcount = (headcount + headcount + recentExits.length) / 2;
  const attrition = avgHeadcount > 0 ? Math.round((recentExits.length / avgHeadcount) * 100) : 0;
  const attritionTone = attrition > 15 ? "red" : attrition >= 8 ? "amber" : "green";

  // Skill gaps from active project required skills
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "planning");
  const requiredSkills = Array.from(new Set(activeProjects.flatMap((p) => p.required_skills || [])));
  const gaps = requiredSkills
    .map((skill) => {
      const holders = activeEmployees.filter((e) => (e.skills || []).some((s) => s.toLowerCase() === skill.toLowerCase()));
      return {
        skill,
        count: holders.length,
        projects: activeProjects.filter((p) => (p.required_skills || []).includes(skill)).map((p) => p.name),
      };
    })
    .filter((g) => g.count <= 1);

  // Headcount trend (last 12 months)
  const months: { label: string; headcount: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const joined = employees.filter((e) => {
      const j = (e as Employee & { joined_at?: string }).joined_at || e.created_at;
      return new Date(j) <= end;
    }).length;
    const left = exits.filter((x) => new Date(x.exit_date) <= end).length;
    months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), headcount: Math.max(0, joined - left) });
  }

  const submitExit = async () => {
    if (!user || !form.employee_id) { toast.error("Select an employee"); return; }
    const { error } = await supabase.from("attrition_events").insert({
      employee_id: form.employee_id,
      user_id: user.id,
      exit_date: form.exit_date,
      reason: form.reason || null,
      logged_by: user.email ?? "system",
    });
    if (error) { toast.error("Could not log exit"); return; }
    await supabase.from("employees").update({ is_active: false } as never).eq("id", form.employee_id);
    setOpen(false);
    setForm({ employee_id: "", exit_date: new Date().toISOString().slice(0, 10), reason: "" });
    toast.success("Exit logged");
    fetchData();
  };

  const nameOf = (id: string | null) => employees.find((e) => e.id === id)?.name ?? "—";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">HR Ops</h1>
        <p className="mt-1 text-muted-foreground">Headcount, attrition and hiring risk across the organisation</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Current headcount" value={String(headcount)} />
        <StatCard label="Attrition rate (12mo)" value={`${attrition}%`} valueClass={toneClass[attritionTone as "green"]} />
        <StatCard label="Hiring risk" value={String(gaps.length)} valueClass={gaps.length > 0 ? toneClass.red : toneClass.green} />
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Headcount over time</h2>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="headcount" stroke="var(--primary)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Attrition log</h2>
          <Button onClick={() => setOpen(true)} className="gap-2"><UserMinus className="h-4 w-4" /> Log exit</Button>
        </div>
        {exits.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No exits logged yet</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Employee name</th>
                  <th className="px-4 py-3 font-medium">Exit date</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Logged by</th>
                </tr>
              </thead>
              <tbody>
                {exits.map((x) => (
                  <tr key={x.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{nameOf(x.employee_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(x.exit_date).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{x.reason || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{x.logged_by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Skill gaps</h2>
        {gaps.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No skill gaps right now</p>
        ) : (
          <div className="space-y-2">
            {gaps.map((g) => (
              <div key={g.skill} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
                <div>
                  <p className="font-semibold">{g.skill}</p>
                  <p className="text-xs text-muted-foreground">Required by: {g.projects.join(", ") || "—"}</p>
                </div>
                <span className={`text-sm font-semibold ${g.count === 0 ? toneClass.red : toneClass.amber}`}>
                  {g.count} employee{g.count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log exit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Exit date</Label>
              <Input type="date" value={form.exit_date} onChange={(e) => setForm({ ...form, exit_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submitExit}>Log exit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
