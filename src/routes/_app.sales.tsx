import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, GripVertical, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import type { Employee } from "@/lib/types";
import { formatINR, STAGE_PROBABILITY, toneClass, type Deal, type DealStage } from "@/lib/finance";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

const STAGES: { id: DealStage; label: string; dot: string }[] = [
  { id: "Lead", label: "Lead", dot: "bg-muted-foreground" },
  { id: "Proposal", label: "Proposal", dot: "bg-info" },
  { id: "Negotiation", label: "Negotiation", dot: "bg-warning" },
  { id: "Won", label: "Won", dot: "bg-success" },
  { id: "Lost", label: "Lost", dot: "bg-destructive" },
];

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

function SalesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [open, setOpen] = useState(false);
  const [convertDeal, setConvertDeal] = useState<Deal | null>(null);
  const [form, setForm] = useState({
    client_name: "",
    value: "",
    stage: "Lead" as DealStage,
    expected_close_date: "",
    owner_id: "",
  });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [dRes, eRes] = await Promise.all([
      supabase.from("deals").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("*").order("name"),
    ]);
    setDeals((dRes.data as unknown as Deal[]) || []);
    setEmployees((eRes.data as Employee[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useRealtime(["deals", "employees"], fetchData, !!user);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const openDeals = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  const totalPipeline = openDeals.reduce((s, d) => s + Number(d.value || 0), 0);
  const weighted = deals.reduce((s, d) => s + Number(d.value || 0) * (STAGE_PROBABILITY[d.stage] ?? 0), 0);
  const now = new Date();
  const wonThisMonth = deals
    .filter((d) => {
      if (d.stage !== "Won") return false;
      const ref = d.won_at ? new Date(d.won_at) : new Date(d.created_at);
      return ref.getMonth() === now.getMonth() && ref.getFullYear() === now.getFullYear();
    })
    .reduce((s, d) => s + Number(d.value || 0), 0);

  const moveDeal = async (dealId: string, stage: DealStage) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    const patch: Record<string, unknown> = { stage };
    if (stage === "Won") patch.won_at = new Date().toISOString();
    const { error } = await supabase.from("deals").update(patch as never).eq("id", dealId);
    if (error) { toast.error("Could not move deal"); fetchData(); return; }
    if (stage === "Won") setConvertDeal({ ...deal, stage });
    fetchData();
  };

  const submitDeal = async () => {
    if (!user || !form.client_name.trim() || !form.value) { toast.error("Client name and value are required"); return; }
    const { error } = await supabase.from("deals").insert({
      user_id: user.id,
      client_name: form.client_name.trim(),
      value: parseFloat(form.value),
      stage: form.stage,
      expected_close_date: form.expected_close_date || null,
      owner_id: form.owner_id || null,
      won_at: form.stage === "Won" ? new Date().toISOString() : null,
    } as never);
    if (error) { toast.error("Could not create deal"); return; }
    setOpen(false);
    setForm({ client_name: "", value: "", stage: "Lead", expected_close_date: "", owner_id: "" });
    toast.success("Deal created");
    fetchData();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <p className="mt-1 text-muted-foreground">Pipeline, weighted forecast and won-deal handoff to delivery</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total pipeline" value={formatINR(totalPipeline)} />
        <StatCard label="Weighted pipeline" value={formatINR(weighted)} />
        <StatCard label="Won this month" value={formatINR(wonThisMonth)} valueClass={toneClass.green} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Pipeline</h2>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New deal</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {STAGES.map((col) => {
          const colDeals = deals.filter((d) => d.stage === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(col.id); }}
              onDragLeave={() => setOverStage((s) => (s === col.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setOverStage(null);
                setDragId(null);
                if (id) moveDeal(id, col.id);
              }}
              className={`rounded-xl border p-3 transition-colors ${overStage === col.id ? "border-primary bg-primary/5" : "border-border bg-secondary/30"}`}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <span className="text-sm font-semibold">{col.label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{colDeals.length}</span>
              </div>
              <div className="space-y-2">
                {colDeals.map((deal) => {
                  const owner = employees.find((e) => e.id === deal.owner_id);
                  return (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => { setDragId(deal.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", deal.id); }}
                      onDragEnd={() => setDragId(null)}
                      style={{ opacity: dragId === deal.id ? 0.4 : 1, cursor: "grab" }}
                      className="flex gap-2 rounded-md border border-border/60 bg-card p-3 shadow-sm transition-all hover:border-primary/40"
                    >
                      <GripVertical className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{deal.client_name}</p>
                        <p className="text-sm font-bold tabular-nums">{formatINR(Number(deal.value))}</p>
                        <div className="mt-2 flex items-center gap-2">
                          {owner && (
                            <Avatar className="h-5 w-5"><AvatarFallback className="text-[9px]">{owner.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback></Avatar>
                          )}
                          {deal.expected_close_date && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <CalendarDays className="h-3 w-3" />{new Date(deal.expected_close_date).toLocaleDateString("en-IN")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {colDeals.length === 0 && <p className="px-1 py-4 text-xs text-muted-foreground">No deals</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New deal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client name</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Deal value</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input type="number" className="pl-7" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as DealStage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected close date</Label>
              <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submitDeal}>Create deal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!convertDeal} onOpenChange={(o) => !o && setConvertDeal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert this deal into a project?</AlertDialogTitle>
            <AlertDialogDescription>
              {convertDeal ? `${convertDeal.client_name} · ${formatINR(Number(convertDeal.value))}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConvertDeal(null)}>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const d = convertDeal;
                setConvertDeal(null);
                if (d) navigate({ to: "/projects/new", search: { client: d.client_name, budget: Number(d.value) } });
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
