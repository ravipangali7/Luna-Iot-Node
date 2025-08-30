const { PrismaClient } = require('@prisma/client')

class PrismaService { 
    constructor () {
        this.prisma = new PrismaClient({
            // log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
            log: ['error'],
        });
    }

    async connect() {
        try {
            await this.prisma.$connect();
            console.log('PRISMA CLIENT CONNECTED');
        } catch (error) {
            console.error('PRISMA CLIENT CONNECTION ERROR', error);
            throw error;
        }
    }

    async disconnect() {
        try {
            await this.prisma.$disconnect();
            console.log('PRISMA CLIENT DISCONNECTED');
        } catch (error) {
            console.error('PRISMA CLIENT DISCONNECTION ERROR', error);
            throw error;
        }
    }

    getClient() {
        return this.prisma;
    }
}

// Create singleton instance
const prismaService = new PrismaService();

module.exports = prismaService;