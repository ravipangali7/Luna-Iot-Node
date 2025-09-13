const prisma = require('../prisma');

class UserPermissionModel {
    // Assign permission to user
    async assignPermissionToUser(userId, permissionId) {
        try {
            const userPermission = await prisma.getClient().userPermission.create({
                data: {
                    userId: userId,
                    permissionId: permissionId
                },
                include: {
                    permission: true,
                    user: {
                        include: {
                            role: true
                        }
                    }
                }
            });
            return userPermission;
        } catch (error) {
            console.error('Error assigning permission to user:', error);
            throw error;
        }
    }

    // Remove permission from user
    async removePermissionFromUser(userId, permissionId) {
        try {
            const result = await prisma.getClient().userPermission.deleteMany({
                where: {
                    userId: userId,
                    permissionId: permissionId
                }
            });
            return result.count > 0;
        } catch (error) {
            console.error('Error removing permission from user:', error);
            throw error;
        }
    }

    // Get all permissions for a user
    async getUserPermissions(userId) {
        try {
            const userPermissions = await prisma.getClient().userPermission.findMany({
                where: { userId: userId },
                include: {
                    permission: true
                }
            });
            return userPermissions;
        } catch (error) {
            console.error('Error getting user permissions:', error);
            throw error;
        }
    }

    // Get all users with a specific permission
    async getUsersWithPermission(permissionId) {
        try {
            const userPermissions = await prisma.getClient().userPermission.findMany({
                where: { permissionId: permissionId },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    },
                    permission: true
                }
            });
            return userPermissions;
        } catch (error) {
            console.error('Error getting users with permission:', error);
            throw error;
        }
    }

    // Check if user has specific permission
    async userHasPermission(userId, permissionName) {
        try {
            const userPermission = await prisma.getClient().userPermission.findFirst({
                where: {
                    userId: userId,
                    permission: {
                        name: permissionName
                    }
                }
            });
            return !!userPermission;
        } catch (error) {
            console.error('Error checking user permission:', error);
            throw error;
        }
    }

    // Get user with all permissions (role + direct permissions)
    async getUserWithAllPermissions(userId) {
        try {
            const user = await prisma.getClient().user.findUnique({
                where: { id: userId },
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true
                                }
                            }
                        }
                    },
                    userPermissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            });
            return user;
        } catch (error) {
            console.error('Error getting user with all permissions:', error);
            throw error;
        }
    }

    // Bulk assign permissions to user
    async assignMultiplePermissionsToUser(userId, permissionIds) {
        try {
            const userPermissions = permissionIds.map(permissionId => ({
                userId: userId,
                permissionId: permissionId
            }));

            const result = await prisma.getClient().userPermission.createMany({
                data: userPermissions,
                skipDuplicates: true
            });
            return result;
        } catch (error) {
            console.error('Error assigning multiple permissions to user:', error);
            throw error;
        }
    }

    // Remove all permissions from user
    async removeAllPermissionsFromUser(userId) {
        try {
            const result = await prisma.getClient().userPermission.deleteMany({
                where: { userId: userId }
            });
            return result.count;
        } catch (error) {
            console.error('Error removing all permissions from user:', error);
            throw error;
        }
    }

    // Get all permissions (for dropdown/selection)
    async getAllPermissions() {
        try {
            const permissions = await prisma.getClient().permission.findMany({
                orderBy: { name: 'asc' }
            });
            return permissions;
        } catch (error) {
            console.error('Error getting all permissions:', error);
            throw error;
        }
    }

    // Check if user has any of the specified permissions
    async userHasAnyPermission(userId, permissionNames) {
        try {
            const userPermissions = await prisma.getClient().userPermission.findMany({
                where: {
                    userId: userId,
                    permission: {
                        name: {
                            in: permissionNames
                        }
                    }
                }
            });
            return userPermissions.length > 0;
        } catch (error) {
            console.error('Error checking user has any permission:', error);
            throw error;
        }
    }

    // Get combined permissions (role + direct user permissions)
    async getCombinedUserPermissions(userId) {
        try {
            const user = await this.getUserWithAllPermissions(userId);
            if (!user) return [];

            const rolePermissions = user.role.permissions.map(rp => rp.permission.name);
            const directPermissions = user.userPermissions.map(up => up.permission.name);
            
            // Combine and deduplicate
            const allPermissions = [...new Set([...rolePermissions, ...directPermissions])];
            return allPermissions;
        } catch (error) {
            console.error('Error getting combined user permissions:', error);
            throw error;
        }
    }
}

module.exports = UserPermissionModel;
