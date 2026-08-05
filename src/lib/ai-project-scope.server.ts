export interface ScopeInput {
  projectName: string;
  documentText: string;
  deadline: string;
  currentBudget: number | null;
  team: { id: string; name: string; role: string; department: string; skills: string[]; load: number; delivery_score: number }[];
}

export interface RoleNeed {
  role: string;
  skill: string;
  count: number;
  weekly_rate_inr: number;
  weeks: number;
  reason: string;
  suggested_names: string[];
}

export interface BudgetLine {
  category: string;
  amount_inr: number;
  note: string;
}

export interface ScopeResult {
  summary: string;
  required_skills: string[];
  recommended_team_size: number;
  roles_needed: RoleNeed[];
  estimated_weeks: number;
  budget: {
    total_inr: number;
    lines: BudgetLine[];
    assumptions: string[];
  };
  risks: string[];
}

export function buildProjectScopePrompt(data: ScopeInput): string {
  return `Analyze the project document below and produce a staffing + budget plan.

Project name: ${data.projectName || "(unnamed)"}
Target deadline: ${data.deadline || "not specified"}
Budget already entered (INR): ${data.currentBudget ?? "not specified"}

Available team (with current load %):
${JSON.stringify(data.team, null, 2)}

PROJECT DOCUMENT:
"""
${data.documentText.slice(0, 30000)}
"""

Rules:
1. Extract ALL technical and non-technical skills the project truly requires - do not limit the list, include every distinct skill found or implied.
2. Recommend how many people are required, broken down by role/skill, and name suitable people from the available team (prefer skill match, then lower load, then delivery score).
3. Estimate a realistic timeline in weeks; respect the deadline if given and flag it as a risk if unrealistic.
4. Build an Indian-market budget plan in INR: per-role effort cost (headcount x weekly rate x weeks) plus infrastructure/tooling, QA, contingency (10-15%). Use realistic Indian IT services rates (e.g. developer ~₹45,000-₹70,000/week, senior/lead ~₹80,000-₹1,20,000/week, designer ~₹45,000/week, QA ~₹40,000/week, DevOps ~₹70,000/week).
5. All money values are plain integers in INR (no symbols, no commas).

Return ONLY valid JSON:
{
  "summary": "2-3 sentence scope summary",
  "required_skills": ["string"],
  "recommended_team_size": 5,
  "roles_needed": [{"role":"string","skill":"string","count":1,"weekly_rate_inr":60000,"weeks":6,"reason":"string","suggested_names":["string"]}],
  "estimated_weeks": 8,
  "budget": {
    "total_inr": 1200000,
    "lines": [{"category":"string","amount_inr":100000,"note":"string"}],
    "assumptions": ["string"]
  },
  "risks": ["string"]
}`;
}

export function parseScopeJson(content: string): ScopeResult {
  let jsonStr = content.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) jsonStr = fence[1].trim();
  try {
    return JSON.parse(jsonStr) as ScopeResult;
  } catch {
    console.error("Failed to parse AI scope response:", jsonStr.slice(0, 500));
    throw new Error("AI returned an unreadable response. Please try again.");
  }
}
