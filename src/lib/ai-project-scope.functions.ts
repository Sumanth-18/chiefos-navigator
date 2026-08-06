import { createServerFn } from "@tanstack/react-start";
import { buildProjectScopePrompt, parseScopeJson } from "./ai-project-scope.server";

export const analyzeProjectScope = createServerFn({ method: "POST" })
  .inputValidator((data: {
    projectName: string;
    documentText: string;
    deadline: string;
    currentBudget: number | null;
    team: { id: string; name: string; role: string; department: string; skills: string[]; load: number; delivery_score: number }[];
  }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a delivery planning AI for an Indian IT services company. Always return valid JSON only, no markdown." },
          { role: "user", content: buildProjectScopePrompt(data) },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
      if (response.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
      console.error("AI scope error:", response.status, errText);
      throw new Error("AI analysis failed. Please try again.");
    }

    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    return parseScopeJson(result.choices?.[0]?.message?.content ?? "");
  });
