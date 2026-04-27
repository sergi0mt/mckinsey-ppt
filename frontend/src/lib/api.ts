// API client for the FastAPI backend

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// ── Projects ──
export const api = {
  projects: {
    list: () => request<import("./types").Project[]>("/projects"),
    get: (id: string) => request<import("./types").Project>(`/projects/${id}`),
    create: (data: { name: string; description?: string; audience?: string; deck_type?: string; engagement_type?: string }) =>
      request<import("./types").Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, string>) =>
      request<import("./types").Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => fetch(`${BASE_URL}/projects/${id}`, { method: "DELETE" }),
  },

  uploads: {
    list: (projectId: string) => request<import("./types").Upload[]>(`/projects/${projectId}/uploads`),
    upload: async (projectId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE_URL}/projects/${projectId}/uploads`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<import("./types").Upload>;
    },
    getContent: (uploadId: string) =>
      request<{ filename: string; text: string; has_text: boolean }>(`/uploads/${uploadId}/content`),
    delete: (uploadId: string) => fetch(`${BASE_URL}/uploads/${uploadId}`, { method: "DELETE" }),
  },

  sessions: {
    getOrCreate: (projectId: string) =>
      request<import("./types").Session>(`/projects/${projectId}/session`),
    getMessages: (sessionId: string) =>
      request<import("./types").Message[]>(`/sessions/${sessionId}/messages`),
    sendMessage: (sessionId: string, content: string, opts?: {
      use_web_search?: boolean; research_depth?: string; auto_refine?: boolean;
      output_tone?: string; output_audience?: string; output_language?: string;
    }) =>
      fetch(`${BASE_URL}/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          use_web_search: opts?.use_web_search ?? false,
          research_depth: opts?.research_depth ?? "standard",
          auto_refine: opts?.auto_refine ?? false,
          output_tone: opts?.output_tone ?? "professional",
          output_audience: opts?.output_audience ?? "",
          output_language: opts?.output_language ?? "",
        }),
      }),
    advanceStage: (sessionId: string) =>
      request<import("./types").Session>(`/sessions/${sessionId}/stage/advance`, { method: "POST" }),
    setStage: (sessionId: string, stage: number) =>
      request<import("./types").Session>(`/sessions/${sessionId}/stage/set/${stage}`, { method: "POST" }),
    updateStageData: (sessionId: string, body: Record<string, unknown>) =>
      request<import("./types").Session>(`/sessions/${sessionId}/stage-data`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  },

  slides: {
    list: (projectId: string) => request<import("./types").Slide[]>(`/projects/${projectId}/slides`),
    createBatch: (projectId: string, slides: Record<string, unknown>[]) =>
      request<import("./types").Slide[]>(`/projects/${projectId}/slides/batch`, {
        method: "POST",
        body: JSON.stringify(slides),
      }),
    update: (slideId: string, data: Record<string, unknown>) =>
      request<import("./types").Slide>(`/slides/${slideId}`, { method: "PUT", body: JSON.stringify(data) }),
    reorder: (projectId: string, slideIds: string[]) =>
      request<{ reordered: number }>(`/projects/${projectId}/slides/reorder`, {
        method: "PUT",
        body: JSON.stringify({ slide_ids: slideIds }),
      }),
    delete: (slideId: string) => fetch(`${BASE_URL}/slides/${slideId}`, { method: "DELETE" }),
  },

  decks: {
    generate: (projectId: string) =>
      request<import("./types").Deck>(`/projects/${projectId}/generate`, { method: "POST" }),
    list: (projectId: string) => request<import("./types").Deck[]>(`/projects/${projectId}/decks`),
    downloadUrl: (deckId: string) => `${BASE_URL}/decks/${deckId}/download`,
  },

  validation: {
    validate: (projectId: string) =>
      request<import("./types").ValidationReport>(`/projects/${projectId}/validate`),
  },

  exports: {
    markdownUrl: (projectId: string) => `${BASE_URL}/export/projects/${projectId}/markdown`,
    transcriptUrl: (projectId: string) => `${BASE_URL}/export/projects/${projectId}/transcript`,
    generate: (projectId: string, formatType: string) =>
      request<import("./types").Deliverable>(`/export/projects/${projectId}/export`, {
        method: "POST",
        body: JSON.stringify({ format_type: formatType }),
      }),
    list: (projectId: string) =>
      request<import("./types").Deliverable[]>(`/export/projects/${projectId}/deliverables`),
    downloadUrl: (deliverableId: string) => `${BASE_URL}/export/deliverables/${deliverableId}/download`,
  },

  briefing: {
    start: (projectId: string) =>
      request<import("./types").BriefingRun>(`/briefing/projects/${projectId}/start`, { method: "POST" }),
    status: (projectId: string) =>
      request<import("./types").BriefingRun>(`/briefing/projects/${projectId}/status`),
    result: (projectId: string) =>
      request<import("./types").BriefingResult>(`/briefing/projects/${projectId}/result`),
    cancel: (projectId: string) =>
      request<{ cancelled: boolean }>(`/briefing/projects/${projectId}/cancel`, { method: "POST" }),
    // stream removed — polling via status endpoint instead
  },

  urlIngest: {
    ingest: (projectId: string, url: string) =>
      request<import("./types").Upload>(`/projects/${projectId}/uploads/url`, {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
  },

  templates: {
    list: () => request<import("./types").EngagementTemplate[]>("/templates"),
    get: (id: string) => request<import("./types").EngagementTemplate>(`/templates/${id}`),
  },

  sharpen: {
    /**
     * Ask the backend to propose an AI-edit for a slide field, chart,
     * citation, or briefing field. Returns {before, after, rationale} —
     * the caller decides whether to commit via the matching update API.
     */
    request: (
      projectId: string,
      body: import("./types").SharpenRequest,
    ) =>
      request<import("./types").SharpenResponse>(
        `/projects/${projectId}/sharpen`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },

  research: {
    get: (projectId: string) => request<import("./types").ResearchState>(`/projects/${projectId}/research`),
    generatePlan: (projectId: string) => request<import("./types").ResearchPlan>(`/projects/${projectId}/research/plan`, { method: "POST" }),
    updatePlan: (projectId: string, plan: import("./types").ResearchPlan) => request<import("./types").ResearchPlan>(`/projects/${projectId}/research/plan`, { method: "PUT", body: JSON.stringify(plan) }),
    execute: (projectId: string) => fetch(`${BASE_URL}/projects/${projectId}/research/execute`, { method: "POST" }),
    getSources: (projectId: string) => request<import("./types").ResearchSource[]>(`/projects/${projectId}/research/sources`),
    addSource: (projectId: string, url: string) => request<import("./types").ResearchSource>(`/projects/${projectId}/research/sources`, { method: "POST", body: JSON.stringify({ url }) }),
    removeSource: (projectId: string, idx: number) => fetch(`${BASE_URL}/projects/${projectId}/research/sources/${idx}`, { method: "DELETE" }),
    updateBrief: (projectId: string, brief: Record<string, unknown>) => request<Record<string, unknown>>(`/projects/${projectId}/research/brief`, { method: "PUT", body: JSON.stringify(brief) }),
  },

  importReport: {
    /** Upload a deepresearch report (.md/.pdf/.docx). Returns the new project + session
     *  ids and the LLM-inferred Stage 1+2 metadata for the confirmation form. */
    upload: async (file: File): Promise<import("./types").ImportResult> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BASE_URL}/projects/import-report`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || `Import failed: ${res.status}`);
      }
      return res.json();
    },
  },
};
