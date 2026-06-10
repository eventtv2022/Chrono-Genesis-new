import express, { type Express } from "express";
import cors from "cors";
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

// Serve generated TV media files (MP4) at /media/*
// Placed after /api to avoid conflicts
app.use("/media", express.static(MEDIA_DIR, {
  maxAge: "1d",
  setHeaders(res) {
    res.setHeader("Content-Type", "video/mp4");
  },
}));

export default app;
