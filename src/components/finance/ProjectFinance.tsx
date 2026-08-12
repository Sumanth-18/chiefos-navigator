import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EXPENSE_CATEGORIES, formatINR, toneClass, varianceTone, type Expense } from '@/lib/finance';

function StatCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}

export function ProjectFinance({ projectId, budget, userId }: { projectId: string; budget: number | null; userId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '',
    category: 'Salaries',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false });
    setExpenses((data as Expense[]) || []);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const actual = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const budgeted = Number(budget || 0);
  const variance = budgeted - actual;
  const variancePct = budgeted > 0 ? Math.round((variance / budgeted) * 100) : 0;
  const tone = varianceTone(budgeted, actual);

  const submit = async () => {
    if (!form.description.trim() || !form.amount) {
      toast.error('Description and amount are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      project_id: projectId,
      user_id: userId,
      description: form.description.trim(),
      category: form.category,
      amount: parseFloat(form.amount),
      date: form.date,
    });
    setSaving(false);
    if (error) {
      toast.error('Could not add expense');
      return;
    }
    setOpen(false);
    setForm({ description: '', category: 'Salaries', amount: '', date: new Date().toISOString().slice(0, 10) });
    toast.success('Expense added');
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id);
    load();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Finance</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Budgeted cost" value={formatINR(budgeted)} />
        <StatCard label="Actual cost" value={formatINR(actual)} />
        <StatCard
          label="Variance"
          value={`${variance < 0 ? '-' : ''}${formatINR(Math.abs(variance))} · ${variancePct}%`}
          valueClass={toneClass[tone]}
        />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Expenses</h3>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No expenses logged yet</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium">{e.description}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatINR(Number(e.amount))}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(e.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e.id)} className="text-muted-foreground transition-colors hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input type="number" className="pl-7" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>Add expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
