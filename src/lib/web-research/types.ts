export type WebAvailability =
  | "candidate"
  | "complete"
  | "partial"
  | "restricted"
  | "denied"
  | "unavailable";

export type WebFailure = {
  code: string;
  message: string;
};

export type WebSourceReceipt = {
  http_status?: number;
  content_type?: string;
  bytes?: number;
  redirects?: number;
  http_requests?: number;
  provider_model?: string;
  provider_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_usd?: number;
  web_search_requests?: number;
  web_search_proof?: "usage" | "citations_and_request_bound" | "direct_exa_response";
  request_id?: string;
  resolved_search_type?: string;
  search_time_ms?: number;
  attempts?: number;
};

export type WebSourceRecord = {
  source_id: string;
  source_kind: "search_candidate" | "retrieved_page";
  availability: WebAvailability;
  url: string;
  requested_url?: string;
  final_url?: string;
  canonical_url?: string;
  title: string | null;
  byline?: string | null;
  published_at?: string | null;
  excerpt: string | null;
  text?: string;
  retrieved_at: string;
  trust: "untrusted_external_content";
  evidence_usable: boolean;
  receipt: WebSourceReceipt;
  failure?: WebFailure;
};

export type WebSearchInput = {
  query: string;
  limit?: number;
};

export type WebSearchStatus = "complete" | "limited" | "no_match" | "unavailable" | "failed";

export type WebSearchResult = {
  status: WebSearchStatus;
  query: string;
  sources: WebSourceRecord[];
  retrieved_at: string;
  receipt: WebSourceReceipt;
  failure?: WebFailure;
};

export type ReadUrlInput = { url: string };
