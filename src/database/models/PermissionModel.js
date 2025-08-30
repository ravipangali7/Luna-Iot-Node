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
}

module.exports = PermissionModel;