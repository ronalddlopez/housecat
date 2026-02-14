# Phase 1.5: UI Reorganization — Detailed Plan

**Goal:** Transform the single-page health dashboard into a professional developer-tool layout (CodeRabbit/Greptile style) with sidebar navigation and multiple pages. Set up the page structure so Phases 2-7 have pages to land on.

**Time Budget:** 30-45 minutes
**Where:** Replit

---

## Current State

Everything lives on a single Dashboard page (`client/src/pages/dashboard.tsx`):
- Service health cards (Redis, QStash, TinyFish, Anthropic)
- Sanity check buttons (TinyFish, Claude, QStash)
- Run Test form with results display
- No navigation — single scrolling page

This looks like a setup wizard, not a product.

---

## Target State

A 4-page app with sidebar navigation that looks like a professional DevTool:

```
┌────────────┬──────────────────────────────────────┐
│  Sidebar   │  Content Area                        │
│            │                                      │
│  🐱 HouseCat│                                      │
│            │  (page content renders here)         │
│  Dashboard │                                      │
│  Tests     │                                      │
│  Run Test  │                                      │
│  Settings  │                                      │
│            │                                      │
│            │                                      │
│            │                            ☀️/🌙     │
└────────────┴──────────────────────────────────────┘
```

---

## Page Breakdown

### Page 1: Dashboard (`/`)

The landing page. Shows high-level metrics and recent activity.

```
Dashboard
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 12 Total │ │ 10 Pass  │ │ 2 Fail   │
│  Tests   │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘

Recent Test Runs
┌─────────────────────────────────────────┐
│ ✅ Login Flow       12.4s    2 min ago  │
│ ❌ Checkout Flow    45.2s    5 min ago  │
│ ✅ Homepage Check    8.1s   15 min ago  │
└─────────────────────────────────────────┘
```

**For now (pre-Phase 2):** Show placeholder metric cards (0 tests, 0 passing, 0 failing) and an empty state message: "No tests yet. Create your first test or run a quick test." with links to the Tests and Run Test pages.

**Phase 2+ fills this in** with real data from Redis.

### Page 2: Tests (`/tests`)

Test suite management. Where CRUD lives.

```
Tests                              [+ New Test]
┌──────────────────────────────────────────────┐
│ Name           URL             Schedule Status│
│──────────────────────────────────────────────│
│ Login Flow     myapp.com/login  15 min   ✅  │
│ Checkout Flow  myapp.com/cart   30 min   ❌  │
└──────────────────────────────────────────────┘
```

**For now (pre-Phase 2):** Empty state with message: "No test suites created yet. Run a quick test to try the pipeline, or create your first test suite." with a link to Run Test page and a disabled "+ New Test" button.

**Phase 2 builds this out** with create/edit/delete forms and the test list table.

### Page 3: Run Test (`/run`)

The existing RunTestSection moved here as a standalone page. This is the Phase 1 demo page.

```
Run Test

Run the AI-powered Planner → Browser → Evaluator
pipeline against any URL.

┌──────────────────────────────────────────┐
│ URL:  [https://example.com             ] │
│                                          │
│ Goal: [Verify the page loads and has a ] │
│       [heading that says Example Domain] │
│                                          │
│ [🧪 Run Test]                            │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ ✅ PASSED                        12.4s   │
│                                          │
│ Evaluator: The page loaded successfully  │
│ and the heading was verified.            │
│                                          │
│ Steps:                                   │
│  ✅ Step 1: Navigate to example.com      │
│  ✅ Step 2: Verify heading is visible    │
│  ✅ Step 3: Confirm heading text matches │
│                                          │
│ ▸ Show Plan (3 steps)                    │
└──────────────────────────────────────────┘
```

**This already works** — just move the `RunTestSection` component from `dashboard.tsx` to its own page. No changes to functionality.

### Page 4: Settings (`/settings`)

Service health and sanity checks moved here. The admin/diagnostics area.

```
Settings

Service Health
┌──────────────────────────────────────────┐
│  ✅ Upstash Redis        Connected       │
│  ✅ QStash               Connected       │
│  ✅ TinyFish             Key Set         │
│  ✅ Anthropic Claude     Key Set         │
│                                          │
│  Public URL: https://housecat.replit.app │
└──────────────────────────────────────────┘

Sanity Checks
┌──────────────────────────────────────────┐
│ [▶ TinyFish]  [▶ Claude]  [▶ QStash]    │
│                                          │
│ (results appear inline after running)    │
└──────────────────────────────────────────┘
```

**This already works** — move the health cards, sanity checks, and public URL display from `dashboard.tsx` to the settings page.

---

## File Structure Changes

### New files to create:

```
client/src/
├── components/
│   └── layout/
│       ├── sidebar.tsx          ← Sidebar navigation component
│       └── app-layout.tsx       ← Layout wrapper (sidebar + content area)
├── pages/
│   ├── dashboard.tsx            ← REWRITE: metrics + recent runs (placeholder)
│   ├── tests.tsx                ← NEW: test suite list (placeholder)
│   ├── run-test.tsx             ← NEW: RunTestSection moved here
│   ├── settings.tsx             ← NEW: health checks + sanity checks moved here
│   └── not-found.tsx            ← existing, no changes
└── App.tsx                      ← UPDATE: add routes + layout wrapper
```

