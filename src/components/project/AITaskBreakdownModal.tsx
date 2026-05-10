import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Project, Task, Employee, ProjectMember, Leave } from "@/lib/types";
import { computeEmployeeLoad } from "@/lib/types";
import { generateTaskBreakdown } from "@/lib/ai-task-breakdown.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles, Upload, FileText, X, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle, Trash2, Plus, Loader2,
} from "lucide-react";

function LoadingState() {
  const messages = [
    "Analyzing requirements...",
    "Matching skills to tasks...",
    "Optimizing workload distribution...",
    "Finalizing task breakdown...",
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => Math.min(i + 1, messages.length - 1)), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex-1 flex items-center justify-center p-12">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground transition-opacity">{messages[idx]}</p>
      </div>
    </div>
  );
}

interface AITaskBreakdownModalProps {
  project: Project;
  employees: Employee[];
  members: ProjectMember[];
  existingTasks: Task[];
  leaves: Leave[];
  onClose: () => void;
  onTasksCreated: () => void;
}

interface GeneratedTask {
  title: string;
  description: string;
  estimated_hours: number;
  priority: string;
  suggested_deadline: string;
  required_skill: string;
  assigned_to_id: string;
  assigned_to_name: string;
  assignment_reason: string;
  week_number: number;
  day_label: string;
}

interface AIResult {
  tasks: GeneratedTask[];
  timeline_assessment: string;
  risks: string[];
  recommended_timeline_weeks: number;
  workload_distribution: { employee_name: string; task_count: number; total_hours: number; load_pct: number }[];
}

type Step = "input" | "loading" | "review";

