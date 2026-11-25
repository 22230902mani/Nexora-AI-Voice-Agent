# NEXORA AI — Project report

## Summary

Nexora AI is a responsive autonomous sales-intelligence MVP designed to capture customer conversations, manage leads and meetings, and make business knowledge available to an AI voice agent.

## Delivered

- Premium dark SaaS dashboard and responsive application navigation.
- FastAPI backend with SQLAlchemy persistence in SQLite.
- Persistent lead CRUD, appointment creation/cancellation, conversations, settings, and document management.
- PDF/TXT upload and keyword retrieval over extracted document text.
- Optional Gemini integration that reports a configuration error when no server key is supplied.
- Browser speech recognition and synthesis with support/permission messaging and conversation history.
- Analytics, CSV exports, environment template, setup guide, architecture, and schema documentation.

## Important implementation notes

Sample rows are seeded into an empty database and labeled as demo data in the interface. Browser speech APIs are browser-dependent and generally require a secure context (localhost is permitted) and microphone permission. AI features require a server-side Gemini key. The current retrieval implementation is keyword-based rather than vector embedding search; production deployment should add authenticated accounts, authorization, rate limiting, robust file scanning, and a production database/migration workflow.

