import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core"
import { districtEnum } from "./enums"

export const hospitals = pgTable("hospitals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  district: districtEnum("district").notNull(),
  location: text("location"),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
