// TypeScript types mirroring backend models

export interface Project {
  id: string;
  name: string;
  description: string | null;
  audience: string;
  deck_type: string;
  engagement_type: string | null;
  created_at: string;
  updated_at: string;
  upload_count: number;
  slide_count: number;
  current_stage: number;
}

export interface Upload {
  id: string;
  project_id: string;
  filename: string;
  file_size: number | null;
  content_type: string | null;
  has_extracted_text: boolean;
  created_at: string;
}

export interface Session {
  id: string;
  project_id: string;
  current_stage: number;
  stage_data: Record<string, unknown>;
  created_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  stage: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Slide {
  id: string;
  project_id: string;
  position: number;
  slide_type: string;
  action_title: string;
  content_json: Record<string, unknown>;
  is_appendix: boolean;
  preview_image: string | null;
  created_at: string;
}

export interface Deck {
  id: string;
  project_id: string;
  filename: string;
  validation_score: number | null;
  validation_report: ValidationReport | null;
  generated_at: string;
}

export interface ValidationReport {
  score: number;
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  summary: string;
}

export interface ValidationIssue {
  rule: string;
  message: string;
  slide_index: number | null;
  suggestion?: string;
}

export const STAGE_NAMES: Record<number, string> = {
  0: "Not Started",
  1: "Define Problem",
  2: "MECE Structure",
  3: "Build Storyline",
  4: "Generate Deck",
};

export const AUDIENCE_OPTIONS = [
  { value: "board", label: "Board / C-suite" },
  { value: "client", label: "Client (external)" },
  { value: "working_team", label: "Working Team" },
  { value: "steering", label: "Steering Committee" },
];

export const DECK_TYPE_OPTIONS = [
  { value: "strategic", label: "Strategic Recommendation" },
  { value: "diagnostic", label: "Diagnostic / Problem Analysis" },
  { value: "market_entry", label: "Market Entry Assessment" },
  { value: "due_diligence", label: "Due Diligence" },
  { value: "transformation", label: "Transformation" },
  { value: "progress_update", label: "Progress Update" },
  { value: "implementation", label: "Implementation Plan" },
];

export interface EngagementTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  default_audience: string;
  default_output_formats: string[];
  research_question_count: number;
  slide_range_min: number;
  slide_range_max: number;
}

export interface ResearchState {
  id: string;
  project_id: string;
  research_plan: ResearchPlan;
  research_brief: ResearchBrief;
  sources: ResearchSource[];
  data_gaps: string[];
  status: "pending" | "in_progress" | "complete";
}

export interface ResearchPlan {
  research_plan?: ResearchStep[];
  estimated_searches?: number;
  key_data_gaps?: string[];
}

export interface ResearchStep {
  id: number;
  sub_question: string;
  branch: string;
  search_queries: string[];
  data_type: string;
  priority: "high" | "medium" | "low";
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  quality_score: number;
  quality_tier: "high" | "medium" | "low" | "standard";
  deep_content?: string;
  approved?: boolean;
}

export interface ResearchBrief {
  executive_summary?: string;
  findings_by_branch?: BranchFinding[];
  strongest_evidence?: string[];
  overall_confidence?: "high" | "medium" | "low";
  total_sources_used?: number;
}

export interface BranchFinding {
  branch: string;
  key_findings: { finding: string; source: string; confidence: string }[];
  data_gaps: string[];
}

// ── Deliverables ──

export interface Deliverable {
  id: string;
  project_id?: string;
  format_type: string;
  filepath: string;
  filename: string;
  status?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

// ── Briefing ──

export interface BriefingRun {
  id: string;
  project_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_step: string;
  progress_pct: number;
  steps_completed: string[];
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BriefingResult {
  run: BriefingRun;
  deliverables: Deliverable[];
}

// ── Sharpen (AI-suggestion previews) ──

export type SharpenTarget =
  | "action_title"
  | "chart"
  | "citation"
  | "briefing_field"
  | "slide_full";

export interface SharpenRequest {
  target: SharpenTarget;
  slide_id?: string;
  field?: string;
  options?: Record<string, unknown>;
}

export interface SharpenResponse {
  target: SharpenTarget;
  before: unknown;
  after: unknown;
  rationale: string;
  field?: string | null;
}

/** Citation 'after' shape — matches backend sharpen_citation. */
export interface SharpenCitation {
  title: string;
  url: string;
  snippet: string;
  quality_tier: string;
  quality_score: number;
}

/** Chart 'after' shape — matches backend sharpen_chart. */
export interface SharpenChart {
  chart_type: string;
  categories: (string | number)[];
  series: { name?: string; values?: number[] }[];
  so_what: string;
  source: string;
}

// ── Import-report (deepresearch handoff) ──

export interface InferredMetadata {
  title: string;
  central_question: string;
  desired_decision: string;
  audience: string;
  deck_type: string;
  engagement_template_id: string | null;
  hypothesis: string;
  output_language: string;
  branches: { question: string; evidence: string; so_what: string }[];
}

export interface ImportResult {
  project_id: string;
  session_id: string;
  upload_id: string;
  inferred: InferredMetadata;
  branches_detected_count: number;
  report_word_count: number;
  report_references_count: number;
  created_at: string;
}

export const ENGAGEMENT_TEMPLATES: EngagementTemplate[] = [
  {
    id: "strategic_assessment",
    name: "Strategic Assessment",
    icon: "Compass",
    description: "Evaluate an opportunity or strategic direction",
    default_audience: "board",
    default_output_formats: ["pptx", "pdf"],
    research_question_count: 8,
    slide_range_min: 15,
    slide_range_max: 25,
  },
  {
    id: "commercial_due_diligence",
    name: "Commercial Due Diligence",
    icon: "Search",
    description: "Analyze a target company or investment opportunity",
    default_audience: "client",
    default_output_formats: ["pptx", "pdf"],
    research_question_count: 12,
    slide_range_min: 20,
    slide_range_max: 35,
  },
  {
    id: "performance_improvement",
    name: "Performance Improvement",
    icon: "TrendingUp",
    description: "Diagnose inefficiencies and design improvement plan",
    default_audience: "steering",
    default_output_formats: ["pptx"],
    research_question_count: 10,
    slide_range_min: 15,
    slide_range_max: 30,
  },
  {
    id: "transformation",
    name: "Digital / Org Transformation",
    icon: "Layers",
    description: "Design future state and transformation roadmap",
    default_audience: "board",
    default_output_formats: ["pptx", "pdf"],
    research_question_count: 10,
    slide_range_min: 20,
    slide_range_max: 35,
  },
  {
    id: "market_entry",
    name: "Market Entry / Growth",
    icon: "Rocket",
    description: "Size market, analyze competition, build business case",
    default_audience: "client",
    default_output_formats: ["pptx", "pdf"],
    research_question_count: 10,
    slide_range_min: 18,
    slide_range_max: 30,
  },
];
