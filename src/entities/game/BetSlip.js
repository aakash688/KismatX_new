// BetSlip Entity
// One slip per user betting action, contains barcode and total bet info

import { EntitySchema } from "typeorm";

const BetSlip = new EntitySchema({
  name: "BetSlip",
  tableName: "bet_slips",
  columns: {
    id: {
      primary: true,
      type: "bigint",
      generated: true,
    },
    slip_id: {
      type: "varchar",
      length: 36,
      unique: true,
      nullable: false,
      comment: "UUID v4",
    },
    user_id: {
      type: "bigint",
      nullable: false,
    },
    game_id: {
      type: "varchar",
      length: 50,
      nullable: false,
    },
    total_amount: {
      type: "decimal",
      precision: 18,
      scale: 2,
      nullable: false,
      comment: "Sum of all bets in this slip",
    },
    barcode: {
      type: "varchar",
      length: 255,
      unique: true,
      nullable: false,
      comment: "Barcode for slip verification",
    },
    payout_amount: {
      type: "decimal",
      precision: 18,
      scale: 2,
      default: 0.00,
      comment: "Sum of winnings for this slip",
    },
    status: {
      type: "enum",
      enum: ["pending", "won", "lost", "settled"],
      default: "pending",
      comment: "Indicates payout status",
    },
    claimed: {
      type: "boolean",
      default: false,
    },
    claimed_at: {
      type: "datetime",
      nullable: true,
    },
    idempotency_key: {
      type: "varchar",
      length: 255,
      unique: true,
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
      name: "idx_user_game",
      columns: ["user_id", "game_id"],
    },
    {
      name: "idx_claim",
      columns: ["game_id", "claimed"],
    },
    {
      name: "idx_idempotency",
      columns: ["idempotency_key"],
    },
    {
      name: "idx_barcode",
      columns: ["barcode"],
    },
  ],
  relations: {
    user: {
      target: "User",
      type: "many-to-one",
      joinColumn: {
        name: "user_id",
        referencedColumnName: "id",
      },
    },
    game: {
      target: "Game",
      type: "many-to-one",
      joinColumn: {
        name: "game_id",
        referencedColumnName: "game_id",
      },
    },
    betDetails: {
      target: "BetDetail",
      type: "one-to-many",
      inverseSide: "betSlip",
    },
  },
});

export default BetSlip;


