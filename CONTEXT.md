# Nonsense Research

This context defines the language for a podcast-specific research product serving equal partners CJ Little and Jeff Parker. It distinguishes research assistance from the editorial deliberation and host voice that remain human.

## Language

**Nonsense Research Agent**:
A rigorous, conversational research partner for CJ Little and Jeff Parker, cohosts of the Nonsense podcast. It finds the Central Story, investigates it with tools, and explains it naturally with exact citations. It is not a general-purpose assistant or a substitute for either host.
_Avoid_: General AI, Claude replacement, show writer

**Research Depth**:
The autonomy budget applied to the same Nonsense Research Agent. Standard and Deep Research differ in how long and broadly the agent may investigate, not in agent identity, tools, or architecture.
_Avoid_: Separate agent, manager-worker mode

**Baseline Assistant**:
A general-purpose frontier chat product used as the minimum reference for answer quality and agent behavior. Matching it is an admission requirement, not the Nonsense Research Agent's differentiator.
_Avoid_: Competitor product, product identity

**Research Answer**:
A concise, natural explanation that leads with its conclusion, identifies the Central Story, and uses current web evidence plus relevant Past Nonsense Coverage. Every material factual claim must resolve to inspected evidence, uncertainty must remain explicit, and a Preparation Brief appears only when the user requests one.
_Avoid_: Packet, script

**Topic Research Workspace**:
The continuing body of work for a topic, containing the best current explanation, trusted sources, unresolved questions, and relevant Past Nonsense Coverage. It can begin from a topic, headline, article, claim, or rough notes and evolve through follow-up conversation.
_Avoid_: Chat response, Drive document

**Episode Research Space**:
The shared collection of selected Topic Research Workspaces CJ and Jeff use while preparing one episode. It preserves useful topic work without deciding the final angle, order, cuts, or airtime.
_Avoid_: Episode builder, finished show

**Central Story**:
The most consequential supported explanation of what happened, why it matters, and what remains uncertain or disputed.
_Avoid_: Topic summary, source dump

**Past Nonsense Coverage**:
Relevant discussion in the published Nonsense transcript archive, represented with exact episode and passage provenance without invented speaker attribution.
_Avoid_: Memory, host opinion

**Trusted Source**:
A source whose relevant content was retrieved with usable provenance and can support the specific claim attached to it. A search-result title or inaccessible page is not a Trusted Source.
_Avoid_: Search candidate, citation decoration

**Evidence Gate**:
A deterministic source-integrity boundary that permits citations only to retrieved Trusted Sources, resolves citation numbers to their real provenance, and verifies direct quotations against retrieved text. It does not judge whether a source semantically proves the agent's interpretation.
_Avoid_: Fact checker, semantic validator, research judge

**Cited Claim**:
A material factual statement linked to the exact Trusted Source or Past Nonsense Coverage that supports it.
_Avoid_: Unverified assertion, source list

**Research Thread**:
A durable conversation through which CJ and Jeff continue one Topic Research Workspace across follow-up turns and application restarts. It preserves the dialogue and links to the workspace without becoming cross-topic memory or a personal profile.
_Avoid_: Chat history, memory, knowledge base

**Preparation Brief**:
A user-requested organization of research, arguments, priorities, questions, or an outline for editorial use. It is not dialogue, a joke, or a finished script intended to be read on air.
_Avoid_: Prep packet, episode script

**Working Artifact**:
A user-editable Preparation Brief, outline, or other requested work product shown separately from the primary chat conversation. The agent may revise the same artifact through chat without silently discarding manual edits.
_Avoid_: Chat answer, finished script

**Nonsense Knowledge Base**:
The behind-the-scenes shared record of Trusted Sources, Cited Claims, corrections, unresolved questions, Past Nonsense Coverage, and prior Topic Research Workspaces. It is not a user-facing wiki or hidden model profile.
_Avoid_: Chat history, host profile

**Research Action**:
An autonomous read-only operation that gathers, opens, compares, verifies, or cross-references evidence for a Topic Research Workspace.
_Avoid_: Agent step, editorial action

**Tool Outcome**:
The honest result of one Research Action: `complete` when usable evidence was returned, `limited` when usable evidence has a material constraint, `no_match` when the tool worked but found nothing, `unavailable` when an external dependency could not be reached, or `failed` when the harness contract or implementation broke. A later limit or optional-ranking failure cannot relabel earlier usable evidence as unavailable.
_Avoid_: Worst-event status, generic partial, hidden fallback

**Workspace Action**:
A user-requested change that saves, organizes, combines, or revises material inside a Topic Research Workspace or Episode Research Space. It does not publish externally or make a final editorial decision.
_Avoid_: Research action, publishing action

**Topic Watch**:
Continuing research on a user-selected developing story so an Episode Research Space can be refreshed with meaningful changes near recording time.
_Avoid_: Cron job, automatic topic selection

**Editorial Deliberation**:
CJ and Jeff's human work of choosing stories, judging significance, debating angles, prioritizing material, and deciding what deserves airtime.
_Avoid_: Agent workflow, automated selection
