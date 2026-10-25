import { pgTable, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

/**
 * Private, encrypted CV/portfolio uploads. File contents are never returned by
 * profile or catalog endpoints; only authenticated audit services decrypt them.
 */
export const citizenProfessionalDocumentsTable = pgTable("citizen_professional_documents", {
  citizenId: integer("citizen_id").primaryKey().references(() => citizensTable.id, { onDelete: "cascade" }),
  resumeFileName: text("resume_file_name"),
  resumeEncryptedData: text("resume_encrypted_data"),
  resumeUploadedAt: timestamp("resume_uploaded_at", { withTimezone: true }),
  portfolioFileName: text("portfolio_file_name"),
  portfolioEncryptedData: text("portfolio_encrypted_data"),
  portfolioUploadedAt: timestamp("portfolio_uploaded_at", { withTimezone: true }),
  resumeVisible: boolean("resume_visible").notNull().default(false),
  portfolioVisible: boolean("portfolio_visible").notNull().default(false),
  aiConsentAt: timestamp("ai_consent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
