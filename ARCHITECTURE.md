# System architecture

```mermaid
flowchart LR
    Browser["Browser SPA\nHTML / CSS / JavaScript"]
    Speech["Browser Web Speech APIs\nSpeechRecognition + SpeechSynthesis"]
    API["FastAPI REST API"]
    DB[("SQLite\nSQLAlchemy ORM")]
    Files["PDF/TXT extraction\npypdf + UTF-8"]
    Gemini["Gemini API\noptional server-side key"]

    Browser -->|JSON + multipart requests| API
    Browser --> Speech
    API --> DB
    API --> Files
    Files --> DB
    API -->|configured requests only| Gemini
    Gemini --> API
```

The browser app and API are served by the same FastAPI process. Persistent sales records and settings use SQLite. Documents are extracted to text and indexed in the database; retrieval currently uses keyword matching. Live speech recognition and synthesis run in the browser and depend on browser support and microphone permission. Gemini credentials are read from server environment variables and are never returned by the API.

