import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { MEDIA_DIR } from "./services/renderService";

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
app.use(cors());
// Raw body needed for Stripe webhook signature verification — must come before express.json()
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve citizen avatar photos at /media/avatars/* (must come before /media)
app.use("/media/avatars", express.static(path.join(MEDIA_DIR, "avatars"), { maxAge: "7d" }));

// Serve generated TV media files (MP4) at /media/*
app.use("/media", express.static(MEDIA_DIR, {
  maxAge: "1d",
  setHeaders(res) {
    res.setHeader("Content-Type", "video/mp4");
  },
}));

export default app;
