// Audit Log Entity
// Tracks all user and admin actions for compliance and security

import { EntitySchema } from "typeorm";

const AuditLog = new EntitySchema({
  name: "AuditLog",
  tableName: "audit_logs",
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
    admin_id: {
      type: "int",
      nullable: true,
    },
    action: {
      type: "varchar",
      length: 255,
      nullable: false,
    },
    target_type: {
      type: "varchar",
      length: 255,
      nullable: true,
    },
    target_id: {
      type: "int",
      nullable: true,
    },
    details: {
      type: "text",
      nullable: true,
    },
    ip_address: {
      type: "varchar",
      length: 45,
      nullable: true,
    },
    user_agent: {
      type: "text",
      nullable: true,
    },
    created_at: {
      type: "datetime",
      default: () => "CURRENT_TIMESTAMP",
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
      nullable: true,
    },
    admin: {
      target: "User",
      type: "many-to-one",
      joinColumn: {
        name: "admin_id",
        referencedColumnName: "id"
      },
      nullable: true,
    }
  }
});

export default AuditLog;

