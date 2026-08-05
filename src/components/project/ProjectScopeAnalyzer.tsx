import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeProjectScope } from "@/lib/ai-project-scope.functions";
import type { ScopeResult } from "@/lib/ai-project-scope.server";
import { extractTextFromFile } from "@/lib/document-extract";
import type { Employee, Task, Leave } from "@/lib/types";
import { computeEmployeeLoad } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Sparkles, X, Plus, IndianRupee, Users, AlertTriangle } from "lucide-react";

export interface ScopeApplyPayload {
  skills: string[];
  budget: number;
  weeks: number;
  teamSize: number;
  summary: string;
}

interface Props {
  projectName: string;
  deadline: string;
  currentBudget: number | null;
  initialText?: string;
  employees: Employee[];
  allTasks: Task[];
  leaves: Leave[];
  applyLabel?: string;
  onApply: (payload: ScopeApplyPayload) => void;
}

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n || 0))}`;

export function ProjectScopeAnalyzer({
  projectName, deadline, currentBudget, initialText = "",
  employees, allTasks, leaves, applyLabel = "Apply to project", onApply,
}: Props) {
  const analyzeFn = useServerFn(analyzeProjectScope);
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [text, setText] = useState(initialText);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ScopeResult | null>(null);

  // Editable outputs
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [teamSize, setTeamSize] = useState(0);
  const [weeks, setWeeks] = useState(0);
  const [budget, setBudget] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    setExtracting(true);
    setFileName(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    try {
      const extracted = await extractTextFromFile(file);
      if (!extracted) throw new Error("No readable text found in the document.");
      setText(extracted);
      toast.success("Document read successfully");
    } catch (err) {
      setFileName("");
      toast.error(err instanceof Error ? err.message : "Could not read document");
    } finally {
      setExtracting(false);
    }
  }, []);

  const runAnalysis = async () => {
    if (!text.trim()) { toast.error("Upload a document or paste the project requirements first"); return; }
    setAnalyzing(true);
    try {
      const team = employees.map((e) => ({
        id: e.id, name: e.name, role: e.role, department: e.department,
        skills: e.skills || [],
        load: computeEmployeeLoad(e.id, allTasks, leaves),
        delivery_score: e.delivery_score,
      }));
      const res = await analyzeFn({
        data: { projectName, documentText: text, deadline, currentBudget, team },
      }) as ScopeResult;
      setResult(res);
      setSkills(res.required_skills || []);
      setTeamSize(res.recommended_team_size || (res.roles_needed || []).reduce((s, r) => s + (r.count || 0), 0));
      setWeeks(res.estimated_weeks || 0);
      setBudget(res.budget?.total_inr || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="rounded-xl border border-dashed border-border p-4">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={extracting}>
            {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload document
          </Button>
          <span className="text-xs text-muted-foreground">
            {fileName ? <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{fileName}</span> : "PDF, DOCX, TXT or MD"}
          </span>
        </div>
        <Textarea
          className="mt-3"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste the project requirements here"
        />
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={runAnalysis} disabled={analyzing || extracting} className="bg-indigo-600 hover:bg-indigo-500 text-white">
            {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing scope, team & budget…</> : <><Sparkles className="mr-2 h-4 w-4" />Analyze with AI</>}
          </Button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{result.summary}</p>

          {/* Skills */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <Label>Required skills ({skills.length}) — add or remove freely</Label>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <Badge key={s} variant="outline" className="gap-1">
                  {s}
                  <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {skills.length === 0 && <span className="text-xs text-muted-foreground">No skills yet</span>}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = newSkill.trim();
                    if (v && !skills.includes(v)) setSkills([...skills, v]);
                    setNewSkill("");
                  }
                }}
                placeholder="Add a skill and press Enter"
              />
              <Button type="button" variant="outline" onClick={() => {
                const v = newSkill.trim();
                if (v && !skills.includes(v)) setSkills([...skills, v]);
                setNewSkill("");
              }}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* People needed */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <Label className="flex-1">People required</Label>
              <Input type="number" min={0} value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="w-20 h-8" />
            </div>
            <div className="space-y-2">
              {(result.roles_needed || []).map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.count}× {r.role}</span>
                    <Badge variant="outline" className="text-[10px]">{r.skill}</Badge>
                    <span className="ml-auto text-muted-foreground">{inr(r.weekly_rate_inr)}/wk · {r.weeks} wks</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{r.reason}</p>
                  {r.suggested_names?.length > 0 && (
                    <p className="mt-1 text-primary">Suggested: {r.suggested_names.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="flex-1 text-xs text-muted-foreground">Estimated timeline (weeks)</Label>
              <Input type="number" min={0} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-20 h-8" />
            </div>
          </div>

          {/* Budget */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-success" />
              <Label className="flex-1">Budget plan</Label>
              <Input type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-40 h-8" />
            </div>
            <div className="space-y-1">
              {(result.budget?.lines || []).map((l, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="flex-1">{l.category} <span className="text-muted-foreground">— {l.note}</span></span>
                  <span className="tabular-nums font-medium">{inr(l.amount_inr)}</span>
                </div>
              ))}
            </div>
            {(result.budget?.assumptions || []).length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {result.budget.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            )}
            {currentBudget != null && budget > 0 && (
              <p className={`text-xs ${budget > currentBudget ? "text-warning" : "text-success"}`}>
                Entered budget {inr(currentBudget)} · AI plan {inr(budget)} ({budget > currentBudget ? "shortfall" : "surplus"} {inr(Math.abs(budget - currentBudget))})
              </p>
            )}
          </div>

          {(result.risks || []).length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" /> Risks
              </div>
              <ul className="space-y-1 text-xs">
                {result.risks.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={() => onApply({ skills, budget, weeks, teamSize, summary: result.summary })}>
              {applyLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
