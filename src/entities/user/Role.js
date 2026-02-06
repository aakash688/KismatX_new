// Role Entity
// Defines user roles and permissions

import { EntitySchema } from "typeorm";

const Role = new EntitySchema({
  name: "Roles",
  tableName: "roles",
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
    users: {
      target: "User",
      type: "many-to-many",
      inverseSide: "roles"
    },
    permissions: {
      target: "Permission",
      type: "many-to-many",
      joinTable: {
        name: "role_permissions",
        joinColumn: {
          name: "role_id",
          referencedColumnName: "id"
        },
        inverseJoinColumn: {
          name: "permission_id",
          referencedColumnName: "id"
        }
      }
    }
  }
});

export default Role;
