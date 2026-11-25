import os
import base64
import binascii
import csv
import io
import json
import zipfile
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Optional
from xml.etree import ElementTree

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import DateTime, Float, Integer, String, Text, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nexora.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
SUPPORTED_DOCUMENT_EXTENSIONS = {
    ".pdf", ".txt", ".md", ".markdown", ".rst", ".log", ".csv", ".tsv",
    ".json", ".html", ".htm", ".xml", ".yaml", ".yml", ".docx", ".xlsx", ".pptx",
}
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Base(DeclarativeBase):
    pass


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    company: Mapped[str] = mapped_column(String(120), default="")
    source: Mapped[str] = mapped_column(String(60), default="Website")
    interest: Mapped[str] = mapped_column(String(30), default="Warm")
    sentiment: Mapped[str] = mapped_column(String(30), default="Neutral")
    score: Mapped[int] = mapped_column(Integer, default=50)
    follow_up: Mapped[str] = mapped_column(String(40), default="Needs follow-up")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(40), default="Completed")
    sentiment: Mapped[str] = mapped_column(String(30), default="Neutral")
    duration: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    requirements: Mapped[str] = mapped_column(Text, default="")
    next_action: Mapped[str] = mapped_column(String(200), default="Review conversation")
    transcript: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer: Mapped[str] = mapped_column(String(120))
    company: Mapped[str] = mapped_column(String(120), default="")
    purpose: Mapped[str] = mapped_column(String(240), default="Discovery call")
    starts_at: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="Scheduled")


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(80), default="General")
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="Indexed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AppSetting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class LeadInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    company: str = ""
    source: str = "Website"
    interest: str = "Warm"
    sentiment: str = "Neutral"
    score: int = Field(default=50, ge=0, le=100)
    follow_up: str = "Needs follow-up"


class ConversationInput(BaseModel):
    customer: str
    status: str = "Completed"
    sentiment: str = "Neutral"
    duration: int = 0
    summary: str = ""
    requirements: str = ""
    next_action: str = "Review conversation"
    transcript: str = "[]"


class AppointmentInput(BaseModel):
    customer: str
    company: str = ""
    purpose: str = "Discovery call"
    starts_at: str
    status: str = "Scheduled"


class AIInput(BaseModel):
    message: str
    history: list[dict] = Field(default_factory=list)
    task: str = "reply"


class SettingsInput(BaseModel):
    values: dict[str, str]


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(default="", max_length=160)
    phone: str = Field(default="", max_length=40)
    title: str = Field(default="Sales Administrator", max_length=100)
    location: str = Field(default="", max_length=100)
    bio: str = Field(default="", max_length=600)
    interests: list[str] = Field(default_factory=list, max_length=12)
    photo_data: str = Field(default="", max_length=1_500_000)

    @field_validator("photo_data")
    @classmethod
    def validate_photo_data(cls, value: str) -> str:
        if not value:
            return value
        allowed = {
            "data:image/png;base64,": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
            "data:image/jpeg;base64,": lambda data: data.startswith(b"\xff\xd8\xff"),
            "data:image/webp;base64,": lambda data: data.startswith(b"RIFF") and data[8:12] == b"WEBP",
        }
        for prefix, verify_signature in allowed.items():
            if value.startswith(prefix):
                try:
                    image = base64.b64decode(value[len(prefix):], validate=True)
                except (binascii.Error, ValueError) as exc:
                    raise ValueError("Profile photo must be a valid encoded image") from exc
                if len(image) > 1_000_000 or not verify_signature(image):
                    raise ValueError("Use a valid PNG, JPEG, or WebP image under 1 MB")
                return value
        raise ValueError("Profile photo must be PNG, JPEG, or WebP")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LeadOut(ORMModel):
    id: int
    name: str
    phone: str
    email: str
    company: str
    source: str
    interest: str
    sentiment: str
    score: int
    follow_up: str
    created_at: datetime


class ConversationOut(ORMModel):
    id: int
    customer: str
    status: str
    sentiment: str
    duration: int
    summary: str
    requirements: str
    next_action: str
    transcript: str
    created_at: datetime


class AppointmentOut(ORMModel):
    id: int
    customer: str
    company: str
    purpose: str
    starts_at: str
    status: str


class DocumentOut(ORMModel):
    id: int
    name: str
    category: str
    status: str
    created_at: datetime


