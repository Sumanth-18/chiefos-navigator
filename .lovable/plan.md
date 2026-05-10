## Context

The full AI Task Breakdown modal is already built and wired to Lovable AI server-side (no extra key needed) — input tabs (paste/upload with PDF + DOCX extraction), rotating loading messages, weekly grouped review with editable assignees/dates, live workload bars, risk warnings, timeline pill, and "Accept All & Create" insert into the tasks table.

The actual problem reported ("button not visible") is a styling issue in `src/routes/_app.projects.$projectId.tsx`. The current button uses the default `<Button size="sm">` with a `Brain` icon — it blends into the dark background. A few small UX gaps remain (Escape-to-close, prominent indigo styling, Sparkles icon).

## Changes

### 1. Make the AI button prominent — `src/routes/_app.projects.$projectId.tsx`

Replace the existing `Button` in the right-panel "Tasks" header with a high-contrast indigo CTA using the `Sparkles` icon, kept in the same flex row as the "Tasks" heading so it's visible the moment the page loads (no scroll, no tab).

```tsx
<button
  onClick={() => setShowAIBreakdown(true)}
  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md shadow-indigo-600/30 transition-all"
>
  <Sparkles className="h-4 w-4" />
  AI Task Breakdown
</button>
```

Swap the `Brain` import for `Sparkles` from lucide-react.

### 2. Modal polish — `src/components/project/AITaskBreakdownModal.tsx`

Small additions only (the modal already has overlay, close X, scroll, max-width container, tabs, deadline picker, char counter, drag-drop, PDF/DOCX/TXT extraction, loading rotator, results with weekly groups + workload bars + risks + timeline pill, and "Accept All & Create N Tasks").

- Add Escape-to-close: `useEffect` listening for `keydown` "Escape" → `onClose()`.
- Update title row to "✨ AI Task Breakdown Engine" with subtitle "Paste requirements or upload a document".
- Bump max width container from `max-w-6xl` to a tighter `max-w-[900px]` per spec.
- Swap the in-modal `Brain` icons for `Sparkles` for visual consistency with the new trigger button.

No backend, schema, or AI prompt changes — the existing server function already sends the requested prompt structure to Lovable AI and returns the same JSON shape (tasks/timeline_assessment/risks/workload_distribution).

## Out of scope

- The existing "Live Impact Analysis" right side panel inside the review step is richer than the spec; keeping it.
- Workload distribution + risks + weekly grouping are already implemented exactly as described.
