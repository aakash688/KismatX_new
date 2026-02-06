// Postman Collection Generator
// Creates a comprehensive Postman collection for the KismatX API

import express from 'express';

const router = express.Router();

// Generate Postman Collection
router.get('/postman-collection', (req, res) => {
    const collection = {
        "info": {
            "name": "KismatX API Collection",
            "description": "Comprehensive RBAC-based Gaming Platform API",
            "version": "1.0.0",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        "auth": {
            "type": "bearer",
            "bearer": [
                {
                    "key": "token",
                    "value": "{{accessToken}}",
                    "type": "string"
                }
            ]
        },
        "variable": [
            {
                "key": "baseUrl",
                "value": "http://localhost:5001",
                "type": "string"
            },
            {
                "key": "accessToken",
                "value": "",
                "type": "string"
            },
            {
                "key": "refreshToken",
                "value": "",
                "type": "string"
            }
        ],
        "item": [
            {
                "name": "Authentication",
                "item": [
                    {
                        "name": "Register User",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "user_id": "player001",
                                    "first_name": "John",
                                    "last_name": "Doe",
                                    "email": "john.doe@example.com",
                                    "mobile": "1234567890",
                                    "password": "password123"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/auth/register",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "auth", "register"]
                            }
                        }
                    },
                    {
                        "name": "Login",
                        "event": [
                            {
                                "listen": "test",
                                "script": {
                                    "exec": [
                                        "if (pm.response.code === 200) {",
                                        "    const response = pm.response.json();",
                                        "    pm.collectionVariables.set('accessToken', response.accessToken);",
                                        "    pm.collectionVariables.set('refreshToken', response.refreshToken);",
                                        "}"
                                    ]
                                }
                            }
                        ],
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "email_or_mobile": "john.doe@example.com",
                                    "password": "password123"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/auth/login",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "auth", "login"]
                            }
                        }
                    },
                    {
                        "name": "Logout",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "refreshToken": "{{refreshToken}}"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/auth/logout",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "auth", "logout"]
                            }
                        }
                    },
                    {
                        "name": "Refresh Token",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "refreshToken": "{{refreshToken}}"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/auth/refresh-token",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "auth", "refresh-token"]
                            }
                        }
                    },
                    {
                        "name": "Forgot Password",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "email_or_mobile": "john.doe@example.com"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/auth/forgot-password",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "auth", "forgot-password"]
                            }
                        }
                    }
                ]
            },
            {
                "name": "User Management",
                "item": [
                    {
                        "name": "Get Profile",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/user/profile",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "user", "profile"]
                            }
                        }
                    },
                    {
                        "name": "Update Profile",
                        "request": {
                            "method": "PUT",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "first_name": "John Updated",
                                    "last_name": "Doe Updated",
                                    "city": "New York",
                                    "state": "NY"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/user/profile",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "user", "profile"]
                            }
                        }
                    },
                    {
                        "name": "Change Password",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "currentPassword": "password123",
                                    "newPassword": "newpassword123"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/user/change-password",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "user", "change-password"]
                            }
                        }
                    }
                ]
            },
            {
                "name": "Admin Panel",
                "item": [
                    {
                        "name": "Dashboard",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/dashboard",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "dashboard"]
                            }
                        }
                    },
                    {
                        "name": "Get All Users",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users?page=1&limit=10",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users"],
                                "query": [
                                    {
                                        "key": "page",
                                        "value": "1"
                                    },
                                    {
                                        "key": "limit",
                                        "value": "10"
                                    }
                                ]
                            }
                        }
                    },
                    {
                        "name": "Create User",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "user_id": "admin001",
                                    "first_name": "Admin",
                                    "last_name": "User",
                                    "email": "admin@example.com",
                                    "mobile": "9876543210",
                                    "password": "admin123",
                                    "user_type": "admin",
                                    "roles": [1]
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users"]
                            }
                        }
                    },
                    {
                        "name": "Get User by ID",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1"]
                            }
                        }
                    },
                    {
                        "name": "Update User",
                        "request": {
                            "method": "PUT",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "first_name": "Updated Name",
                                    "status": "active"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1"]
                            }
                        }
                    },
                    {
                        "name": "Change User Status",
                        "request": {
                            "method": "PUT",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "status": "banned"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/status",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "status"]
                            }
                        }
                    },
                    {
                        "name": "Reset User Password",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "newPassword": "newpassword123"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/reset-password",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "reset-password"]
                            }
                        }
                    },
                    {
                        "name": "Verify User Email",
                        "request": {
                            "method": "PUT",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/verify-email",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "verify-email"]
                            }
                        }
                    },
                    {
                        "name": "Verify User Mobile",
                        "request": {
                            "method": "PUT",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/verify-mobile",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "verify-mobile"]
                            }
                        }
                    },
                    {
                        "name": "Get User Login History",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/logins",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "logins"]
                            }
                        }
                    },
                    {
                        "name": "Get Audit Logs",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/audit-logs?page=1&limit=10",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "audit-logs"],
                                "query": [
                                    {
                                        "key": "page",
                                        "value": "1"
                                    },
                                    {
                                        "key": "limit",
                                        "value": "10"
                                    }
                                ]
                            }
                        }
                    }
                ]
            },
            {
                "name": "Role Management",
                "item": [
                    {
                        "name": "Create Role",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "name": "moderator",
                                    "description": "Game moderator role",
                                    "permissions": [1, 2, 3]
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/roles",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "roles"]
                            }
                        }
                    },
                    {
                        "name": "Get All Roles",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/roles",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "roles"]
                            }
                        }
                    },
                    {
                        "name": "Update Role",
                        "request": {
                            "method": "PUT",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "description": "Updated moderator role",
                                    "isActive": true
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/roles/1",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "roles", "1"]
                            }
                        }
                    },
                    {
                        "name": "Assign Permissions to Role",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "permission_ids": [1, 2, 3, 4]
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/roles/1/permissions",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "roles", "1", "permissions"]
                            }
                        }
                    },
                    {
                        "name": "Get Role Permissions",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/roles/1/permissions",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "roles", "1", "permissions"]
                            }
                        }
                    },
                    {
                        "name": "Assign Roles to User",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "role_ids": [1, 2]
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/roles",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "roles"]
                            }
                        }
                    },
                    {
                        "name": "Get User Roles",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/users/1/roles",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "users", "1", "roles"]
                            }
                        }
                    }
                ]
            },
            {
                "name": "Permission Management",
                "item": [
                    {
                        "name": "Create Permission",
                        "request": {
                            "method": "POST",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "name": "create_game",
                                    "description": "Create new game",
                                    "resource": "game",
                                    "action": "create"
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/permissions",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "permissions"]
                            }
                        }
                    },
                    {
                        "name": "Get All Permissions",
                        "request": {
                            "method": "GET",
                            "header": [],
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/permissions",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "permissions"]
                            }
                        }
                    },
                    {
                        "name": "Update Permission",
                        "request": {
                            "method": "PUT",
                            "header": [
                                {
                                    "key": "Content-Type",
                                    "value": "application/json"
                                }
                            ],
                            "body": {
                                "mode": "raw",
                                "raw": JSON.stringify({
                                    "description": "Updated permission description",
                                    "isActive": true
                                }, null, 2)
                            },
                            "url": {
                                "raw": "{{baseUrl}}/api/admin/permissions/1",
                                "host": ["{{baseUrl}}"],
                                "path": ["api", "admin", "permissions", "1"]
                            }
                        }
                    }
                ]
            }
        ]
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="KismatX-API-Collection.json"');
    res.json(collection);
});

export default router;