app = FastAPI(title="NEXORA AI API", version="1.0.0")
def seed_demo_data() -> None:
    with SessionLocal() as db:
        if db.scalar(select(Lead.id).limit(1)) is None:
            db.add_all(
                [
                    Lead(name="Olivia Rhye", phone="+1 415 555 0134", email="olivia@acme.io", company="Acme Inc.", source="Website", interest="Hot", sentiment="Positive", score=92, follow_up="Meeting booked"),
                    Lead(name="Phoenix Baker", phone="+1 415 555 0182", email="phoenix@stack.com", company="Stack Labs", source="Referral", interest="Warm", sentiment="Positive", score=78, follow_up="Follow-up today"),
                    Lead(name="Lana Steiner", phone="+1 415 555 0122", email="lana@circooles.com", company="Circooles", source="LinkedIn", interest="Warm", sentiment="Neutral", score=64, follow_up="Contacted"),
                    Lead(name="Demi Wilkinson", phone="+1 415 555 0109", email="demi@catalog.com", company="Catalog", source="Campaign", interest="Cool", sentiment="Neutral", score=41, follow_up="Needs follow-up"),
                    Lead(name="Candice Wu", phone="+1 415 555 0177", email="candice@layers.com", company="Layers", source="Website", interest="Hot", sentiment="Positive", score=87, follow_up="Meeting booked"),
                ]
            )
        if db.scalar(select(Conversation.id).limit(1)) is None:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            db.add_all(
                [
                    Conversation(customer="Olivia Rhye", duration=248, sentiment="Positive", summary="Interested in an enterprise plan for a 24-person sales team.", requirements="CRM integration, call analytics, team onboarding", next_action="Send enterprise proposal", created_at=now - timedelta(minutes=18)),
                    Conversation(customer="Phoenix Baker", duration=183, sentiment="Positive", summary="Evaluating voice automation for inbound qualification.", requirements="Inbound routing, HubSpot sync", next_action="Schedule technical demo", created_at=now - timedelta(hours=2)),
                    Conversation(customer="Lana Steiner", duration=312, sentiment="Neutral", summary="Requested pricing details and security documentation.", requirements="SOC 2 report, annual pricing", next_action="Share security pack", created_at=now - timedelta(days=1)),
                    Conversation(customer="Demi Wilkinson", duration=96, sentiment="Negative", summary="Not ready to change their current workflow this quarter.", requirements="Revisit in Q3", next_action="Add to nurture sequence", created_at=now - timedelta(days=2)),
                ]
            )
        if db.scalar(select(Appointment.id).limit(1)) is None:
            tomorrow = (datetime.now() + timedelta(days=1)).replace(hour=10, minute=30, second=0, microsecond=0)
            db.add_all(
                [
                    Appointment(customer="Olivia Rhye", company="Acme Inc.", purpose="Enterprise discovery", starts_at=tomorrow.isoformat()),
                    Appointment(customer="Phoenix Baker", company="Stack Labs", purpose="Product walkthrough", starts_at=(tomorrow + timedelta(hours=2)).isoformat()),
                    Appointment(customer="Candice Wu", company="Layers", purpose="Solution consultation", starts_at=(tomorrow + timedelta(days=1)).isoformat()),
                ]
            )
        if db.scalar(select(Document.id).limit(1)) is None:
            db.add_all(
                [
                    Document(name="Nexora Product Overview.txt", category="Product", content="Nexora AI provides autonomous sales conversations, lead qualification, CRM synchronization, and call analytics. Plans include Starter, Growth, and Enterprise. Enterprise includes SSO, custom integrations, and dedicated onboarding."),
                    Document(name="Sales Qualification Playbook.txt", category="Sales", content="Discovery questions: What challenge are you solving? How many reps are on your team? Which CRM do you use? What is your timeline? Qualify based on fit, urgency, authority, and budget."),
                ]
            )
        db.commit()


Base.metadata.create_all(bind=engine)
seed_demo_data()


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": bool(os.getenv("GEMINI_API_KEY"))}


@app.get("/api/leads", response_model=list[LeadOut])
def list_leads(q: str = "", interest: str = "", db: Session = Depends(get_db)):
    query = select(Lead).order_by(Lead.created_at.desc())
    if q:
        pattern = f"%{q}%"
        query = query.where((Lead.name.ilike(pattern)) | (Lead.company.ilike(pattern)) | (Lead.email.ilike(pattern)))
    if interest:
        query = query.where(Lead.interest == interest)
    return list(db.scalars(query))


