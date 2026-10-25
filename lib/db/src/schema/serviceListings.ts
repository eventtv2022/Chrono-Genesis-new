import { pgTable, serial, integer, text, timestamp, real } from "drizzle-orm/pg-core";
import { citizensTable } from "./citizens";

export const serviceListingsTable = pgTable("service_listings", {
  id: serial("id").primaryKey(),
  citizenId: integer("citizen_id").notNull().references(() => citizensTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  sourceLang: text("source_lang").notNull().default("ru"),
  titleEn: text("title_en"),
  categoryEn: text("category_en"),
  descriptionEn: text("description_en"),
  suggestedPriceDarmins: integer("suggested_price_darmins").notNull(),
  minuteRate: real("minute_rate").notNull().default(1),
  qualificationSummary: text("qualification_summary").notNull(),
  publicationFeeDarmins: integer("publication_fee_darmins").notNull().default(1),
  requestKey: text("request_key").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
