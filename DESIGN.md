# Nonsense Research Desk design system

## Design read

Reading this as a redesign of a connected research agent for two equal podcast partners, with a calm studio-workbench product language, leaning toward Glox Brain Lab's single reading workspace and Vercel's precise neutral system.

- Design variance: **4/10**. Familiar product structure with one distinctive inline research tape.
- Motion intensity: **2/10**. Motion communicates running, completion, and panel state only.
- Visual density: **5/10**. Compact enough for real research, with readable long-form output.

## Physical scene

CJ or Jeff is at a laptop before recording, asking follow-up questions and scanning evidence under real production pressure. The room may be dim, but the job is sustained reading and editing, so the interface uses a high-contrast light canvas instead of decorative dark-tool chrome.

## Tokens

- Canvas: `#f7f7f8`
- Surface: `#ffffff`
- Ink: `#171717`
- Muted ink: `#66666f`
- Line: `#e5e5e8`
- Action blue: `#315cff`
- Success: `#21875a`
- Danger: `#a3544c`
- Primary type: Geist Sans, weights 400/500/600
- Utility type: Geist Mono for source IDs, costs, and technical metadata
- Radius: 6px controls, 8px functional panels, full circle only for semantic status/icons

## Layout

```text
┌──────────────── one compact product header ────────────────┐
│ Nonsense Research         title/status/cost        new/stop │
├─────────────────────────────────────────────────────────────┤
│ user request                                                │
│   observable work for that run                              │
│   concise cited answer or requested inline prep brief       │
│ next user request                                           │
│   its own work and answer                                   │
│                                                             │
│                     sticky composer                         │
└─────────────────────────────────────────────────────────────┘
              source detail opens as drawer; packet can Focus
```

There is no permanent session rail and no permanent activity rail. Agent activity is progressive disclosure inside the same workspace. Sources are contextual detail, not navigation.

## Signature

The chronological exchange is the product's signature. Each prompt owns a few expandable observable-work lines followed by a natural cited answer. Only the active line receives a restrained left-to-right text highlight. A requested validated brief reads like a first-class assistant response, while Focus remains optional. The interface shows actions and results without turning hidden reasoning into theater.

## Preserve

- real chat and follow-ups;
- visible tool calls, stop, status, source access, cost/request receipt;
- a separate Deep research composer control;
- claim-level readable citations and original links;
- optional priority-ranked brief and copy-to-Markdown;
- near-bottom auto-follow, user-scroll pause, and Jump to latest;
- honest empty, running, partial, unavailable, stopped, and failed states;
- responsive and keyboard behavior.

## Retire

- two permanent side rails;
- decorative dark terminal styling;
- tiny uppercase labels as universal scaffolding;
- oversized empty-state headline;
- nested panels and card grids;
- permanent execution-mode badges or invented history.
