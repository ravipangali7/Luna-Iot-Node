const prisma = require('../prisma');

class RoleModel {

    async createRole(data) {
        try {
            return await prisma.getClient().role.create({
                data,
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ROLE CREATION ERROR', error);
            throw error;
        }
    }

    async getAllRoles() {
        try {
            return await prisma.getClient().role.findMany({
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    },
                    users: {
                        select: {
                            id: true,
                            name: true,
                            phone: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING ROLES', error);
            throw error;
        }
    }

    async getRoleById(id) {
        try {
            return await prisma.getClient().role.findUnique({
                where: { id },
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    },
                    users: {
                        select: {
                            id: true,
                            name: true,
                            phone: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING ROLE BY ID', error);
            throw error;
        }
    }

    async updateRole(id, data) {
        try {
            return await prisma.getClient().role.update({
                where: { id },
                data,
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR UPDATING ROLE', error);
            throw error;
        }
    }

    async deleteRole(id) {
        try {
            return await prisma.getClient().role.delete({
                where: { id }
            });
        } catch (error) {
            console.error('ERROR DELETING ROLE', error);
            throw error;
        }
    }

    async updateRolePermissions(roleId, permissionIds) {
        try {
            // First, remove all existing permissions
            await prisma.getClient().rolePermission.deleteMany({
                where: { roleId }
            });

            // Then add new permissions
            const rolePermissions = permissionIds.map(permissionId => ({
                roleId,
                permissionId
            }));

            await prisma.getClient().rolePermission.createMany({
                data: rolePermissions
            });

            return await this.getRoleById(roleId);
        } catch (error) {
            console.error('ERROR UPDATING ROLE PERMISSIONS', error);
            throw error;
        }
    }
}

module.exports = RoleModel;