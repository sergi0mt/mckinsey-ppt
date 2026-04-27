# MECE PPT

Third pillar of the trio. Takes a deepresearch report → produces a McKinsey-style deck.

```
mece-prompt-builder  →  deepresearch  →  mckinsey-ppt
   (Stages 1+2)         (research)        (Stages 3+4)
```

Workflow:

1. Define problem + MECE in [mece-prompt-builder](https://github.com/sergi0mt/mece-prompt-builder), copy the prompt
2. Paste into [deepresearch](https://github.com/sergi0mt/deepresearch), download the report (.md / .pdf / .docx)
3. **Upload here, get the deck (PPTX + DOCX + MD)**

## Stack

- **Backend**: FastAPI + SQLite (async via `aiosqlite`), 3-tier OpenRouter routing (DeepSeek v3.2 / Gemini 2.5 Flash / Gemini 3.1 Pro)
- **Frontend**: Next.js 16 (App Router, React 19) + Tailwind v4 + shadcn/ui
- **PPTX**: vendored `mckinsey_pptx/` (calibrated McKinsey styles, native charts, validators)
- **LLM-inferrer**: gemini-3.1-pro reads the report → guesses central question, audience, decision, deck type, template, hypothesis (~$0.007 / import)
- **Web search**: Brave + Tavily (chat can search supplementary data if the report has gaps)

## Local development

```bash
cp .env.example .env
# Fill OPENROUTER_API_KEY at minimum

pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

start.bat                       # Windows — opens backend:8000 + frontend:3000
```

## How it works

1. `/v2` → click **Import report**
2. Drop your `.md` / `.pdf` / `.docx` from deepresearch
3. Backend parses the H2 sections (Resumen Ejecutivo / Marco Conceptual / branches / Conclusiones / Referencias) and runs gemini-3.1-pro to infer Stage 1+2 metadata that deepresearch's export doesn't include
4. Confirmation form appears pre-filled — tweak and confirm
5. Workspace opens at Stage 3 (Build Storyline). Chat with the agent: *"Generate the deck in English, 12 slides, board audience"*
6. Agent emits storyline + slides JSON, persisted to DB
7. Click **Generate** → PPTX rendered via `mckinsey_pptx.deck_assembler.quick_deck` → download
8. **Export** menu: also DOCX (executive memo) and Markdown

## Deployment

Two Railway services (see `railway.toml` and `frontend/railway.toml`):

- Backend service: root `/`, attach a Volume at `/data`, set `OPENROUTER_API_KEY`
- Frontend service: root `/frontend`, set `NEXT_PUBLIC_API_URL` to backend URL + `/api/v1`

## Differences vs the original `Mckinsey claude`

- **No autonomous Brief Me pipeline** — the user chose chat-driven Stage 3+4
- **No PDF one-pager export** — only PPTX / DOCX / Markdown
- **No Stage 1/2 chat** — the report import handles that step (form-driven, LLM-inferred)
- Adds `POST /api/v1/projects/import-report` + `PUT /api/v1/sessions/{id}/stage-data`
- Adds `backend/services/report_parser.py` + `metadata_inferrer.py`
- Adds frontend pages `/v2/import` (upload) + `/v2/engagements/[id]/import` (confirm)
