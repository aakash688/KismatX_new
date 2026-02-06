// RefreshToken Entity
// Manages refresh tokens for JWT authentication

import { EntitySchema } from "typeorm";

const RefreshToken = new EntitySchema({
  name: "RefreshToken",
  tableName: "refresh_tokens",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    token: {
      type: "varchar",
      unique: true,
      nullable: false,
    },
    expiresAt: {
      type: "datetime",
      nullable: false,
    },
    revoked: {
      type: "boolean",
      default: false,
    },
    createdAt: {
      type: "datetime",
      createDate: true,
    },
    updatedAt: {
      type: "datetime",
      updateDate: true,
    },
  },
  relations: {
    user: {
      target: "User",
      type: "many-to-one",
      joinColumn: {
        name: "user_id",
        referencedColumnName: "id"
      },
      onDelete: "CASCADE"
    }
  }
});

export default RefreshToken;
