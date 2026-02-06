// GameCardTotal Entity
// Aggregated bets per card for fast reporting and analytics

import { EntitySchema } from "typeorm";

const GameCardTotal = new EntitySchema({
  name: "GameCardTotal",
  tableName: "game_card_totals",
  columns: {
    id: {
      primary: true,
      type: "bigint",
      generated: true,
    },
    game_id: {
      type: "varchar",
      length: 50,
      nullable: false,
    },
    card_number: {
      type: "tinyint",
      nullable: false,
      comment: "Card number (1-12)",
    },
    total_bet_amount: {
      type: "decimal",
      precision: 18,
      scale: 2,
      default: 0.00,
      comment: "Total amount bet on this card in this game",
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
});

export default GameCardTotal;


