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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, CalendarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Leave, Employee } from "@/lib/types";

export const Route = createFileRoute("/_app/leaves")({
  component: LeavesPage,
});

function LeavesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", start_date: "", end_date: "", leave_type: "casual", reason: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = async () => {
    if (!user) return;
    const [lRes, eRes] = await Promise.all([
      supabase.from("leaves").select("*").order("start_date", { ascending: false }),
      supabase.from("employees").select("*").order("name"),
    ]);
    setLeaves((lRes.data as Leave[]) || []);
    setEmployees((eRes.data as Employee[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const createLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("leaves").insert({
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      leave_type: form.leave_type,
      reason: form.reason || null,
      user_id: user.id,
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from("audit_log").insert({
      action: "leave_applied", entity_type: "leave",
      details: { employee_id: form.employee_id, start: form.start_date, end: form.end_date },
      user_id: user.id,
    });

    toast.success("Leave recorded");
    setForm({ employee_id: "", start_date: "", end_date: "", leave_type: "casual", reason: "" });
    setShowCreate(false);
    fetchData();
  };

  const deleteLeave = async (id: string) => {
    const { error } = await supabase.from("leaves").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Leave cancelled"); fetchData(); }
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const statusColors: Record<string, string> = {
    approved: "bg-success/20 text-success",
    pending: "bg-warning/20 text-warning",
    rejected: "bg-destructive/20 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Management</h1>
          <p className="mt-1 text-muted-foreground">{leaves.length} leave records</p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={employees.length === 0}>
          <Plus className="mr-2 h-4 w-4" />Apply Leave
        </Button>
      </div>

      {leaves.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarOff className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-lg font-medium text-muted-foreground">No leave records</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave, i) => {
            const emp = employees.find((e) => e.id === leave.employee_id);
            const days = Math.ceil(
              (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000
            ) + 1;
            return (
              <motion.div key={leave.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="glass-card">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                        {emp ? emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2) : "??"}
                      </div>
                      <div>
                        <p className="font-medium">{emp?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(leave.start_date).toLocaleDateString()} — {new Date(leave.end_date).toLocaleDateString()} ({days} day{days > 1 ? "s" : ""})
                        </p>
                        {leave.reason && <p className="text-xs text-muted-foreground mt-0.5">{leave.reason}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="capitalize" variant="outline">{leave.leave_type}</Badge>
                      <Badge className={statusColors[leave.status] || ""}>{leave.status}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => deleteLeave(leave.id)}>
                        <Trash2 className="h-4 w-4 text-destructive/60 hover:text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="dark max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Apply Leave</DialogTitle>
            <DialogDescription>Record a leave for a team member</DialogDescription>
          </DialogHeader>
          <form onSubmit={createLeave} className="space-y-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Start Date *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></div>
              <div className="space-y-2"><Label>End Date *</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></div>
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="earned">Earned</SelectItem>
                  <SelectItem value="comp_off">Comp Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={!form.employee_id || !form.start_date || !form.end_date}>Apply Leave</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
