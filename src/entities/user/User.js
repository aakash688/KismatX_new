// User Entity
// Defines the user table structure and relationships

import { EntitySchema } from "typeorm";

const User = new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    user_id: {
      type: "varchar",
      length: 100,
      unique: true,
      nullable: false,
    },
    first_name: {
      type: "varchar",
      length: 100,
      nullable: false,
    },
    last_name: {
      type: "varchar",
      length: 100,
      nullable: false,
    },
    mobile: {
      type: "varchar",
      length: 15,
      unique: true,
      nullable: false,
    },
    alternate_mobile: {
      type: "varchar",
      length: 15,
      nullable: true,
    },
    email: {
      type: "varchar",
      length: 150,
      unique: true,
      nullable: false,
    },
    address: {
      type: "text",
      nullable: true,
    },
    city: {
      type: "varchar",
      length: 100,
      nullable: true,
    },
    state: {
      type: "varchar",
      length: 100,
      nullable: true,
    },
    pin_code: {
      type: "varchar",
      length: 10,
      nullable: true,
    },
    region: {
      type: "varchar",
      length: 100,
      nullable: true,
    },
    status: {
      type: "enum",
      enum: ["active", "inactive", "banned"],
      default: "active",
    },
    deposit_amount: {
      type: "decimal",
      precision: 10,
      scale: 2,
      default: 0.00,
    },
    profile_pic: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    password_hash: {
      type: "text",
      nullable: false,
    },
    password_salt: {
      type: "text",
      nullable: false,
    },
    user_type: {
      type: "enum",
      enum: ["player", "admin", "moderator"],
      default: "player",
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
    last_login: {
      type: "datetime",
      nullable: true,
    },
    email_verified: {
      type: "boolean",
      default: false,
    },
    mobile_verified: {
      type: "boolean",
      default: false,
    },
    is_email_verified_by_admin: {
      type: "boolean",
      default: false,
    },
    is_mobile_verified_by_admin: {
      type: "boolean",
      default: false,
    },
  },
  relations: {
    roles: {
      target: "Roles", // references the Roles entity
      type: "many-to-many",
      joinTable: {
        name: "user_roles", // custom join table name
        joinColumn: {
          name: "user_id", // column in join table referencing User
          referencedColumnName: "id"
        },
        inverseJoinColumn: {
          name: "role_id", // column in join table referencing Role
          referencedColumnName: "id"
        }
      },
      inverseSide: "users" // property defined in Roles entity
    }
  }
});

export default User;

