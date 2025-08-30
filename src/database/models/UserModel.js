const prisma = require('../prisma');

class UserModel {
    static async createUser(data) {
        try {
            return await prisma.getClient().user.create({
                data,
                include: {
                    role: true
                }
            });
        } catch (error) {
            console.error('USER CREATION ERROR', error);
            throw error;
        }
    }

    static async getAllUsers() {
        try {
            return await prisma.getClient().user.findMany({
                include: {
                    role: true
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING USERS', error);
            throw error;
        }
    }

    static async getUserByPhone(phone) {
        try {
            
            const prismaClient = prisma.getClient();
            
            const user = await prismaClient.user.findUnique({
                where: { phone },
                include: {
                    role: true
                }
            });
            
            return user;
        } catch (error) {
            console.error('❌ ERROR FETCHING USER BY PHONE:', error);
            console.error('❌ Error stack:', error.stack);
            throw error;
        }
    }

    static async getUserById(id) {
        try {
            return await prisma.getClient().user.findUnique({
                where: { id: parseInt(id) },
                include: {
                    role: true
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING USER BY ID', error);
            throw error;
        }
    }

    static async updateUser(phone, data) {
        try {
            return await prisma.getClient().user.update({
                where: { phone },
                data,
                include: {
                    role: true
                }
            });
        } catch (error) {
            console.error('ERROR UPDATING USER', error);
            throw error;
        }
    }

    static async deleteUser(phone) {
        try {
            return await prisma.getClient().user.delete({
                where: { phone }
            });
        } catch (error) {
            console.error('ERROR DELETING USER', error);
            throw error;
        }
    }
}

module.exports = UserModel;