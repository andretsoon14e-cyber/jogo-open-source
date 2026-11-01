import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  score: integer("score").notNull(),
  days: integer("days").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  difficulty: text("difficulty").notNull().default("dificil"),
  mode: text("mode").notNull().default("single"),
  outcome: text("outcome").notNull().default("morte"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  code: text("code").primaryKey(),
  seed: integer("seed").notNull(),
  difficulty: text("difficulty").notNull().default("dificil"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roomPlayers = pgTable("room_players", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  x: doublePrecision("x").notNull().default(0),
  y: doublePrecision("y").notNull().default(0),
  hp: integer("hp").notNull().default(100),
  score: integer("score").notNull().default(0),
  day: integer("day").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
