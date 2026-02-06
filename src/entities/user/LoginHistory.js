// Login History Entity
// Tracks user login sessions and security events

import { EntitySchema } from "typeorm";

const LoginHistory = new EntitySchema({
  name: "LoginHistory",
  tableName: "login_history",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    user_id: {
      type: "int",
      nullable: true,
    },
    login_time: {
      type: "datetime",
      default: () => "CURRENT_TIMESTAMP",
    },
    ip_address: {
      type: "varchar",
      length: 45,
      nullable: true,
    },
    device_info: {
      type: "text",
      nullable: true,
    },
    user_agent: {
      type: "text",
      nullable: true,
    },
    login_method: {
      type: "varchar",
      length: 50,
      nullable: true,
    },
    is_successful: {
      type: "boolean",
      default: true,
    },
    failure_reason: {
      type: "varchar",
      length: 255,
      nullable: true,
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

export default LoginHistory;