### What moves where:

| Component | From | To |
|-----------|------|----|
| `RunTestSection` | `dashboard.tsx` | `run-test.tsx` |
| `ServiceCard` + `serviceConfig` | `dashboard.tsx` | `settings.tsx` |
| `SanityCheckCard` + all 3 sanity checks | `dashboard.tsx` | `settings.tsx` |
| `StatusIcon` + `StatusBadge` | `dashboard.tsx` | `components/ui/status.tsx` (shared) |
| Health query + public URL card | `dashboard.tsx` | `settings.tsx` |

---

## Sidebar Component Design

```tsx
// sidebar.tsx - Minimal developer-tool sidebar

Sidebar items:
- Dashboard    icon: LayoutDashboard   path: /
- Tests        icon: FlaskConical      path: /tests
- Run Test     icon: Play              path: /run
- Settings     icon: Settings          path: /settings

Visual design:
- Fixed width: 240px (collapsible to 60px icons-only on mobile)
- Dark background (slate-900 in dark mode, white with border in light mode)
- Logo + app name at top: 🐱 HouseCat
- Active item: highlighted background + accent color
- Hover: subtle background change
- Bottom: theme toggle (☀️/🌙)
```

### Layout Wrapper

```tsx
// app-layout.tsx

<div className="flex h-screen">
  <Sidebar />
  <main className="flex-1 overflow-y-auto">
    <div className="max-w-5xl mx-auto px-6 py-8">
      {children}  ← page content renders here
    </div>
  </main>
</div>
```

---

## Router Updates

```tsx
// App.tsx

<AppLayout>
  <Switch>
    <Route path="/" component={Dashboard} />
    <Route path="/tests" component={Tests} />
    <Route path="/run" component={RunTest} />
    <Route path="/settings" component={Settings} />
    <Route component={NotFound} />
  </Switch>
</AppLayout>
```

Uses wouter (already installed) — no new dependencies needed.

---

## Visual Style Guide

Match CodeRabbit/Greptile aesthetic:

- **Sidebar:** Clean, minimal, icon + label. No nested menus.
- **Content area:** Max-width container, generous padding, card-based sections
- **Cards:** Subtle borders, rounded corners, no heavy shadows
- **Typography:** Bold section headings, muted descriptions, monospace for data/URLs
- **Colors:** Emerald for success, red for failure, amber for warnings, blue for info. Same palette as current.
- **Spacing:** Generous — don't crowd elements. Whitespace is a feature.
- **Dark mode:** Full support (already works, just maintain it)

### What NOT to change:
- Don't redesign the existing components (ServiceCard, SanityCheckCard, RunTestSection)
- Don't change the color palette
- Don't add animations or transitions beyond what exists
- Don't install new UI libraries — use existing shadcn/ui components

---

## Implementation Order

| Order | Task | Time |
|-------|------|------|
| 1 | Create `sidebar.tsx` and `app-layout.tsx` | 10 min |
| 2 | Create `settings.tsx` — move health + sanity checks here | 5 min |
| 3 | Create `run-test.tsx` — move RunTestSection here | 5 min |
| 4 | Create `tests.tsx` — empty state placeholder | 5 min |
| 5 | Rewrite `dashboard.tsx` — placeholder metrics + empty state | 5 min |
| 6 | Update `App.tsx` — add routes + layout wrapper | 5 min |
| 7 | Extract shared components (`StatusIcon`, `StatusBadge`) if needed | 5 min |

**Total: ~40 minutes**

---

## Exit Criteria

- [ ] Sidebar navigation visible on all pages with 4 items (Dashboard, Tests, Run Test, Settings)
- [ ] Active page highlighted in sidebar
- [ ] Dashboard page shows placeholder metrics and empty state
- [ ] Tests page shows empty state with link to Run Test
- [ ] Run Test page has the URL/goal form and displays results (existing functionality preserved)
- [ ] Settings page shows service health cards and sanity check buttons (existing functionality preserved)
- [ ] Dark/light mode toggle works on all pages
- [ ] No new npm dependencies added
- [ ] All existing functionality still works (health check, sanity tests, run test pipeline)
- [ ] Mobile responsive (sidebar collapses or becomes hamburger menu)

---

## What This Enables

After Phase 1.5, the remaining phases slot cleanly into existing pages:

| Phase | Where it lands |
|-------|---------------|
| Phase 2: Test Suite CRUD | Tests page — replace empty state with table + create form |
| Phase 3: QStash Callbacks + Results | Backend only — results feed into Dashboard + Tests pages |
| Phase 4: Results & Metrics API | Dashboard page — replace placeholders with real metrics |
| Phase 5: Frontend Polish | Tests detail page, charts, result history |
| Phase 6: Live Execution View | New sub-page under Run Test or Tests detail |
| Phase 7: Demo Prep | Polish everything that's already in place |
