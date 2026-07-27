/**
 * Admin Registry — База данных граждан с двухфакторной защитой.
 *
 * 2FA flow:
 *   1. POST /admin/registry/request-otp  (master-password check → OTP sent via TG + email)
 *   2. POST /admin/registry/verify        (master-password + OTP → 24h registry session token)
 *
 * All data endpoints require X-Registry-Token header.
 *
 *   GET  /admin/registry/users              — full citizen list
 *   GET  /admin/registry/users/:id          — single citizen profile (incl. photo + signature)
 *   POST /admin/registry/users/:id/action   — restart_emission | activate | block
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { citizensTable } from "@workspace/db";
import { eq, or, ilike, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { sendDirectMessage } from "../services/telegramService";
import { sendRegistryOtpEmail } from "../services/emailService";
import { logger } from "../lib/logger";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// In-memory stores
// ─────────────────────────────────────────────────────────────────────────────

interface RegistryOtp {
  otp: string;
  expiresAt: number;
}
const otpStore = new Map<number, RegistryOtp>(); // key = adminId

interface RegistrySession {
  adminId: number;
  expiresAt: number;
}
const sessionStore = new Map<string, RegistrySession>(); // key = token UUID

// Purge expired entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore)     if (now > v.expiresAt)     otpStore.delete(k);
  for (const [k, v] of sessionStore) if (now > v.expiresAt) sessionStore.delete(k);
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Middleware: verify registry session token
// ─────────────────────────────────────────────────────────────────────────────

function requireRegistrySession(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const token = req.headers["x-registry-token"] as string | undefined;
  if (!token) {
    res.status(403).json({ error: "X-Registry-Token required" });
    return;
  }
  const session = sessionStore.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessionStore.delete(token ?? "");
    res.status(403).json({ error: "Registry session expired or invalid. Re-authenticate." });
    return;
  }
  // Attach adminId for downstream use
  (req as import("express").Request & { registryAdminId?: number }).registryAdminId = session.adminId;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/request-otp
// Requires: regular admin auth + master password in body
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/request-otp",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { masterPassword } = req.body as { masterPassword?: string };

    const expected = process.env["ADMIN_SECRET_PASSWORD"];
    if (!expected) {
      res.status(500).json({ error: "ADMIN_SECRET_PASSWORD not configured on server" });
      return;
    }
    if (!masterPassword || masterPassword !== expected) {
      res.status(401).json({ error: "Неверный мастер-пароль" });
      return;
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(req.citizen!.id, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    // Deliver via Telegram (to ADMIN_TELEGRAM_ID env) + email
    const adminTgId = process.env["ADMIN_TELEGRAM_ID"] ?? "";
    const tgMsg =
      `🛡️ *TimeNation — Вход в Реестр Граждан*\n\n` +
      `Ваш OTP-код:\n\`${otp}\`\n\n` +
      `Действителен 5 минут. Никому не передавайте.`;

    const [tgSent, emailSent] = await Promise.allSettled([
      adminTgId ? sendDirectMessage(adminTgId, tgMsg) : Promise.resolve(false),
      sendRegistryOtpEmail(otp),
    ]);

    const tgOk = tgSent.status === "fulfilled" && tgSent.value;
    const emailOk = emailSent.status === "fulfilled" && emailSent.value;

    if (!tgOk && !emailOk) {
      // Fallback — log OTP so admin can find it in workflow logs
      logger.warn({ otp }, "Registry OTP: delivery failed — CODE LOGGED");
    }

    logger.info({ adminId: req.citizen!.id, tgOk, emailOk }, "Registry OTP requested");
    res.json({ ok: true, tgSent: tgOk, emailSent: emailOk });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/verify
// Requires: regular admin auth + master password + OTP
// Returns: { token } — 24h registry session token
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/verify",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const { masterPassword, otp } = req.body as { masterPassword?: string; otp?: string };

    const expected = process.env["ADMIN_SECRET_PASSWORD"];
    if (!expected) {
      res.status(500).json({ error: "ADMIN_SECRET_PASSWORD not configured" });
      return;
    }
    if (!masterPassword || masterPassword !== expected) {
      res.status(401).json({ error: "Неверный мастер-пароль" });
      return;
    }

    const record = otpStore.get(req.citizen!.id);
    if (!record) {
      res.status(400).json({ error: "OTP не запрошен или истёк. Нажмите «Запросить код»." });
      return;
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(req.citizen!.id);
      res.status(400).json({ error: "Срок действия OTP истёк. Запросите новый код." });
      return;
    }
    if (!otp || otp.trim() !== record.otp) {
      res.status(401).json({ error: "Неверный OTP-код." });
      return;
    }

    // Issue 24h session token
    otpStore.delete(req.citizen!.id);
    const token = randomUUID();
    sessionStore.set(token, {
      adminId: req.citizen!.id,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    logger.info({ adminId: req.citizen!.id }, "Registry session created");
    res.json({ ok: true, token });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/users
// Requires: X-Registry-Token
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/registry/users", requireRegistrySession, async (req, res): Promise<void> => {
  const { search, status } = req.query as { search?: string; status?: string };

  // Build query
  let query = db
    .select({
      id:                 citizensTable.id,
      name:               citizensTable.name,
      citizenNumber:      citizensTable.citizenNumber,
      rank:               citizensTable.rank,
      telegramId:         citizensTable.telegramId,
      telegramUsername:   citizensTable.telegramUsername,
      email:              citizensTable.email,
      whatsappPhone:      citizensTable.whatsappPhone,
      phone:              citizensTable.phone,
      registrationStatus: citizensTable.registrationStatus,
      status:             citizensTable.status,
      balanceMinutes:     citizensTable.balanceMinutes,
      isAdmin:            citizensTable.isAdmin,
      govRole:            citizensTable.govRole,
      availableAt:        citizensTable.availableAt,
      createdAt:          citizensTable.createdAt,
      lastActivity:       citizensTable.lastActivity,
      hasPhoto: sql<boolean>`(${citizensTable.photoUrl} IS NOT NULL)`.as("has_photo"),
      hasSignature: sql<boolean>`(${citizensTable.signatureBase64} IS NOT NULL)`.as("has_signature"),
    })
    .from(citizensTable);

  // Status filter
  const statusMap: Record<string, string> = {
    active:   "issued",
    rejected: "rejected",
    pending:  "pending",
    banned:   "banned",
  };
  if (status && status !== "all" && statusMap[status]) {
    if (status === "banned") {
      query = query.where(eq(citizensTable.status, "banned")) as typeof query;
    } else {
      query = query.where(eq(citizensTable.registrationStatus, statusMap[status]!)) as typeof query;
    }
  }

  const citizens = await query.orderBy(citizensTable.id);

  // Apply search filter in JS (simpler than complex SQL OR across text fields)
  const q = search?.toLowerCase().trim();
  const filtered = q
    ? citizens.filter(c =>
        String(c.id).includes(q) ||
        (c.name?.toLowerCase().includes(q)) ||
        (c.telegramId?.toLowerCase().includes(q)) ||
        (c.telegramUsername?.toLowerCase().includes(q)) ||
        (c.email?.toLowerCase().includes(q)) ||
        (c.citizenNumber?.toLowerCase().includes(q))
      )
    : citizens;

  res.json(filtered);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/registry/users/:id  — full profile (incl. photo + signature)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/registry/users/:id", requireRegistrySession, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [citizen] = await db
    .select({
      id:                 citizensTable.id,
      name:               citizensTable.name,
      citizenNumber:      citizensTable.citizenNumber,
      rank:               citizensTable.rank,
      telegramId:         citizensTable.telegramId,
      telegramUsername:   citizensTable.telegramUsername,
      email:              citizensTable.email,
      whatsappPhone:      citizensTable.whatsappPhone,
      phone:              citizensTable.phone,
      registrationStatus: citizensTable.registrationStatus,
      status:             citizensTable.status,
      balanceMinutes:     citizensTable.balanceMinutes,
      isAdmin:            citizensTable.isAdmin,
      govRole:            citizensTable.govRole,
      availableAt:        citizensTable.availableAt,
      createdAt:          citizensTable.createdAt,
      lastActivity:       citizensTable.lastActivity,
      photoUrl:           citizensTable.photoUrl,
      signatureBase64:    citizensTable.signatureBase64,
      meritScore:         citizensTable.meritScore,
      totalGiven:         citizensTable.totalGiven,
      totalReceived:      citizensTable.totalReceived,
    })
    .from(citizensTable)
    .where(eq(citizensTable.id, id))
    .limit(1);

  if (!citizen) { res.status(404).json({ error: "Citizen not found" }); return; }
  res.json(citizen);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/registry/users/:id/action
// Body: { action: "restart_emission" | "activate" | "block" }
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/registry/users/:id/action",
  requireRegistrySession,
  async (req, res): Promise<void> => {
    const id = parseInt(String(req.params["id"] ?? ""), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const { action } = req.body as { action?: string };
    if (!action) { res.status(400).json({ error: "action required" }); return; }

    const [citizen] = await db
      .select({ id: citizensTable.id, name: citizensTable.name, registrationStatus: citizensTable.registrationStatus })
      .from(citizensTable)
      .where(eq(citizensTable.id, id))
      .limit(1);

    if (!citizen) { res.status(404).json({ error: "Гражданин не найден" }); return; }

    const adminId = (req as import("express").Request & { registryAdminId?: number }).registryAdminId;

    if (action === "restart_emission") {
      const newAvailableAt = new Date(Date.now() + 60 * 60 * 1000);
      await db
        .update(citizensTable)
        .set({ registrationStatus: "pending", availableAt: newAvailableAt, status: "active" })
        .where(eq(citizensTable.id, id));
      logger.info({ adminId, citizenId: id }, "Admin: restart_emission");
      res.json({ ok: true, message: `Эмиссия перезапущена для ${citizen.name}` });

    } else if (action === "activate") {
      await db
        .update(citizensTable)
        .set({ registrationStatus: "issued", status: "active" })
        .where(eq(citizensTable.id, id));
      logger.info({ adminId, citizenId: id }, "Admin: manual activate");
      res.json({ ok: true, message: `${citizen.name} — паспорт активирован вручную` });

    } else if (action === "block") {
      await db
        .update(citizensTable)
        .set({ status: "banned" })
        .where(eq(citizensTable.id, id));
      logger.info({ adminId, citizenId: id }, "Admin: block citizen");
      res.json({ ok: true, message: `${citizen.name} — заблокирован` });

    } else {
      res.status(400).json({ error: `Unknown action: ${action}` });
    }
  }
);

export default router;
