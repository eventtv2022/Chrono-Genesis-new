import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
import twaRouter from "./routes/twa";
import { logger } from "./lib/logger";
import { MEDIA_DIR } from "./services/renderService";

export const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: true,       // reflect request origin (works for all Replit preview domains)
    credentials: true,  // allow cookies/auth headers if ever needed
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);
// Raw body needed for Stripe webhook signature verification — must come before express.json()
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
// 10 MB limit to accept base64-encoded images in JSON bodies (chat messages)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Telegram WebApp HTML page ─────────────────────────────────────────────────
// Served at GET /twa — must come before /api router to avoid prefix conflicts.
app.get("/twa", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "twa.html"));
});

// ── TON Connect manifest — required for Telegram Wallet / TON Connect SDK ─────
// Must be served with explicit Content-Type and permissive CORS so the
// Telegram Wallet app can fetch it from any origin (including t.me frame).
app.get("/tonconnect-manifest.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(path.join(process.cwd(), "public", "tonconnect-manifest.json"));
});

// ── API routers ───────────────────────────────────────────────────────────────
app.use("/api", router);

// /api/v1 alias — exposes /api/v1/auth/telegram-webapp etc. per TWA spec
app.use("/api/v1", twaRouter);

// NOTE: citizen photos are stored in secure_vault/ (NOT served statically — privacy compliance)

// Serve generated TV media files (MP4) at /media/*
app.use("/media", express.static(MEDIA_DIR, {
  maxAge: "1d",
  setHeaders(res) {
    res.setHeader("Content-Type", "video/mp4");
  },
}));

// Serve uploads both at /api/uploads (routed by Replit proxy — paths=["/api"])
// and /uploads (fallback for same-origin / local dev).
// acceptRanges: true  — lets HTML5 <video>/<audio> and iOS/Android players stream
//                       via Range requests (206 Partial Content) instead of full download.
// setHeaders         — CORS must explicitly allow the Range header so browsers permit
//                       cross-origin media streaming (images forgive missing CORS; video doesn't).
// Explicit MIME map ensures HTML5 players receive the right Content-Type even if
// the OS mime database is missing a type (e.g. .m4a, .aac, .mov on some Linux builds).
const MEDIA_MIME: Record<string, string> = {
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
  ".mov":  "video/quicktime",
  ".mkv":  "video/x-matroska",
  ".m4v":  "video/x-m4v",
  ".3gp":  "video/3gpp",
  ".mp3":  "audio/mpeg",
  ".m4a":  "audio/mp4",
  ".aac":  "audio/aac",
  ".ogg":  "audio/ogg",
  ".wav":  "audio/wav",
  ".flac": "audio/flac",
};

const uploadsStaticOptions: Parameters<typeof express.static>[1] = {
  maxAge: "7d",
  acceptRanges: true,
  setHeaders(res, filePath) {
    // CORS — Range header must be allowed so cross-origin players can stream.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Range",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

    // Explicit Content-Type override for media files to avoid application/octet-stream
    // fall-through on some Linux mime-db builds.
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MEDIA_MIME[ext];
    if (mimeType) res.setHeader("Content-Type", mimeType);
  },
};

app.use("/api/uploads", express.static(UPLOADS_DIR, uploadsStaticOptions));
app.use("/uploads",     express.static(UPLOADS_DIR, uploadsStaticOptions));

export default app;
