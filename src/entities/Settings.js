// Settings Entity
// Defines the settings table structure for game configuration

import { EntitySchema } from "typeorm";

const Settings = new EntitySchema({
  name: "Settings",
  tableName: "settings",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    key: {
      type: "varchar",
      length: 255,
      unique: true,
      nullable: false,
    },
    value: {
      type: "text",
      nullable: false,
    },
    description: {
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
      name: "IDX_settings_key",
      columns: ["key"],
      unique: true,
    },
  ],
});

export default Settings;

