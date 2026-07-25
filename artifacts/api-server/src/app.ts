import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
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

app.use("/api", router);

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
const uploadsStaticOptions: Parameters<typeof express.static>[1] = {
  maxAge: "7d",
  acceptRanges: true,
  setHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Range",
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
  },
};

app.use("/api/uploads", express.static(UPLOADS_DIR, uploadsStaticOptions));
app.use("/uploads",     express.static(UPLOADS_DIR, uploadsStaticOptions));

export default app;
