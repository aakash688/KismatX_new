// Permission Entity
// Defines system permissions

import { EntitySchema } from "typeorm";

const Permission = new EntitySchema({
  name: "Permission",
  tableName: "permissions",
  columns: {
    id: {
      primary: true,
      type: "int",
      generated: true,
    },
    name: {
      type: "varchar",
      unique: true,
      nullable: false,
    },
    description: {
      type: "text",
      nullable: true,
    },
    resource: {
      type: "varchar",
      nullable: true,
    },
    action: {
      type: "varchar",
      nullable: true,
    },
    isActive: {
      type: "boolean",
      default: true,
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
    roles: {
      target: "Roles",
      type: "many-to-many",
      inverseSide: "permissions"
    }
  }
});

export default Permission;
