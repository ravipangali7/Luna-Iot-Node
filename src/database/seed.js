const prisma = require('./prisma')

async function seed() {

    try {
        console.log('Starting database seeding.....');

        // Permissions
        const permissions = [
            // Device permissions
            { name: 'DEVICE_READ', description: 'Can view devices' },
            { name: 'DEVICE_CREATE', description: 'Can create devices' },
            { name: 'DEVICE_UPDATE', description: 'Can update devices' },
            { name: 'DEVICE_DELETE', description: 'Can delete devices' },

            // Vehicle permissions
            { name: 'VEHICLE_READ', description: 'Can view vehicles' },
            { name: 'VEHICLE_CREATE', description: 'Can create vehicles' },
            { name: 'VEHICLE_UPDATE', description: 'Can update vehicles' },
            { name: 'VEHICLE_DELETE', description: 'Can delete vehicles' },

            // Location permissions
            { name: 'LOCATION_READ', description: 'Can view locations' },
            { name: 'LOCATION_HISTORY', description: 'Can view location history' },

            // Status permissions
            { name: 'STATUS_READ', description: 'Can view device status' },
            { name: 'STATUS_HISTORY', description: 'Can view status history' },

            // User management permissions
            { name: 'USER_READ', description: 'Can view users' },
            { name: 'USER_CREATE', description: 'Can create users' },
            { name: 'USER_UPDATE', description: 'Can update users' },
            { name: 'USER_DELETE', description: 'Can delete users' },

            // Role management permissions
            { name: 'ROLE_READ', description: 'Can view roles' },
            { name: 'ROLE_CREATE', description: 'Can create roles' },
            { name: 'ROLE_UPDATE', description: 'Can update roles' },
            { name: 'ROLE_DELETE', description: 'Can delete roles' },

            // System permissions
            { name: 'SYSTEM_ADMIN', description: 'Full system access' },
            { name: 'DEVICE_MONITORING', description: 'Can monitor devices' },
        ];

        console.log('📝 Creating permissions...');
        for (const permission of permissions) {
            await prisma.getClient().permission.upsert({
                where: { name: permission.name },
                update: {},
                create: permission
            });
        }

        // 2. Create Roles
        const roles = [
            {
                name: 'Super Admin',
                description: 'Full system access with all permissions',
                permissions: permissions.map(p => p.name) // All permissions
            },
            {
                name: 'Dealer',
                description: 'Dealer access with most permissions',
                permissions: [
                    'DEVICE_READ',
                    'VEHICLE_READ', 'VEHICLE_CREATE', 'VEHICLE_UPDATE',
                    'LOCATION_READ', 'LOCATION_HISTORY',
                    'STATUS_READ', 'STATUS_HISTORY',
                ]
            },
            {
                name: 'Customer',
                description: 'Read-only access',
                permissions: [
                    'VEHICLE_READ', 'VEHICLE_CREATE', 'VEHICLE_UPDATE',
                    'LOCATION_READ', 'LOCATION_HISTORY',
                    'STATUS_READ', 'STATUS_HISTORY',
                ]
            }
        ];

        console.log('👥 Creating roles...');
        for (const role of roles) {
            const { permissions: permissionNames, ...roleData } = role;

            const createdRole = await prisma.getClient().role.upsert({
                where: { name: roleData.name },
                update: {},
                create: roleData
            });

            // Assign permissions to role
            for (const permissionName of permissionNames) {
                const permission = await prisma.getClient().permission.findUnique({
                    where: { name: permissionName }
                });

                if (permission) {
                    await prisma.getClient().rolePermission.upsert({
                        where: {
                            roleId_permissionId: {
                                roleId: createdRole.id,
                                permissionId: permission.id
                            }
                        },
                        update: {},
                        create: {
                            roleId: createdRole.id,
                            permissionId: permission.id
                        }
                    });
                }
            }

            // 3. Create Super Admin User
            console.log('👤 Creating super admin user...');
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('nepal', 12);
            const superAdminRole = await prisma.getClient().role.findUnique({
                where: { name: 'Super Admin' }
            });

            await prisma.getClient().user.upsert({
                where: { phone: '977' },
                update: {},
                create: {
                    name: 'Super Admin',
                    phone: '977',
                    password: hashedPassword,
                    roleId: superAdminRole.id,
                    status: 'ACTIVE'
                }
            });

            console.log('✅ Database seeded successfully!');
            console.log('📋 Available roles:');
            const allRoles = await prisma.getClient().role.findMany({
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            });

            allRoles.forEach(role => {
                console.log(`  - ${role.name}: ${role.permissions.length} permissions`);
            });
        }
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }

}


// Run the seed
if (require.main === module) {
    seed()
        .then(() => {
            console.log('🎉 Seed completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Seed failed:', error);
            process.exit(1);
        });
}

module.exports = { seed };