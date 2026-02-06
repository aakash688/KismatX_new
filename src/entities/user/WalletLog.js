// WalletLog Entity
// Defines the wallet_logs table structure for transaction history

import { EntitySchema } from "typeorm";

const WalletLog = new EntitySchema({
  name: "WalletLog",
  tableName: "wallet_logs",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    user_id: {
      type: "int",
      nullable: false,
    },
    transaction_type: {
      type: "enum",
      enum: ["recharge", "withdrawal", "game"],
      nullable: false,
    },
    amount: {
      type: "decimal",
      precision: 10,
      scale: 2,
      nullable: false,
    },
    transaction_direction: {
      type: "enum",
      enum: ["credit", "debit"],
      nullable: false,
    },
    game_id: {
      type: "int",
      nullable: true,
    },
    comment: {
      type: "varchar",
      length: 500,
      nullable: true,
    },
    reference_type: {
      type: "varchar",
      length: 50,
      nullable: true,
      comment: "bet_placement, settlement, claim",
    },
    reference_id: {
      type: "varchar",
      length: 255,
      nullable: true,
      comment: "slip_id or game_id",
    },
    status: {
      type: "enum",
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    created_at: {
      type: "datetime",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  indices: [
    {
      name: "IDX_wallet_logs_user_id",
      columns: ["user_id"],
    },
    {
      name: "IDX_wallet_logs_transaction_type",
      columns: ["transaction_type"],
    },
    {
      name: "IDX_wallet_logs_created_at",
      columns: ["created_at"],
    },
    {
      name: "IDX_wallet_logs_user_created",
      columns: ["user_id", "created_at"],
    },
  ],
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "user_id",
        referencedColumnName: "id",
      },
    },
  },
});

export default WalletLog;

