const prisma = require('../prisma');

class PermissionModel {
    async getAllPermissions() {
        try {
            return await prisma.getClient().permission.findMany({
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING PERMISSIONS', error);
            throw error;
        }
    }

    async getPermissionById(id) {
        try {
            return await prisma.getClient().permission.findUnique({
                where: { id },
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING PERMISSION BY ID', error);
            throw error;
        }
    }

    async createPermission(permissionData) {
        try {
            return await prisma.getClient().permission.create({
                data: {
                    name: permissionData.name,
                    description: permissionData.description || null,
                },
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR CREATING PERMISSION', error);
            throw error;
        }
    }

    async updatePermission(id, permissionData) {
        try {
            return await prisma.getClient().permission.update({
                where: { id },
                data: {
                    name: permissionData.name,
                    description: permissionData.description || null,
                },
                include: {
                    roles: {
                        include: {
                            role: true
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR UPDATING PERMISSION', error);
            throw error;
        }
    }

    async deletePermission(id) {
        try {
            return await prisma.getClient().permission.delete({
                where: { id }
            });
        } catch (error) {
            console.error('ERROR DELETING PERMISSION', error);
            throw error;
        }
    }
}

module.exports = PermissionModel;