@app.post("/api/leads", response_model=LeadOut)
def create_lead(payload: LeadInput, db: Session = Depends(get_db)):
    lead = Lead(**payload.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@app.put("/api/leads/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: int, payload: LeadInput, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    for key, value in payload.model_dump().items():
        setattr(lead, key, value)
    db.commit()
    db.refresh(lead)
    return lead


@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    db.delete(lead)
    db.commit()
    return {"deleted": True}


@app.get("/api/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db)):
    return list(db.scalars(select(Conversation).order_by(Conversation.created_at.desc())))


@app.post("/api/conversations", response_model=ConversationOut)
def create_conversation(payload: ConversationInput, db: Session = Depends(get_db)):
    conversation = Conversation(**payload.model_dump())
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conversation = db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    db.delete(conversation)
    db.commit()
    return {"deleted": True}


@app.get("/api/appointments", response_model=list[AppointmentOut])
def list_appointments(db: Session = Depends(get_db)):
    return list(db.scalars(select(Appointment).order_by(Appointment.starts_at)))


@app.post("/api/appointments", response_model=AppointmentOut)
def create_appointment(payload: AppointmentInput, db: Session = Depends(get_db)):
    appointment = Appointment(**payload.model_dump())
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment


@app.patch("/api/appointments/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: int, payload: AppointmentInput, db: Session = Depends(get_db)):
    appointment = db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    for key, value in payload.model_dump().items():
        setattr(appointment, key, value)
    db.commit()
    db.refresh(appointment)
    return appointment


@app.delete("/api/appointments/{appointment_id}")
def cancel_appointment(appointment_id: int, db: Session = Depends(get_db)):
    appointment = db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    db.delete(appointment)
    db.commit()
    return {"deleted": True}


class _HTMLTextExtractor(HTMLParser):
    _hidden_tags = {"script", "style", "noscript"}
    _block_tags = {"address", "article", "br", "div", "h1", "h2", "h3", "h4", "li", "p", "section", "tr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self._hidden_tags:
            self.hidden_depth += 1
        elif not self.hidden_depth and tag in self._block_tags:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self._hidden_tags and self.hidden_depth:
            self.hidden_depth -= 1
        elif not self.hidden_depth and tag in self._block_tags:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden_depth:
            self.parts.append(data)


def extract_document_text(extension: str, data: bytes) -> str:
    if extension == ".pdf":
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError

        try:
            return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages).strip()
        except (PdfReadError, OSError, ValueError) as exc:
            raise ValueError("The PDF could not be read.") from exc

    if extension in {".txt", ".md", ".markdown", ".rst", ".log", ".yaml", ".yml"}:
        return data.decode("utf-8-sig", errors="replace").strip()

    if extension in {".csv", ".tsv"}:
        try:
            rows = csv.reader(io.StringIO(data.decode("utf-8-sig", errors="replace")), delimiter="\t" if extension == ".tsv" else ",")
            return "\n".join(" | ".join(cell.strip() for cell in row) for row in rows).strip()
        except csv.Error as exc:
            raise ValueError("The tabular file could not be read.") from exc

    if extension == ".json":
        try:
            parsed = json.loads(data.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("The JSON file is invalid or unreadable.") from exc
        return json.dumps(parsed, ensure_ascii=False, indent=2)

    if extension in {".html", ".htm"}:
        parser = _HTMLTextExtractor()
        try:
            parser.feed(data.decode("utf-8-sig", errors="replace"))
            parser.close()
        except ValueError as exc:
            raise ValueError("The HTML file could not be read.") from exc
        return " ".join(" ".join(parser.parts).split())

    if extension == ".xml":
        try:
            root = ElementTree.fromstring(data)
        except ElementTree.ParseError as exc:
            raise ValueError("The XML file is invalid or unreadable.") from exc
        return "\n".join(text.strip() for text in root.itertext() if text.strip())

    if extension == ".docx":
        from docx import Document as WordDocument
        from docx.opc.exceptions import PackageNotFoundError
        from lxml.etree import XMLSyntaxError

        try:
            document = WordDocument(io.BytesIO(data))
            parts = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
            parts.extend(
                " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                for table in document.tables
                for row in table.rows
            )
        except (PackageNotFoundError, XMLSyntaxError, zipfile.BadZipFile, OSError, ValueError) as exc:
            raise ValueError("The Word document is invalid or unreadable.") from exc
        return "\n".join(part for part in parts if part.strip())

    if extension == ".xlsx":
        from openpyxl import load_workbook
        from openpyxl.utils.exceptions import InvalidFileException

        try:
            workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            try:
                parts = []
                for sheet in workbook.worksheets:
                    parts.append(sheet.title)
                    for row in sheet.iter_rows(values_only=True):
                        values = [str(value).strip() for value in row if value is not None and str(value).strip()]
                        if values:
                            parts.append(" | ".join(values))
            finally:
                workbook.close()
        except (InvalidFileException, zipfile.BadZipFile, OSError, ValueError, KeyError) as exc:
            raise ValueError("The spreadsheet is invalid or unreadable.") from exc
        return "\n".join(parts)

    if extension == ".pptx":
        from lxml.etree import XMLSyntaxError
        from pptx import Presentation
        from pptx.exc import PackageNotFoundError

        try:
            presentation = Presentation(io.BytesIO(data))
            parts = []
            for slide in presentation.slides:
                for shape in slide.shapes:
                    if shape.has_table:
                        parts.extend(
                            " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                            for row in shape.table.rows
                        )
                    elif shape.has_text_frame and shape.text.strip():
                        parts.append(shape.text.strip())
        except (PackageNotFoundError, XMLSyntaxError, zipfile.BadZipFile, OSError, ValueError) as exc:
            raise ValueError("The presentation is invalid or unreadable.") from exc
        return "\n".join(part for part in parts if part.strip())

    raise ValueError("Unsupported document type")


@app.get("/api/documents", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)):
    return list(db.scalars(select(Document).order_by(Document.created_at.desc())))


@app.post("/api/documents", response_model=DocumentOut)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    name = (file.filename or "Untitled").replace("\\", "/").rsplit("/", 1)[-1]
    if len(name) > 200:
        raise HTTPException(413, "File name must be 200 characters or fewer")
    data = await file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(413, "File size must be 8 MB or less")
    if not data:
        raise HTTPException(422, "The uploaded file is empty")
    extension = os.path.splitext(name)[1].lower()
    if extension not in SUPPORTED_DOCUMENT_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_DOCUMENT_EXTENSIONS))
        raise HTTPException(415, f"Unsupported file type. Supported formats: {supported}")
    try:
        content = extract_document_text(extension, data)
    except ValueError as exc:
        raise HTTPException(422, f"Could not read {extension} document: {exc}") from exc
    status = "Indexed" if content.strip() else "No searchable text"
    document = Document(name=name, category="Uploaded", content=content, status=status)
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    document = db.get(Document, document_id)
    if not document:
        raise HTTPException(404, "Document not found")
    db.delete(document)
    db.commit()
    return {"deleted": True}


@app.get("/api/knowledge/search")
def search_knowledge(q: str, db: Session = Depends(get_db)):
    terms = [term.lower() for term in q.split() if len(term) > 2]
    documents = list(db.scalars(select(Document)))
    results = []
    for doc in documents:
        content = doc.content.lower()
        score = sum(content.count(term) for term in terms)
        if score:
            results.append({"id": doc.id, "name": doc.name, "snippet": doc.content[:300], "score": score})
    return sorted(results, key=lambda item: item["score"], reverse=True)[:5]


@app.post("/api/ai/respond")
async def ai_respond(payload: AIInput, db: Session = Depends(get_db)):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI is not configured. Add GEMINI_API_KEY to your .env file and restart the server.")
    query_terms = {
        term.strip(".,!?;:()[]{}\"'").lower()
        for term in payload.message[:20000].split()
        if len(term.strip(".,!?;:()[]{}\"'")) > 3
    }
    candidates = list(db.scalars(select(Document).order_by(Document.created_at.desc()).limit(50)))
    ranked = sorted(
        candidates,
        key=lambda doc: sum(doc.content.lower().count(term) for term in query_terms),
        reverse=True,
    )
    relevant = [doc for doc in ranked if any(term in doc.content.lower() for term in query_terms)][:3]
    context_docs = relevant or candidates[:3]
    context = "\n\n".join(f"{doc.name}: {doc.content[:1200]}" for doc in context_docs)
    saved_personality = db.get(AppSetting, "personality")
    personality = saved_personality.value if saved_personality else (
        "You are a warm, curious, professional sales assistant. Ask one thoughtful discovery question at a time."
    )
    saved_name = db.get(AppSetting, "agent_name")
    system_prompt = (
        f"You are {saved_name.value if saved_name else 'Nexora'}, a concise sales voice agent. "
        f"{personality} Never invent product facts. Use this company knowledge when relevant:\n{context}"
    )
    if payload.task == "analyze":
        task_prompt = (
            "Analyze the conversation transcript below. Return ONLY a JSON object with the fields "
            '"summary" (brief factual summary), "sentiment" (Positive, Neutral, or Negative), '
            '"requirements" (comma-separated needs), "next_action" (one actionable follow-up), '
            '"lead_score" (integer 0-100). Do not infer facts not present in the transcript.\n\n'
            f"Transcript:\n{payload.message}"
        )
        contents = [{"role": "user", "parts": [{"text": task_prompt}]}]
    else:
        contents = []
        prior_messages = payload.history[:-1] if payload.history and payload.history[-1].get("text") == payload.message else payload.history
        for item in prior_messages[-12:]:
            text = str(item.get("text", "")).strip()
            if text:
                contents.append({
                    "role": "model" if item.get("role") == "agent" else "user",
                    "parts": [{"text": text}],
                })
        contents.append({"role": "user", "parts": [{"text": payload.message}]})
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(
                endpoint,
                params={"key": api_key},
                json={"systemInstruction": {"parts": [{"text": system_prompt}]}, "contents": contents},
            )
            response.raise_for_status()
            body = response.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return {"text": text}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"AI provider returned HTTP {exc.response.status_code}. Check server configuration.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "AI provider request failed. Check server configuration and network access.") from exc
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(502, "AI provider returned an unexpected response.") from exc


@app.get("/api/settings")
def read_settings(db: Session = Depends(get_db)):
    return {setting.key: setting.value for setting in db.scalars(select(AppSetting))}


@app.put("/api/settings")
def write_settings(payload: SettingsInput, db: Session = Depends(get_db)):
    for key, value in payload.values.items():
        if "key" in key.lower() or "secret" in key.lower():
            continue
        existing = db.get(AppSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    db.commit()
    return read_settings(db)


@app.get("/api/profile")
def read_profile(db: Session = Depends(get_db)):
    defaults = {
        "name": "Jordan Davis",
        "email": "jordan@nexora.ai",
        "phone": "",
        "title": "Sales Administrator",
        "location": "",
        "bio": "Building smarter conversations with Nexora AI.",
        "interests": "[]",
        "photo_data": "",
    }
    profile = {}
    for key, default in defaults.items():
        setting = db.get(AppSetting, f"profile_{key}")
        profile[key] = setting.value if setting else default
    try:
        profile["interests"] = json.loads(profile["interests"])
    except ValueError:
        profile["interests"] = []
    return {
        "profile": profile,
        "stats": {
            "calls": db.scalar(select(func.count()).select_from(Conversation)) or 0,
            "qualified_leads": db.scalar(select(func.count()).select_from(Lead).where(Lead.score >= 70)) or 0,
            "appointments": db.scalar(select(func.count()).select_from(Appointment).where(Appointment.status != "Cancelled")) or 0,
        },
    }


@app.put("/api/profile")
def write_profile(payload: ProfileInput, db: Session = Depends(get_db)):
    values = payload.model_dump()
    values["interests"] = json.dumps(values["interests"])
    for key, value in values.items():
        setting_key = f"profile_{key}"
        setting = db.get(AppSetting, setting_key)
        if setting:
            setting.value = value
        else:
            db.add(AppSetting(key=setting_key, value=value))
    db.commit()
    return read_profile(db)


@app.get("/api/analytics")
def analytics(db: Session = Depends(get_db)):
    leads = list(db.scalars(select(Lead)))
    conversations = list(db.scalars(select(Conversation)))
    appointments = list(db.scalars(select(Appointment)))
    total = len(conversations)
    qualified = sum(lead.score >= 70 for lead in leads)
    return {
        "total_calls": total,
        "successful": sum(call.sentiment == "Positive" for call in conversations),
        "qualified_leads": qualified,
        "appointments": len(appointments),
        "conversion_rate": round(qualified / len(leads) * 100) if leads else 0,
        "average_duration": round(sum(call.duration for call in conversations) / total) if total else 0,
        "sentiment": {
            "Positive": sum(call.sentiment == "Positive" for call in conversations),
            "Neutral": sum(call.sentiment == "Neutral" for call in conversations),
            "Negative": sum(call.sentiment == "Negative" for call in conversations),
        },
    }


app.mount("/", StaticFiles(directory="static", html=True), name="static")
