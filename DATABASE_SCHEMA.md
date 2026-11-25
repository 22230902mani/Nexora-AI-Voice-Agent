# Database schema

SQLite tables are created by SQLAlchemy at application startup.

| Table | Columns |
|---|---|
| `leads` | `id` PK, `name`, `phone`, `email`, `company`, `source`, `interest`, `sentiment`, `score`, `follow_up`, `created_at` |
| `conversations` | `id` PK, `customer`, `status`, `sentiment`, `duration`, `summary`, `requirements`, `next_action`, `transcript` (JSON text), `created_at` |
| `appointments` | `id` PK, `customer`, `company`, `purpose`, `starts_at` (ISO-8601 text), `status` |
| `documents` | `id` PK, `name`, `category`, `content` (extracted text), `status`, `created_at` |
| `settings` | `key` PK, `value`. App/agent preferences use plain keys; user-profile fields use the `profile_` prefix. The optional profile image is stored as validated base64 data. |

The default SQLite file is `nexora.db` in the process working directory. Configure an alternate SQLAlchemy URL with `DATABASE_URL`.

