# Nexora AI Voice Agent

<p>
  <strong>An autonomous sales-intelligence workspace built with FastAPI, SQLite/PostgreSQL, and vanilla JavaScript.</strong>
</p>

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0%2B-D71F00)](https://www.sqlalchemy.org/)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Deploy](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com/)

Nexora AI is a responsive, full-stack sales voice-agent MVP. It combines a browser-based voice workspace, an AI sales assistant, lead and appointment management, conversation history, document knowledge search, analytics, and persistent user preferences in a single FastAPI application.

The interface works with local demo data immediately. An optional Google Gemini API key enables live AI chat and conversation analysis; the rest of the application remains usable without an external AI provider.

> **Project scope:** This repository delivers a working, locally runnable prototype of an AI sales-assistant workflow. It demonstrates browser voice interaction, Gemini responses, keyword-based knowledge retrieval, lead and appointment records, and post-call analysis. It is not yet a production contact-center platform: external CRM synchronization, telephony, multilingual controls, semantic/vector retrieval, and multi-tenant security are future extensions.

**Repository:** [github.com/22230902mani/Nexora-AI-Voice-Agent](https://github.com/22230902mani/Nexora-AI-Voice-Agent)

---

## Table of Contents

- [Business Problem](#business-problem)
- [Solution and Demo Workflow](#solution-and-demo-workflow)
- [Features](#features)
- [What Is Implemented](#what-is-implemented)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Scalability to 100,000 Users](#scalability-to-100000-users)
- [Security and Privacy](#security-and-privacy)
- [Business and Commercial Feasibility](#business-and-commercial-feasibility)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Overview](#api-overview)
- [Knowledge Base](#knowledge-base)
- [Database](#database)
- [Deploying to Render](#deploying-to-render)
- [Project Structure](#project-structure)
- [Browser and Microphone Requirements](#browser-and-microphone-requirements)
- [Development Notes](#development-notes)
- [Production Checklist](#production-checklist)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Business Problem

Sales teams spend significant time on repetitive first-contact conversations, lead qualification, appointment coordination, and writing call notes. When these tasks are handled manually, follow-ups can be inconsistent, customer context gets lost, and useful call information is difficult to turn into team-level insight.

Nexora explores how an AI-assisted sales workflow can reduce that operational overhead while keeping customer and conversation records visible in one workspace. The prototype is designed around a practical question: **How can a sales agent respond using approved business information, capture useful qualification context, and make the next action easier for a human team member?**

## Solution and Demo Workflow

Use the seeded demo workspace to walk through one complete flow:

1. **Review the dashboard** to see example leads, conversations, appointments, and activity.
2. **Add product information** in the Knowledge Base by uploading a supported document.
3. **Configure Gemini** using `GEMINI_API_KEY` if live AI responses and call analysis are required.
4. **Open the voice agent** in a supported browser, allow microphone access, and start a sample conversation.
5. **See the interaction** transcribed in the browser, sent to the API for a Gemini response, and spoken back using browser speech synthesis.
6. **End the call** to save its transcript and request a summary, sentiment, requirements, and follow-up action.
7. **Review the outcome** in Conversations, Leads, Appointments, and Analytics. Records can be managed in the UI and exported where supported.

The voice recognition prototype currently configures the browser speech recognizer for **English (United States)**. Appointment booking is available within Nexora; it does not yet connect to an external calendar or CRM.

---

## Features

### Sales workspace

- Dashboard overview with leads, conversations, appointments, sentiment, and recent activity
- Persistent lead/customer records with create, edit, delete, search, interest filtering, and scoring
- Appointment scheduling, editing, cancellation, and calendar view
- Searchable conversation history with transcripts, summaries, sentiment, and next actions
- Analytics for calls, qualified leads, conversion rate, duration, sentiment, and appointments
- CSV export for lead and analytics data

### Voice and AI

- Browser-based speech recognition and speech synthesis
- Listening, processing, and speaking visual states
- Live transcript, call timer, and microphone mute controls
- Gemini-powered floating sales assistant
- Server-side Gemini integration for AI chat and conversation analysis
- Knowledge retrieval before generating responses
- Clear setup and provider error messages when AI is unavailable

### Knowledge and personalization

- Upload and extract text from PDF, DOCX, XLSX, PPTX, TXT, Markdown, RST, LOG, CSV, TSV, JSON, HTML, XML, and YAML files
- 8 MB per-file upload limit
- Keyword-based document search
- Editable agent name and personality
- Persistent light/dark theme
- Editable profile, profile photo, interests, workspace settings, and live profile statistics
- Notifications for recent calls, appointments, and lead follow-ups

---

## What Is Implemented

The distinction between working prototype behavior and production extensions is intentional: it makes the current scope easy to evaluate and avoids implying integrations that are not in this repository.

| Evaluation requirement | Current implementation |
|---|---|
| Real-time voice interaction | Browser Web Speech API for speech recognition and synthesis; the current recognizer locale is `en-US`. |
| Contextual conversation | The active voice conversation is passed to Gemini as message history. |
| Lead qualification | Leads have editable interest, sentiment, score, and follow-up fields. AI post-call analysis can return a lead score, but that score is not automatically written back to a lead record. |
| Sentiment and call summary | Gemini conversation analysis can return summary, sentiment, requirements, next action, and lead score after a call. |
| Knowledge retrieval / RAG | Documents are parsed and stored; keyword overlap ranks relevant content and up to three documents are included as Gemini context. This is retrieval-augmented generation using keyword retrieval, not vector/embedding search. |
| Appointment management | Create, edit, list, and delete appointments in the Nexora database. External calendar integrations are not included. |
| CRM workflow | Internal lead and customer records support CRUD, search, scoring, and CSV export. Salesforce, HubSpot, and other external CRM connectors are not included. |
| Business insights | Dashboard metrics, analytics, sentiment counts, conversation summaries, and CSV export. |
| Multilingual support | Not implemented as a configurable product feature. Voice recognition is currently set to `en-US`; browser synthesis voice selection depends on the device. |
| Scalability | PostgreSQL is supported. The deployed prototype is a single FastAPI service; the scale-out design is described in [Scalability to 100,000 Users](#scalability-to-100000-users). |

---

## Technology Stack

| Area | Technology |
|---|---|
| Backend | Python, FastAPI, Pydantic |
| Database | SQLite by default, PostgreSQL supported through SQLAlchemy |
| ORM | SQLAlchemy 2.0 |
| Frontend | HTML5, CSS3, modern vanilla JavaScript |
| Voice | Browser Web Speech Recognition and Speech Synthesis APIs |
| AI | Google Gemini API |
| Document extraction | pypdf, python-docx, openpyxl, python-pptx |
| HTTP client | httpx |
| Deployment | Render Blueprint and Uvicorn |

---

## Architecture

```mermaid
sequenceDiagram
    participant User
    participant Browser as Browser app
    participant Speech as Web Speech APIs
    participant API as FastAPI
    participant Store as SQLAlchemy database
    participant Gemini as Gemini API

    User->>Browser: Start voice session
    Browser->>Speech: Capture speech (en-US)
    Speech-->>Browser: Transcript text
    Browser->>API: Message + recent conversation history
    API->>Store: Retrieve relevant knowledge documents
    Store-->>API: Keyword-ranked document text
    API->>Gemini: Prompt + relevant context
    Gemini-->>API: Assistant response
    API-->>Browser: Response text
    Browser->>Speech: Speak response
    User->>Browser: End voice session
    Browser->>API: Save transcript and call analysis
    API->>Store: Persist conversation and analysis
```

The browser application and API run in the same FastAPI process. Static assets are served from `static/`; leads, appointments, conversations, settings, and extracted document text are persisted through SQLAlchemy. Speech recognition and speech synthesis run in the browser. The Gemini key remains on the server.

For implementation details, see [ARCHITECTURE.md](ARCHITECTURE.md) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

---

## Scalability to 100,000 Users

The current deployment is a functional MVP, not a load-tested service for 100,000 concurrent users. A practical path to that scale would separate stateless API compute from durable data and asynchronous AI/document work:

- **API tier:** containerize FastAPI, keep application instances stateless, put them behind a load balancer, and scale horizontally based on request latency and concurrency.
- **Database tier:** use managed PostgreSQL with connection pooling, indexes on common filters and timestamps, migrations, backups, read replicas where read load warrants them, and tenant-scoped access controls.
- **Background processing:** queue document extraction, call analysis, exports, and retryable provider requests rather than doing all long-running work inside a web request.
- **Knowledge retrieval:** store original files in object storage; use a dedicated search index or vector store for larger corpora, with tenant and document permissions enforced at retrieval time.
- **Voice and AI:** evaluate a streaming speech/telephony provider for phone calls, use provider quotas and timeouts, apply per-tenant rate limits, and control model selection, token budgets, and retries.
- **Reliability and operations:** add observability, dashboards, alerts, health/readiness probes, graceful shutdown, disaster recovery exercises, and load tests against agreed latency and availability targets.

**Scale validation should be measured, not assumed.** Before claiming support for 100,000 users, define whether that means registered accounts, monthly active users, or simultaneous calls, then load-test realistic traffic patterns and report throughput, p95/p99 latency, error rate, and operating cost.

---

## Security and Privacy

- Gemini credentials are configured on the server; do not put secrets in frontend code or commit `.env`.
- Uploaded files are limited by extension and size and parsed for text, but the prototype is not a malware-scanning or document-sandboxing service.
- The current app does not implement user authentication, tenant isolation, or role-based access control. Do not expose it publicly with real customer data as-is.
- Voice recognition is browser-dependent; review browser/provider data handling and obtain appropriate consent before recording or processing real conversations.
- For a production deployment, add HTTPS, authentication and authorization, tenant-scoped database queries, rate limits, secure secret storage, encrypted backups, retention controls, audit logs, and a documented privacy policy.

---

## Business and Commercial Feasibility

The prototype targets a clear operational use case: help sales teams handle repeatable first-touch conversations and produce structured follow-up notes. A potential commercial offering could be priced per seat, per handled conversation, or as a tiered subscription, with paid CRM/calendar integrations and analytics as higher-tier capabilities.

Key cost drivers to validate in a pilot:

- AI model usage per conversation (input/output tokens and call analysis)
- Speech or telephony minutes if moving beyond browser-only voice
- Database, file storage, search, and background processing
- Monitoring, security, customer support, and compliance requirements

Commercial viability depends on measured time saved, lead-to-meeting conversion impact, customer acceptance, and the cost per qualified conversation. These figures are intentionally not claimed by this prototype; they should be measured with a small consented pilot before setting pricing or ROI claims.

---

## Getting Started

### Prerequisites

- Python 3.10 or newer
- `pip`
- A modern browser
- Microphone and browser permission for live voice recognition
- Optional Google Gemini API key

Chrome or Edge is recommended for the most complete Web Speech API experience.

### Clone the repository

```bash
git clone https://github.com/22230902mani/Nexora-AI-Voice-Agent.git
cd Nexora-AI-Voice-Agent
```

### Create a virtual environment

#### Windows PowerShell

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If `py` is unavailable:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

#### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Configure environment variables

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

For a local database-only run, no API key is required. To enable Gemini features, add a key to `.env`:

```dotenv
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-2.5-flash
DATABASE_URL=sqlite:///./nexora.db
```

Never commit `.env`, Gemini credentials, database credentials, or private customer data.

---

## Running the Application

### Development server

```bash
uvicorn backend.main:app --env-file .env --reload
```

Open:

- Application: http://127.0.0.1:8000
- Swagger API documentation: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health endpoint: http://127.0.0.1:8000/api/health

### Basic health check

```bash
curl http://127.0.0.1:8000/api/health
```

Example response:

```json
{
  "status": "ok",
  "ai_configured": true
}
```

---

## Configuration

| Variable | Required | Default | Description |
|---|---:|---|---|
| `GEMINI_API_KEY` | No | Empty | Server-side Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Gemini model used for chat and conversation analysis |
| `DATABASE_URL` | No | `sqlite:///./nexora.db` | SQLAlchemy database connection URL |

Example PostgreSQL URL:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/database
```

The application automatically converts legacy `postgres://` URLs and standard `postgresql://` URLs to the `postgresql+psycopg://` SQLAlchemy dialect.

---

## API Overview

FastAPI exposes both interactive documentation and JSON REST endpoints.

| Resource | Methods | Endpoints |
|---|---|---|
| Health | `GET` | `/api/health` |
| Leads | `GET`, `POST`, `PUT`, `DELETE` | `/api/leads`, `/api/leads/{id}` |
| Conversations | `GET`, `POST`, `DELETE` | `/api/conversations`, `/api/conversations/{id}` |
| Appointments | `GET`, `POST`, `PATCH`, `DELETE` | `/api/appointments`, `/api/appointments/{id}` |
| Documents | `GET`, `POST`, `DELETE` | `/api/documents`, `/api/documents/{id}` |
| Knowledge search | `GET` | `/api/knowledge/search?q=term` |
| AI | `POST` | `/api/ai/respond` |
| Settings | `GET`, `PUT` | `/api/settings` |
| Profile | `GET`, `PUT` | `/api/profile` |
| Analytics | `GET` | `/api/analytics` |

Example lead request:

```bash
curl -X POST http://127.0.0.1:8000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"name":"Taylor Smith","email":"taylor@example.com","company":"Example Inc.","interest":"Warm","score":75}'
```

PowerShell users can use `Invoke-RestMethod` instead of the `curl` alias.

---

## Knowledge Base

The knowledge base extracts text at upload time and stores it in the database. Search and Gemini context retrieval use keyword matching rather than embeddings or vector search.

Supported formats:

- PDF: `.pdf`
- Word: `.docx`
- Excel: `.xlsx`
- PowerPoint: `.pptx`
- Text: `.txt`, `.md`, `.markdown`, `.rst`, `.log`
- Tabular: `.csv`, `.tsv`
- Structured: `.json`, `.html`, `.htm`, `.xml`, `.yaml`, `.yml`

Files are limited to 8 MB. Empty files and documents without readable text are stored with a “No searchable text” status.

---

## Database

### SQLite

By default, the application creates `nexora.db` in the process working directory and seeds clearly labeled demo records when the database is empty.

To reset the local demo workspace:

1. Stop the server.
2. Delete `nexora.db`.
3. Start the server again.

Do not delete the database while Uvicorn is running.

### PostgreSQL

Set `DATABASE_URL` to a PostgreSQL connection string. SQLAlchemy will create the required tables, but an existing production database should use migrations such as Alembic before and during future schema changes.

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for the current tables and columns.

---

## Deploying to Render

The repository includes [`render.yaml`](render.yaml), a Render Blueprint that provisions:

- A Python web service
- A free PostgreSQL database
- The `DATABASE_URL` environment binding
- A Gemini API key environment variable

### Deployment steps

1. Push the project to GitHub.
2. Open the Render dashboard.
3. Select **New > Blueprint**.
4. Connect `22230902mani/Nexora-AI-Voice-Agent`.
5. Enter `GEMINI_API_KEY` in the Render dashboard when prompted.
6. Deploy the Blueprint.

The service uses:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

The health check is `/api/health`.

The default free database and service plans are suitable for demos only. Use persistent paid database storage and a suitable web-service plan for real customer data.

---

## Project Structure

```text
Nexora-AI-Voice-Agent/
├── backend/
│   ├── __init__.py
│   └── main.py              # FastAPI app, models, API routes, AI, and document parsing
├── static/
│   ├── index.html           # Application shell
│   ├── styles.css           # Responsive SaaS interface and themes
│   └── app.js               # Navigation, API calls, voice, chat, and UI behavior
├── .env.example             # Example environment configuration
├── .gitignore
├── ARCHITECTURE.md          # Architecture overview
├── DATABASE_SCHEMA.md       # Database documentation
├── PROJECT_REPORT.md        # Project summary and implementation notes
├── nexora.db                # Local SQLite database, when present
├── render.yaml              # Render deployment Blueprint
├── requirements.txt         # Python dependencies
└── README.md
```

---

## Browser and Microphone Requirements

- Microphone access normally requires `localhost` or HTTPS.
- Grant microphone permission when the browser prompts.
- Speech recognition support varies by browser and operating system.
- Speech synthesis availability depends on the browser’s installed voices.
- If voice recognition is unsupported, the dashboard and text-based assistant still work.
- For security and privacy, do not speak sensitive information on a shared or unknown device.

---

## Development Notes

- Demo rows are inserted only when a table has no existing records.
- The profile image is limited to PNG, JPEG, or WebP and 1 MB.
- Gemini credentials are read only on the server and are never returned by the API.
- Application settings that contain `key` or `secret` are ignored by the settings endpoint.
- The current AI context includes up to three relevant documents.
- Conversation and knowledge records are persisted; deleting them removes the database rows.
- The frontend calls `/api/*` on the same origin.

---

## Production Checklist

This repository is a functional MVP, not a production multi-tenant system. Before using real customer data, add:

- Authentication and role-based authorization
- HTTPS, CORS, and CSP restrictions
- CSRF protection where needed
- API rate limiting and abuse controls
- Database migrations
- Encrypted backups and secret management
- Secure document validation and malware scanning
- Audit logs and configurable retention
- Vector or semantic search for larger knowledge bases
- Monitoring, structured logging, and error tracing
- Automated tests and CI/CD
- Privacy and consent flows for voice recordings
- Provider fallback and cost controls

---

## Troubleshooting

### The server will not start

Verify the virtual environment and dependencies:

```bash
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

### AI responses are unavailable

Check that `GEMINI_API_KEY` is set and that the server was restarted after changing `.env`.

Test:

```bash
curl http://127.0.0.1:8000/api/health
```

`"ai_configured": false` means the key is not present in the server environment.

### Microphone is not working

- Use Chrome or Edge.
- Open the application through `localhost` or HTTPS.
- Check the browser’s microphone permission.
- Confirm an input microphone is selected in the operating system.
- Check whether the browser exposes `SpeechRecognition` or `webkitSpeechRecognition`.

### Documents cannot be uploaded

- Confirm the file extension is supported.
- Keep the file under 8 MB.
- Ensure scanned PDFs contain extractable text.
- Confirm the server dependencies are installed.

### PostgreSQL connection fails

- Use a valid SQLAlchemy PostgreSQL URL.
- Confirm the database host allows connections from the application.
- Verify username, password, database name, and TLS settings.
- Ensure `psycopg[binary]` is installed from `requirements.txt`.

---

## Documentation

- [Project report](PROJECT_REPORT.md)
- [System architecture](ARCHITECTURE.md)
- [Database schema](DATABASE_SCHEMA.md)
- [Environment example](.env.example)
- [Render Blueprint](render.yaml)

Interactive API documentation is available at `/docs` while the server is running.

---

## Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make focused, tested changes.
4. Update related documentation.
5. Open a pull request with setup and test details.

For larger changes, open an issue first to discuss the proposed design.

---

## License

No license has been included in this repository. Add a `LICENSE` file before third-party reuse or distribution if you want to define permissions and conditions clearly.
