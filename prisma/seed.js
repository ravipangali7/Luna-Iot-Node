const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting permission seeding...');
  
  // Test database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return;
  }

  // Define the permissions that were previously in the enum
  const permissions = [
    // Device permissions
    { name: 'DEVICE_READ', description: 'Read device information' },
    { name: 'DEVICE_CREATE', description: 'Create new devices' },
    { name: 'DEVICE_UPDATE', description: 'Update device information' },
    { name: 'DEVICE_DELETE', description: 'Delete devices' },

    // Vehicle permissions
    { name: 'VEHICLE_READ', description: 'Read vehicle information' },
    { name: 'VEHICLE_CREATE', description: 'Create new vehicles' },
    { name: 'VEHICLE_UPDATE', description: 'Update vehicle information' },
    { name: 'VEHICLE_DELETE', description: 'Delete vehicles' },

    // Location permissions
    { name: 'LOCATION_READ', description: 'Read location data' },
    { name: 'LOCATION_HISTORY', description: 'Access location history' },

    // Status permissions
    { name: 'STATUS_READ', description: 'Read device status' },
    { name: 'STATUS_HISTORY', description: 'Access status history' },

    // User management permissions
    { name: 'USER_READ', description: 'Read user information' },
    { name: 'USER_CREATE', description: 'Create new users' },
    { name: 'USER_UPDATE', description: 'Update user information' },
    { name: 'USER_DELETE', description: 'Delete users' },

    // Role management permissions
    { name: 'ROLE_READ', description: 'Read role information' },
    { name: 'ROLE_CREATE', description: 'Create new roles' },
    { name: 'ROLE_UPDATE', description: 'Update role information' },
    { name: 'ROLE_DELETE', description: 'Delete roles' },

    // System permissions
    { name: 'SYSTEM_ADMIN', description: 'Full system administration access' },
    { name: 'DEVICE_MONITORING', description: 'Monitor device status and location' },
    { name: 'LIVE_TRACKING', description: 'Access live tracking features' },

    // Additional permissions
    { name: 'BLOOD_DONATION', description: 'Manage blood donation requests' },
    { name: 'NOTIFICATION_SEND', description: 'Send notifications to users' },
    { name: 'GEOFENCE_MANAGE', description: 'Manage geofences' },
    { name: 'POPUP_MANAGE', description: 'Manage popup messages' },
  ];

  // Create permissions
  for (const permission of permissions) {
    try {
      await prisma.permission.upsert({
        where: { name: permission.name },
        update: permission,
        create: permission,
      });
      console.log(`✅ Created/Updated permission: ${permission.name}`);
    } catch (error) {
      console.error(`❌ Error creating permission ${permission.name}:`, error.message);
    }
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
