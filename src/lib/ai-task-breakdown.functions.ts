import { createServerFn } from "@tanstack/react-start";

export const generateTaskBreakdown = createServerFn({ method: "POST" })
  .inputValidator((data: {
    projectName: string;
    requirementsText: string;
    deadline: string;
    requiredSkills: string[];
    team: { id: string; name: string; skills: string[]; load: number; deliveryScore: number }[];
    existingTasks: { title: string; status: string }[];
  }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are an expert project manager and technical lead. Analyze this project brief and team:

Project: ${data.projectName}
Requirements: ${data.requirementsText}
Deadline: ${data.deadline}
Required Skills: ${data.requiredSkills.join(", ")}
Team: ${JSON.stringify(data.team, null, 2)}
Already created tasks: ${JSON.stringify(data.existingTasks)}

Generate an intelligent task breakdown following these rules:
1. Break work into DAILY tasks if project is under 2 weeks, WEEKLY milestones if 2-8 weeks, BI-WEEKLY sprints if over 8 weeks
2. Each task must have: title, description, estimated_hours, priority, suggested_deadline, required_skill, reasoning
3. Assign each task to the MOST SUITABLE team member based on: skill match (primary), current load (secondary), delivery score (tertiary)
4. Distribute work evenly — no one person should have more than 40% of total tasks
5. Respect the deadline — work backwards from deadline to set task due dates
6. Flag any risks: team member overloaded, skill gap, timeline too tight
7. Suggest if timeline is realistic or needs adjustment

Return ONLY valid JSON (no markdown, no backticks):
{
  "tasks": [{
    "title": "string",
    "description": "string",
    "estimated_hours": 8,
    "priority": "low|medium|high|critical",
    "suggested_deadline": "YYYY-MM-DD",
    "required_skill": "string",
    "assigned_to_id": "string",
    "assigned_to_name": "string",
    "assignment_reason": "string",
    "week_number": 1,
    "day_label": "Week 1 - Day 1"
  }],
  "timeline_assessment": "string",
  "risks": ["string"],
  "recommended_timeline_weeks": 4,
  "workload_distribution": [{"employee_name": "string", "task_count": 5, "total_hours": 40, "load_pct": 50}]
}`;

    const response = await fetch("https://ai.lovable.dev/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a project management AI. Always return valid JSON only, no markdown formatting." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json() as { choices: { message: { content: string } }[] };
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from response, stripping any markdown
    let jsonStr = content;
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    jsonStr = jsonStr.trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", jsonStr.substring(0, 500));
      throw new Error("AI returned invalid JSON. Please try again.");
    }
  });
