# NEXORA AI — Autonomous Sales Intelligence

Nexora AI is a local-first sales voice-agent MVP with a responsive light/dark SaaS interface and a persistent appearance toggle, a FastAPI REST API, and SQLite persistence. Its voice workspace includes a state-aware visualizer for listening, processing, and speaking, alongside lead and appointment management, conversation history, a searchable document knowledge base, dashboard analytics, Gemini-powered agent replies, and browser speech recognition/synthesis.

> **Demo data:** The first startup inserts clearly labeled sample records into the local database so the dashboard is useful immediately. Remove `nexora.db` to reset the local sample workspace. Data entered from the UI is stored in the same SQLite database.

## Requirements

- Python 3.10+
- A modern browser. Chrome or Edge is recommended for the Web Speech Recognition API.
- Optional: a Gemini API key to enable live AI replies. Without it, the API explicitly reports that AI is not configured.

## Run locally

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Add GEMINI_API_KEY to .env to enable AI responses.
uvicorn backend.main:app --env-file .env --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). FastAPI serves both the app and API. API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

For PowerShell environments where `py` is not available, replace it with `python`.

## Deploy on Render

The root `render.yaml` Blueprint configures the FastAPI web service and a free PostgreSQL database for demo use. Push the project to a GitHub repository, then create a new Blueprint in Render and select that repository. Set `GEMINI_API_KEY` in the Render dashboard when prompted; do not upload `.env` or paste the key into `render.yaml`.

Render's free services have limited availability and database retention, so this setup is for demos rather than durable customer data. Select a paid PostgreSQL plan in Render for ongoing production data.

## Features

- **Overview:** persistent counts, activity, customer sentiment, recent conversations, appointments, and demo-data labeling.
- **Voice agent:** browser speech-to-text and speech synthesis where supported, animated listening/speaking states, live transcript, timer, mute, and saved conversation records.
- **AI chatbot:** floating animated assistant with Gemini-powered replies using the same server-side AI configuration and workspace knowledge; shows a setup message if AI is not configured.
- **Leads:** create, edit, delete, search, interest filtering, sorting, and CSV export.
- **Conversations:** searchable call history, transcript/summary detail, and permanent deletion of conversations and their stored transcripts.
- **Appointments:** calendar, scheduling, and cancellation.
- **Knowledge base:** upload PDF, DOCX, XLSX, PPTX, TXT/Markdown, CSV/TSV, JSON, HTML, XML, YAML, RST, and LOG files (up to 8 MB each), delete, and keyword-based retrieval. Searchable text is extracted from supported files; empty or textless files are clearly marked.
- **Analytics:** metrics, sentiment, conversation performance, and CSV export.
- **Settings:** agent/business preferences persisted to SQLite. Provider credentials remain server-side.
- **Profile:** editable workspace identity, photo, interests, and activity stats, saved to SQLite.

## Configuration

Copy `.env.example` to `.env`. Environment variables:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Optional server-side key for Gemini text generation. |
| `GEMINI_MODEL` | Gemini model name; defaults to `gemini-2.0-flash`. |
| `DATABASE_URL` | SQLAlchemy URL; defaults to `sqlite:///./nexora.db`. |

Use a production-grade secret store and restrict CORS/origins before deployment. The sample app intentionally does not collect API keys in the browser.

## Project structure

```text
backend/
  main.py          FastAPI routes, SQLAlchemy models, seed data, AI integration
static/
  index.html       Application shell
  styles.css       Responsive design system
  app.js           Navigation and browser interactions
requirements.txt
render.yaml
.env.example
README.md
ARCHITECTURE.md
DATABASE_SCHEMA.md
PROJECT_REPORT.md
```

## Validation

Run the API locally and verify `GET /api/health`, then exercise the CRUD flows from the app. Use the built-in `/docs` page for direct API checks. No external API key is required for database, document, lead, appointment, or conversation workflows.

