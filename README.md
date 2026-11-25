<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:000000,50:8B0000,100:FF0000&height=240&section=header&text=Smart%20Stock%20AI&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=AI-Powered%20Stock%20Intelligence&descAlignY=60&descSize=20" />

<br/>

<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&size=28&duration=3000&pause=1000&color=FF0000&center=true&vCenter=true&width=700&lines=AI-Powered+Stock+Analysis;Adaptive+Stock+Engine;Real-Time+Market+Insights;Built+With+FastAPI+%2B+AI" />

<br/><br/>

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0%2B-D71F00)](https://www.sqlalchemy.org/)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![Deploy](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com/)

</div>

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
