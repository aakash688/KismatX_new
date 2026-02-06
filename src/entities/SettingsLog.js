// SettingsLog Entity
// Tracks all changes made to game settings for audit purposes

import { EntitySchema } from "typeorm";

const SettingsLog = new EntitySchema({
  name: "SettingsLog",
  tableName: "settings_logs",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    setting_key: {
      type: "varchar",
      length: 100,
      nullable: false,
    },
    previous_value: {
      type: "text",
      nullable: true,
    },
    new_value: {
      type: "text",
      nullable: false,
    },
    admin_id: {
      type: "int",
      nullable: false,
    },
    admin_user_id: {
      type: "varchar",
      length: 100,
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
  indices: [
    {
      name: "IDX_settings_logs_setting_key",
      columns: ["setting_key"],
    },
    {
      name: "IDX_settings_logs_admin_id",
      columns: ["admin_id"],
    },
    {
      name: "IDX_settings_logs_created_at",
      columns: ["created_at"],
    },
    {
      name: "IDX_settings_logs_key_created",
      columns: ["setting_key", "created_at"],
    },
  ],
  relations: {
    admin: {
      type: "many-to-one",
      target: "User",
      joinColumn: {
        name: "admin_id",
        referencedColumnName: "id",
      },
    },
  },
});

export default SettingsLog;