export function AITaskBreakdownModal({
  project, employees, members, existingTasks, leaves, onClose, onTasksCreated,
}: AITaskBreakdownModalProps) {
  const { user } = useAuth();
  const generateFn = useServerFn(generateTaskBreakdown);
  const [step, setStep] = useState<Step>("input");
  const [requirementsText, setRequirementsText] = useState(project.brief || "");
  const [deadline, setDeadline] = useState(project.deadline || "");
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [editableTasks, setEditableTasks] = useState<GeneratedTask[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Document upload state
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teamData = useMemo(() => {
    const memberIds = members.map(m => m.employee_id);
    const team = employees.filter(e => memberIds.includes(e.id));
    if (team.length === 0) return employees;
    return team;
  }, [employees, members]);

  // File extraction
  const extractTextFromFile = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractError("");
    setUploadedFileName(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      if (file.name.endsWith(".txt")) {
        const text = await file.text();
        setExtractedText(text);
        setRequirementsText(text);
      } else if (file.name.endsWith(".pdf")) {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "";
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer } as any).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items
            .filter((item: any) => "str" in item)
            .map((item: any) => item.str as string);
          fullText += strings.join(" ") + "\n";
        }
        setExtractedText(fullText);
        setRequirementsText(fullText);
      } else if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
        const mammoth = await import("mammoth");
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        setExtractedText(result.value);
        setRequirementsText(result.value);
      } else {
        setExtractError("Unsupported file type. Please use .pdf, .txt, .docx, or .doc");
        return;
      }

      // Auto-detect deadlines
      autoDetectDeadline(extractedText || requirementsText);
    } catch (err) {
      console.error("Extraction error:", err);
      setExtractError("Could not read file. Try copy-pasting the text instead.");
    } finally {
      setExtracting(false);
    }
  }, []);

  const autoDetectDeadline = (text: string) => {
    const patterns = [
      /(?:deadline|due|deliver|complete|launch|go-live)[:\s]+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /(?:by|before)\s+(\w+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/,
    ];
    for (const p of patterns) {
      const match = text.match(p);
      if (match) {
        try {
          const d = new Date(match[1]);
          if (!isNaN(d.getTime())) {
            setDeadline(d.toISOString().split("T")[0]);
            toast.info(`📅 Deadline detected: ${d.toLocaleDateString()}`);
            return;
          }
        } catch { /* skip */ }
      }
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!requirementsText.trim()) { toast.error("Please enter requirements text"); return; }
    if (!deadline) { toast.error("Please set a deadline"); return; }

    setStep("loading");
    try {
      let textToSend = requirementsText;
      if (textToSend.length > 15000) {
        toast.warning("Large document — AI will analyze the first 15,000 characters");
        textToSend = textToSend.substring(0, 15000);
      }

      const result = await generateFn({
        data: {
          projectName: project.name,
          requirementsText: textToSend,
          deadline,
          requiredSkills: project.required_skills,
          team: teamData.map(e => ({
            id: e.id, name: e.name, skills: e.skills,
            load: computeEmployeeLoad(e.id, existingTasks, leaves),
            deliveryScore: e.delivery_score,
          })),
          existingTasks: existingTasks.map(t => ({ title: t.title, status: t.status })),
        },
      });

      setAiResult(result as AIResult);
      setEditableTasks((result as AIResult).tasks);
      const weeks: Record<number, boolean> = {};
      (result as AIResult).tasks.forEach(t => { weeks[t.week_number] = true; });
      setExpandedWeeks(weeks);
      setStep("review");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      toast.error(msg);
      setStep("input");
    }
  }, [requirementsText, deadline, project, teamData, existingTasks, leaves, generateFn]);

  // Live workload computation from editable tasks
  const liveWorkload = useMemo(() => {
    const map: Record<string, { name: string; tasks: number; hours: number }> = {};
    editableTasks.forEach(t => {
      if (!t.assigned_to_id) return;
      if (!map[t.assigned_to_id]) {
        const emp = employees.find(e => e.id === t.assigned_to_id);
        map[t.assigned_to_id] = { name: emp?.name || t.assigned_to_name, tasks: 0, hours: 0 };
      }
      map[t.assigned_to_id].tasks++;
      map[t.assigned_to_id].hours += t.estimated_hours;
    });
    const totalTasks = editableTasks.length;
    return Object.entries(map).map(([id, d]) => ({
      id, ...d, loadPct: totalTasks > 0 ? Math.round((d.tasks / totalTasks) * 100) : 0,
    }));
  }, [editableTasks, employees]);

  const liveWarnings = useMemo(() => {
    const warnings: string[] = [];
    liveWorkload.forEach(w => {
      if (w.tasks > editableTasks.length * 0.4) {
        warnings.push(`⚠ ${w.name} has ${w.tasks} tasks (${w.loadPct}%) — consider redistributing`);
      }
    });
    const weekCounts: Record<number, number> = {};
    editableTasks.forEach(t => { weekCounts[t.week_number] = (weekCounts[t.week_number] || 0) + 1; });
    Object.entries(weekCounts).forEach(([wk, count]) => {
      if (count > 10) warnings.push(`⚠ Week ${wk} has ${count} tasks — heavy week`);
    });
    return warnings;
  }, [editableTasks, liveWorkload]);

  const handleAcceptAll = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const tasksToInsert = editableTasks.map(t => ({
        title: t.title,
        description: t.description,
        estimated_hours: t.estimated_hours,
        priority: t.priority,
        due_date: t.suggested_deadline,
        assignee_id: t.assigned_to_id || null,
        project_id: project.id,
        user_id: user.id,
        status: "todo" as const,
        story_points: Math.ceil(t.estimated_hours / 8),
      }));

      const { error } = await supabase.from("tasks").insert(tasksToInsert);
      if (error) throw error;

      // Add new project members if needed
      const existingMemberIds = new Set((await supabase.from("project_members").select("employee_id").eq("project_id", project.id)).data?.map(m => m.employee_id) || []);
      const newMemberIds = [...new Set(editableTasks.map(t => t.assigned_to_id).filter(id => id && !existingMemberIds.has(id)))];
      if (newMemberIds.length > 0) {
        await supabase.from("project_members").insert(newMemberIds.map(eid => ({
          project_id: project.id, employee_id: eid, match_score: 80,
        })));
      }

      const assignedNames = [...new Set(editableTasks.map(t => t.assigned_to_name))].join(", ");
      await supabase.from("audit_log").insert({
        action: "ai_tasks_generated", entity_type: "project", entity_id: project.id,
        details: { task_count: editableTasks.length, assigned_to: assignedNames, project_name: project.name },
        user_id: user.id,
      });

      toast.success(`${editableTasks.length} tasks created and assigned`);
      onTasksCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create tasks";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [editableTasks, project, user, onTasksCreated, onClose]);

  const updateTask = (index: number, updates: Partial<GeneratedTask>) => {
    setEditableTasks(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
  };

  const deleteTask = (index: number) => {
    setEditableTasks(prev => prev.filter((_, i) => i !== index));
  };

  const tasksByWeek = useMemo(() => {
    const grouped: Record<number, { tasks: GeneratedTask[]; indices: number[] }> = {};
    editableTasks.forEach((t, i) => {
      if (!grouped[t.week_number]) grouped[t.week_number] = { tasks: [], indices: [] };
      grouped[t.week_number].tasks.push(t);
      grouped[t.week_number].indices.push(i);
    });
    return grouped;
  }, [editableTasks]);

  // Assessment color
  const assessmentColor = aiResult?.timeline_assessment?.toLowerCase().includes("impossible") ? "bg-destructive/20 text-destructive"
    : aiResult?.timeline_assessment?.toLowerCase().includes("tight") ? "bg-warning/20 text-warning"
    : "bg-success/20 text-success";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Task Breakdown Engine</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <Tabs defaultValue="paste">
              <TabsList>
                <TabsTrigger value="paste"><FileText className="h-3.5 w-3.5 mr-1.5" />Paste Requirements</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="h-3.5 w-3.5 mr-1.5" />Upload Document</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Project Requirements</Label>
                  <Textarea
                    value={requirementsText}
                    onChange={e => setRequirementsText(e.target.value)}
                    placeholder="Paste your project requirements, specifications, or brief here..."
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{requirementsText.length.toLocaleString()} characters</p>
                </div>
              </TabsContent>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) extractTextFromFile(f); }}
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop your requirements document here</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports PDF, Word (.docx), or text files</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.docx,.doc"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) extractTextFromFile(f); }}
                  />
                </div>

                {extracting && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Extracting text...
                  </div>
                )}

                {extractError && (
                  <div className="text-sm text-destructive flex items-center gap-2">
                    <X className="h-4 w-4" /> {extractError}
                  </div>
                )}

                {uploadedFileName && extractedText && !extracting && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle className="h-4 w-4" />
                      Text extracted — {extractedText.length.toLocaleString()} characters
                    </div>
                    <p className="text-xs text-muted-foreground">{uploadedFileName}</p>
                    <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground max-h-20 overflow-hidden">
                      {extractedText.substring(0, 300)}{extractedText.length > 300 && `...and ${(extractedText.length - 300).toLocaleString()} more characters`}
                    </div>
                  </div>
                )}

                {requirementsText.length > 50000 && (
                  <div className="flex items-center gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Large document detected. AI will analyze the first 15,000 characters.
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project Deadline</Label>
                <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Team ({teamData.length} members)</Label>
                <div className="flex flex-wrap gap-1">
                  {teamData.slice(0, 6).map(e => (
                    <Badge key={e.id} variant="outline" className="text-xs">{e.name}</Badge>
                  ))}
                  {teamData.length > 6 && <Badge variant="outline" className="text-xs">+{teamData.length - 6}</Badge>}
                </div>
              </div>
            </div>

            {requirementsText.length > 0 && (
              <p className="text-xs text-muted-foreground">Sending {Math.min(requirementsText.length, 15000).toLocaleString()} characters to AI for analysis</p>
            )}

            <Button onClick={handleGenerate} className="w-full gap-2" disabled={!requirementsText.trim() || !deadline}>
              <Brain className="h-4 w-4" /> Analyze & Generate Tasks
            </Button>
          </div>
        )}

        {/* Step 2: Loading */}
        {step === "loading" && <LoadingState />}


        {/* Step 3: Review */}
        {step === "review" && aiResult && (
          <div className="flex-1 flex overflow-hidden">
            {/* Main content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Timeline summary */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">
                    AI generated {editableTasks.length} tasks across {aiResult.recommended_timeline_weeks} weeks
                  </p>
                  <Badge className={assessmentColor}>{aiResult.timeline_assessment}</Badge>
                </div>

                {aiResult.risks.length > 0 && (
                  <div className="space-y-1">
                    {aiResult.risks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-warning rounded-md border border-warning/20 bg-warning/5 p-2">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {risk}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks grouped by week */}
              <div className="space-y-4">
                {Object.entries(tasksByWeek).sort(([a], [b]) => Number(a) - Number(b)).map(([weekNum, { tasks: weekTasks, indices }]) => (
                  <div key={weekNum} className="border border-border/50 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2 px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
                      onClick={() => setExpandedWeeks(prev => ({ ...prev, [Number(weekNum)]: !prev[Number(weekNum)] }))}
                    >
                      {expandedWeeks[Number(weekNum)] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="text-sm font-medium">Week {weekNum}</span>
                      <span className="text-xs text-muted-foreground">{weekTasks.length} tasks</span>
                    </button>

                    {expandedWeeks[Number(weekNum)] && (
                      <div className="p-3 space-y-2">
                        {weekTasks.map((task, localIdx) => {
                          const globalIdx = indices[localIdx];
                          return (
                            <div key={globalIdx} className="rounded-md border border-border/50 p-3 space-y-2 bg-card">
                              <div className="flex items-start gap-2">
                                <Input
                                  value={task.title}
                                  onChange={e => updateTask(globalIdx, { title: e.target.value })}
                                  className="text-sm font-medium h-8 flex-1"
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => deleteTask(globalIdx)}>
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <Select value={task.assigned_to_id} onValueChange={v => {
                                  const emp = employees.find(e => e.id === v);
                                  updateTask(globalIdx, { assigned_to_id: v, assigned_to_name: emp?.name || "" });
                                }}>
                                  <SelectTrigger className="h-7 text-xs w-[160px]">
                                    <SelectValue placeholder="Assign..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {employees.map(emp => (
                                      <SelectItem key={emp.id} value={emp.id}>
                                        <div className="flex items-center gap-1">
                                          <span className="text-xs">{emp.name}</span>
                                          <Badge variant="outline" className="text-[8px] ml-1">{computeEmployeeLoad(emp.id, existingTasks, leaves)}%</Badge>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Input
                                  type="date"
                                  value={task.suggested_deadline}
                                  onChange={e => updateTask(globalIdx, { suggested_deadline: e.target.value })}
                                  className="h-7 text-xs w-[140px]"
                                />

                                <Input
                                  type="number"
                                  value={task.estimated_hours}
                                  onChange={e => updateTask(globalIdx, { estimated_hours: parseFloat(e.target.value) || 8 })}
                                  className="h-7 text-xs w-[70px]"
                                  title="Hours"
                                />

                                <Select value={task.priority} onValueChange={v => updateTask(globalIdx, { priority: v })}>
                                  <SelectTrigger className="h-7 text-xs w-[100px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {task.assignment_reason && (
                                <p className="text-[10px] text-muted-foreground italic">{task.assignment_reason}</p>
                              )}
                            </div>
                          );
                        })}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => {
                            setEditableTasks(prev => [...prev, {
                              title: "New Task", description: "", estimated_hours: 8,
                              priority: "medium", suggested_deadline: deadline,
                              required_skill: "", assigned_to_id: "", assigned_to_name: "",
                              assignment_reason: "", week_number: Number(weekNum), day_label: `Week ${weekNum}`,
                            }]);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add task to Week {weekNum}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right side panel - Live Impact */}
            <div className="w-[300px] border-l border-border overflow-y-auto p-4 space-y-5 bg-secondary/10">
              <h3 className="text-sm font-semibold">Live Impact Analysis</h3>

              {/* Workload Distribution */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Workload Distribution</p>
                {liveWorkload.map(w => (
                  <div key={w.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[7px]">{w.name.split(" ").map(n => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{w.name}</span>
                      <span className={`font-mono ${w.loadPct > 40 ? "text-destructive" : w.loadPct > 30 ? "text-warning" : "text-success"}`}>{w.loadPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all ${w.loadPct > 40 ? "bg-destructive" : w.loadPct > 30 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(100, w.loadPct * 2.5)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{w.tasks} tasks, {w.hours}h</p>
                  </div>
                ))}
              </div>

              {/* Timeline Health */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Timeline Health</p>
                <p className="text-lg font-bold">{editableTasks.length} tasks</p>
                <p className="text-xs text-muted-foreground">{aiResult.recommended_timeline_weeks} weeks</p>
              </div>

              {/* Warnings */}
              {liveWarnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Warnings</p>
                  {liveWarnings.map((w, i) => (
                    <div key={i} className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded p-2">{w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        {step === "review" && (
          <div className="border-t border-border px-6 py-4 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep("input")}>← Regenerate</Button>
            <Button onClick={handleAcceptAll} disabled={saving || editableTasks.length === 0} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Accept All & Create {editableTasks.length} Tasks
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
