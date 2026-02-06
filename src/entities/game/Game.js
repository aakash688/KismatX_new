// Game Entity
// Stores each 5-minute game session

import { EntitySchema } from "typeorm";

const Game = new EntitySchema({
  name: "Game",
  tableName: "games",
  columns: {
    id: {
      primary: true,
      type: "bigint",
      generated: true,
    },
    game_id: {
      type: "varchar",
      length: 50,
      unique: true,
      nullable: false,
    },
    start_time: {
      type: "datetime",
      nullable: false,
    },
    end_time: {
      type: "datetime",
      nullable: false,
    },
    status: {
      type: "enum",
      enum: ["pending", "active", "completed"],
      default: "pending",
    },
    winning_card: {
      type: "tinyint",
      nullable: true,
      comment: "Winning card number (1-12)",
    },
    payout_multiplier: {
      type: "decimal",
      precision: 5,
      scale: 2,
      default: 10.00,
      comment: "Payout multiplier for winning bets",
    },
    settlement_status: {
      type: "enum",
      enum: ["not_settled", "settling", "settled", "failed"],
      default: "not_settled",
    },
    settlement_started_at: {
      type: "datetime",
      nullable: true,
    },
    settlement_completed_at: {
      type: "datetime",
      nullable: true,
    },
    settlement_error: {
      type: "text",
      nullable: true,
    },
    created_at: {
      type: "datetime",
      default: () => "CURRENT_TIMESTAMP",
    },
    updated_at: {
      type: "datetime",
      default: () => "CURRENT_TIMESTAMP",
      onUpdate: "CURRENT_TIMESTAMP",
    },
  },
  indices: [
    {
      name: "idx_settlement",
      columns: ["settlement_status", "game_id"],
    },
    {
      name: "idx_status",
      columns: ["status"],
    },
    {
      name: "idx_time_range",
      columns: ["start_time", "end_time"],
    },
  ],
});

export default Game;


