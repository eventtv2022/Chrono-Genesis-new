import { pgTable, text, serial, integer, timestamp, real, boolean } from "drizzle-orm/pg-core";
// balance_minutes, total_given, total_received are `real` to support fractional Darmins (tax 2% = 0.02 Д on 1 Д)
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citizensTable = pgTable("citizens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  telegramId: text("telegram_id").unique(),
  walletAddress: text("wallet_address").unique(),
  walletNonce: text("wallet_nonce"),
  walletVerified: integer("wallet_verified").notNull().default(0),
  balanceMinutes: real("balance_minutes").notNull().default(1), // 1 Д при регистрации
  fiatDarminBalance: real("fiat_darmin_balance").notNull().default(0),
  timeXp: integer("time_xp").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  suspiciousActivity: boolean("suspicious_activity").notNull().default(false),
  lastTimeMatrixRewardAt: timestamp("last_time_matrix_reward_at", { withTimezone: true }),
  timeMatrixDigestSentOn: text("time_matrix_digest_sent_on"),
  focusQuizCorrectAnswers: integer("focus_quiz_correct_answers").notNull().default(0),
  referralBonusMinutes: real("referral_bonus_minutes").notNull().default(0), // Restricted in-network credit; never a cash balance
  // Historical rows retain their initial credit; new applications receive it on issuance.
  ancestralMinuteGranted: boolean("ancestral_minute_granted").notNull().default(true),
  totalGiven: real("total_given").notNull().default(0),
  totalReceived: real("total_received").notNull().default(0),
  status: text("status").notNull().default("active"),
  meritScore: real("merit_score").notNull().default(0),
  rank: text("rank").notNull().default("Гражданин"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  ageVerified: integer("age_verified").notNull().default(0),
  ageTier: text("age_tier"), // UNDER_13 is never persisted; TEEN/ADULT only after DOB check
  kycVerified: boolean("kyc_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // ── ICAO Doc 9303 Passport fields ──────────────────────────────────────────
  citizenNumber: text("citizen_number").unique(), // 000000001 … 999999999
  surname: text("surname"),
  givenNames: text("given_names"),
  dateOfBirth: text("date_of_birth"), // YYYY-MM-DD
  photoUrl: text("photo_url"),
  idCardUrl: text("id_card_url"), // filled when issued
  // 'pending' → 'issued' | 'rejected'. NULL = legacy citizen (treated as issued)
  registrationStatus: text("registration_status"),
  availableAt: timestamp("available_at", { withTimezone: true }), // NOW + 1h
  onboardingCompleted: boolean("onboarding_completed").notNull().default(true),
  onboardingStartedAt: timestamp("onboarding_started_at", { withTimezone: true }),

  // ── Registration contact & compliance fields ───────────────────────────────
  email: text("email"),                          // contact email (optional)
  seedThought: text("seed_thought"),             // kept for future use, not collected at registration
  privacyAgreementAccepted: integer("privacy_agreement_accepted").notNull().default(0),
  privacyAgreementDate: timestamp("privacy_agreement_date", { withTimezone: true }),
  signatureBase64: text("signature_base64"),

  // ── Password authentication ────────────────────────────────────────────────
  passwordHash: text("password_hash"),              // nullable — legacy citizens have no password
  resetPasswordToken: text("reset_password_token"), // random hex token for recovery
  resetPasswordExpires: timestamp("reset_password_expires", { withTimezone: true }), // token TTL

  // ── Session auth token ─────────────────────────────────────────────────────
  authToken: text("auth_token").unique("citizens_auth_token_key"), // random hex 32-byte token; generated on login

  // ── Government role ────────────────────────────────────────────────────────
  govRole: text("gov_role").notNull().default("citizen"),

  // ── Labor Deposit & Rate Auditor ───────────────────────────────────────────
  professionalSkills: text("professional_skills"),          // free-text: skills, certs, services
  calculatedMinuteRate: real("calculated_minute_rate").notNull().default(1.0), // Kq coefficient
  potentialLaborDepositedMinutes: integer("potential_labor_deposited_minutes").notNull().default(0), // 0–480
  laborDepositBonusGranted: boolean("labor_deposit_bonus_granted").notNull().default(false),
  skillsAuditedAt: timestamp("skills_audited_at", { withTimezone: true }),
  reviewScoreCount: integer("review_score_count").notNull().default(0), // учтённых отзывов для ИИ

  // ── Social Alarm ───────────────────────────────────────────────────────────
  socialAlarmConsent: integer("social_alarm_consent").notNull().default(0), // 1 = разрешено

  // ── Admin flag ─────────────────────────────────────────────────────────────
  isAdmin: integer("is_admin").notNull().default(0), // 1 = системный администратор

  // ── P2P Chat ───────────────────────────────────────────────────────────────
  chatPublicKey: text("chat_public_key"),        // base64 NaCl Curve25519 public key for E2EE DMs
  chatServerPrivateKey: text("chat_server_private_key"), // base64 server-generated private key (set only when backend auto-created the pair; cleared once user registers own key)

  // ── Paid Consultation ──────────────────────────────────────────────────────
  consultationRate: integer("consultation_rate").default(0), // Дарминов / 15 мин; 0 = бесплатно

  // ── Telegram personal notifications ────────────────────────────────────────
  telegramUsername: text("telegram_username"),              // @username for display
  tgBindToken: text("tg_bind_token"),                       // one-time token for deep-link binding (legacy)
  tgBindTokenExpires: timestamp("tg_bind_token_expires", { withTimezone: true }),
  telegramAuthCode: text("telegram_auth_code"),             // short-lived code for /start deep-link auth
  telegramAuthCodeExpiresAt: timestamp("telegram_auth_code_expires_at", { withTimezone: true }),
  tgNotifyDm: integer("tg_notify_dm").notNull().default(1),         // private messages
  tgNotifyCapsules: integer("tg_notify_capsules").notNull().default(1), // capsules & timeline
  tgNotifyMentions: integer("tg_notify_mentions").notNull().default(1), // @mentions in groups
  tgNotifyState: integer("tg_notify_state").notNull().default(1),   // state announcements
  tgNotifyAllGroups: integer("tg_notify_all_groups").notNull().default(0), // all group messages

  // ── Multi-channel communication preferences ─────────────────────────────
  whatsappPhone: text("whatsapp_phone"),        // WhatsApp contact number
  preferredChannels: text("preferred_channels"), // JSON array: ['email','telegram','whatsapp','sms','phone'] — ≥2 required

  // ── TON Wallet (Telegram Wallet / TON Connect) ───────────────────────────
  tonWalletAddress: text("ton_wallet_address"), // TON address in raw/user-friendly format (EQ…/UQ…)
});

export const insertCitizenSchema = createInsertSchema(citizensTable).omit({
  id: true,
  balanceMinutes: true,
  fiatDarminBalance: true,
  totalGiven: true,
  totalReceived: true,
  meritScore: true,
  rank: true,
  lastActivity: true,
  createdAt: true,
  walletAddress: true,
});
export type InsertCitizen = z.infer<typeof insertCitizenSchema>;
export type Citizen = typeof citizensTable.$inferSelect;
