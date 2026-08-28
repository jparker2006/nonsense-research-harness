---
status: accepted
---

# Use one continuous agent for every research mode

Standard Research, Deep Research, and explicitly requested Preparation Briefs will use one agent, one model, one continuing tool-call context, and one small stable tool catalog. The artifact tool remains available to that agent on every turn; the agent interprets the user's request and decides whether to use it instead of a regex router enabling a separate path. Research Depth changes the autonomy budget, and a requested Working Artifact changes the requested work product; neither creates a manager, worker graph, critic, composer, fallback model, or forced clean-context synthesis phase. This deliberately trades specialized orchestration for state continuity, comprehensibility, lower latency, and the canonical model-tool-result loop used by maintained agent harnesses.
