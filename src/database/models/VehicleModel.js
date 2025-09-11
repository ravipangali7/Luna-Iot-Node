const datetimeService = require('../../utils/datetime_service');
const prisma = require('../prisma')
const { calculateDistanceFromLocationData } = require('../../utils/distance_service');

class VehicleModel {

    // Create new vehicle with user-vehicle relationship
    async createData(data, userId = null) {
        try {
            const nepalTime = datetimeService.nepalTimeDate();
            // Validate required fields
            if (!data.imei || !data.name || !data.vehicleNo || !data.vehicleType) {
                throw new Error('Missing required fields');
            }

            // Convert numeric fields to proper types
            const vehicleData = {
                imei: data.imei.toString(),
                name: data.name,
                vehicleNo: data.vehicleNo,
                vehicleType: data.vehicleType,
                odometer: parseFloat(data.odometer) || 0,
                mileage: parseFloat(data.mileage) || 0,
                minimumFuel: parseFloat(data.minimumFuel) || 0,
                speedLimit: parseInt(data.speedLimit) || 60,
                createdAt: nepalTime,
                updatedAt: nepalTime
            };

            const vehicle = await prisma.getClient().vehicle.create({
                data: vehicleData,
            });

            // Create user-vehicle relationship if userId is provided
            if (userId) {
                await this.createUserVehicleRelationship(userId, vehicle.id);
            }

            return vehicle;
        } catch (error) {
            console.error('VEHICLES CREATION ERROR', error);
            throw error;
        }
    }

    // Create user-vehicle relationship with ownership logic
    async createUserVehicleRelationship(userId, vehicleId) {
        try {
            const nepalTime = datetimeService.nepalTimeDate();
            await prisma.getClient().userVehicle.create({
                data: {
                    userId: userId,
                    vehicleId: vehicleId,
                    isMain: true,
                    allAccess: true,
                    liveTracking: true,
                    history: true,
                    report: true,
                    vehicleProfile: true,
                    events: true,
                    geofence: true,
                    edit: true,
                    shareTracking: true,
                    notification:true,
                    createdAt: nepalTime
                }
            });
        } catch (error) {
            console.error('USER VEHICLE RELATIONSHIP CREATION ERROR', error);
            throw error;
        }
    }

    // Get vehicle by IMEI
    async getDataByImei(imei) {
        try {
            imei = imei.toString();
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: {
                    imei: imei
                }
            });
            return vehicle;
        } catch (error) {
            console.error('ERROR FETCHING VEHICLE BY IMEI: ', error);
            throw error;
        }
    }

    // Get today's location data for a specific IMEI
    async getTodayLocationData(imei) {
        imei = imei.toString();
        try {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

            return await prisma.getClient().location.findMany({
                where: {
                    imei,
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING TODAY LOCATION DATA: ', error);
            throw error;
        }
    }

    // Get all vehicles with role-based access, ownership, today's km, latest status and location
    async getAllVehiclesWithCompleteData(userId, userRole) {
        try {
            let vehicles;
            
            // Super Admin: all vehicles
            if (userRole === 'Super Admin') {
                vehicles = await prisma.getClient().vehicle.findMany({
                    include: {
                        userVehicles: {
                            where: { userId },
                            select: { 
                                isMain: true, 
                                allAccess: true,
                                liveTracking: true,
                                history: true,
                                report: true,
                                vehicleProfile: true,
                                events: true,
                                geofence: true,
                                edit: true,
                                shareTracking: true,
                                notification: true
                            }
                        }
                    }
                });
            }
            // Dealer: vehicles through device assignment + direct assignment
            else if (userRole === 'Dealer') {
                const [directVehicles, deviceVehicles] = await Promise.all([
                    // Direct vehicle assignments
                    prisma.getClient().vehicle.findMany({
                        where: {
                            userVehicles: {
                                some: { userId }
                            }
                        },
                        include: {
                            userVehicles: {
                                where: { userId },
                                select: { 
                                    isMain: true, 
                                    allAccess: true,
                                    liveTracking: true,
                                    history: true,
                                    report: true,
                                    vehicleProfile: true,
                                    events: true,
                                    geofence: true,
                                    edit: true,
                                    shareTracking: true,
                                    notification: true
                                }
                            }
                        }
                    }),
                    // Vehicles through device assignment
                    prisma.getClient().vehicle.findMany({
                        where: {
                            device: {
                                userDevices: {
                                    some: { userId }
                                }
                            }
                        },
                        include: {
                            userVehicles: {
                                where: { userId },
                                select: { 
                                    isMain: true, 
                                    allAccess: true,
                                    liveTracking: true,
                                    history: true,
                                    report: true,
                                    vehicleProfile: true,
                                    events: true,
                                    geofence: true,
                                    edit: true,
                                    shareTracking: true,
                                    notification: true
                                }
                            }
                        }
                    })
                ]);
    
                // Combine and remove duplicates
                const allVehicles = [...directVehicles, ...deviceVehicles];
                vehicles = allVehicles.filter((vehicle, index, self) =>
                    index === self.findIndex(v => v.imei === vehicle.imei)
                );
            } 
            // Customer: only directly assigned vehicles
            else {
                vehicles = await prisma.getClient().vehicle.findMany({
                    where: {
                        userVehicles: {
                            some: { userId }
                        }
                    },
                    include: {
                        userVehicles: {
                            where: { userId },
                            select: { 
                                isMain: true, 
                                allAccess: true,
                                liveTracking: true,
                                history: true,
                                report: true,
                                vehicleProfile: true,
                                events: true,
                                geofence: true,
                                edit: true,
                                shareTracking: true,
                                notification: true
                            }
                        }
                    }
                });
            }
    
            // OPTIMIZED: Get all latest data in batch queries instead of N+1
            const imeis = vehicles.map(v => v.imei);
            
            // Get latest status for all vehicles in one query
            const latestStatuses = await prisma.getClient().status.findMany({
                where: {
                    imei: { in: imeis }
                },
                orderBy: { createdAt: 'desc' },
                distinct: ['imei']
            });
    
            // Get latest location for all vehicles in one query
            const latestLocations = await prisma.getClient().location.findMany({
                where: {
                    imei: { in: imeis }
                },
                orderBy: { createdAt: 'desc' },
                distinct: ['imei']
            });
    
            // Get today's location data for all vehicles in one query
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
            
            const todayLocationData = await prisma.getClient().location.findMany({
                where: {
                    imei: { in: imeis },
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                },
                orderBy: { createdAt: 'asc' }
            });
    
            // Create lookup maps for O(1) access
            const statusMap = new Map(latestStatuses.map(s => [s.imei, s]));
            const locationMap = new Map(latestLocations.map(l => [l.imei, l]));
            const todayDataMap = new Map();
            
            // Group today's data by IMEI
            todayLocationData.forEach(loc => {
                if (!todayDataMap.has(loc.imei)) {
                    todayDataMap.set(loc.imei, []);
                }
                todayDataMap.get(loc.imei).push(loc);
            });
    
            // Combine data efficiently
            const vehiclesWithData = vehicles.map(vehicle => {
                const latestStatus = statusMap.get(vehicle.imei);
                const latestLocation = locationMap.get(vehicle.imei);
                const todayLocationData = todayDataMap.get(vehicle.imei) || [];
                const userVehicle = vehicle.userVehicles[0] || null;
    
                // Calculate today's kilometers
                const todayKm = calculateDistanceFromLocationData(todayLocationData);
    
                // Determine ownership type
                let ownershipType = 'Customer';
                if (userVehicle) {
                    ownershipType = userVehicle.isMain ? 'Own' : 'Shared';
                }
    
                return {
                    ...vehicle,
                    latestStatus,
                    latestLocation,
                    todayKm: Math.round(todayKm * 100) / 100,
                    ownershipType,
                    userVehicle
                };
            });
    
            return vehiclesWithData;
        } catch (error) {
            console.error('ERROR FETCHING VEHICLES WITH COMPLETE DATA: ', error);
            throw error;
        }
        // try {
        //     let vehicles;
            
        //     // Super Admin: all vehicles
        //     if (userRole === 'Super Admin') {
        //         vehicles = await prisma.getClient().vehicle.findMany();
        //     } 
        //     // Dealer: vehicles from assigned devices + directly assigned vehicles
        //     else if (userRole === 'Dealer') {
        //         // Get vehicles that are directly assigned to the dealer
        //         const directVehicles = await prisma.getClient().vehicle.findMany({
        //             where: {
        //                 userVehicles: {
        //                     some: {
        //                         userId: userId
        //                     }
        //                 }
        //             }
        //         });

        //         // Get devices assigned to the dealer
        //         const dealerDevices = await prisma.getClient().device.findMany({
        //             where: {
        //                 userDevices: {
        //                     some: {
        //                         userId: userId
        //                     }
        //                 }
        //             },
        //             select: {
        //                 imei: true
        //             }
        //         });

        //         // Get vehicles that belong to dealer's devices
        //         const deviceVehicles = await prisma.getClient().vehicle.findMany({
        //             where: {
        //                 imei: {
        //                     in: dealerDevices.map(device => device.imei)
        //                 }
        //             }
        //         });

        //         // Combine and remove duplicates
        //         const allVehicles = [...directVehicles, ...deviceVehicles];
        //         vehicles = allVehicles.filter((vehicle, index, self) =>
        //             index === self.findIndex(v => v.imei === vehicle.imei)
        //         );
        //     } 
        //     // Customer: only directly assigned vehicles
        //     else {
        //         vehicles = await prisma.getClient().vehicle.findMany({
        //             where: {
        //                 userVehicles: {
        //                     some: {
        //                         userId: userId
        //                     }
        //                 }
        //             }
        //         });
        //     }

        //     // Add complete data to each vehicle
        //     const vehiclesWithData = await Promise.all(
        //         vehicles.map(async (vehicle) => {
        //             const [latestStatus, latestLocation, todayLocationData, userVehicle] = await Promise.all([
        //                 prisma.getClient().status.findFirst({
        //                     where: { imei: vehicle.imei },
        //                     orderBy: { createdAt: 'desc' }
        //                 }),
        //                 prisma.getClient().location.findFirst({
        //                     where: { imei: vehicle.imei },
        //                     orderBy: { createdAt: 'desc' }
        //                 }),
        //                 this.getTodayLocationData(vehicle.imei),
        //                 prisma.getClient().userVehicle.findFirst({
        //                     where: {
        //                         vehicleId: vehicle.id,
        //                         userId: userId
        //                     }
        //                 })
        //             ]);

        //             // Calculate today's kilometers
        //             const todayKm = calculateDistanceFromLocationData(todayLocationData);

        //             // Determine ownership type
        //             let ownershipType = 'Customer';
        //             if (userVehicle) {
        //                 ownershipType = userVehicle.isMain ? 'Own' : 'Shared';
        //             }

        //             return {
        //                 ...vehicle,
        //                 latestStatus,
        //                 latestLocation,
        //                 todayKm,
        //                 ownershipType,
        //                 userVehicle: userVehicle || null
        //             };
        //         })
        //     );

        //     return vehiclesWithData;
        // } catch (error) {
        //     console.error('ERROR FETCHING ALL VEHICLES WITH COMPLETE DATA: ', error);
        //     throw error;
        // }
    }

    // Get all vehicles with detailed data for table display (includes device, user, recharge info)
    async getAllVehiclesWithDetailedData(userId, userRole) {
        try {
            let vehicles;
            
            // Super Admin: all vehicles
            if (userRole === 'Super Admin') {
                vehicles = await prisma.getClient().vehicle.findMany({
                    include: {
                        device: true,
                        userVehicles: {
                            include: {
                                user: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    }
                });
            }
            // Dealer: vehicles through device assignment + direct assignment
            else if (userRole === 'Dealer') {
                const [directVehicles, deviceVehicles] = await Promise.all([
                    // Direct vehicle assignments
                    prisma.getClient().vehicle.findMany({
                        where: {
                            userVehicles: {
                                some: { userId }
                            }
                        },
                        include: {
                            device: true,
                            userVehicles: {
                                include: {
                                    user: {
                                        include: {
                                            role: true
                                        }
                                    }
                                }
                            }
                        }
                    }),
                    // Vehicles through device assignment
                    prisma.getClient().vehicle.findMany({
                        where: {
                            device: {
                                userDevices: {
                                    some: { userId }
                                }
                            }
                        },
                        include: {
                            device: true,
                            userVehicles: {
                                include: {
                                    user: {
                                        include: {
                                            role: true
                                        }
                                    }
                                }
                            }
                        }
                    })
                ]);
    
                // Combine and remove duplicates
                const allVehicles = [...directVehicles, ...deviceVehicles];
                vehicles = allVehicles.filter((vehicle, index, self) =>
                    index === self.findIndex(v => v.imei === vehicle.imei)
                );
            } 
            // Customer: only directly assigned vehicles
            else {
                vehicles = await prisma.getClient().vehicle.findMany({
                    where: {
                        userVehicles: {
                            some: { userId }
                        }
                    },
                    include: {
                        device: true,
                        userVehicles: {
                            include: {
                                user: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    }
                });
            }
    
            // Get all IMEIs for batch queries
            const imeis = vehicles.map(v => v.imei);
            
            // Get latest status for all vehicles in one query
            const latestStatuses = await prisma.getClient().status.findMany({
                where: {
                    imei: { in: imeis }
                },
                orderBy: { createdAt: 'desc' },
                distinct: ['imei']
            });
    
            // Get latest location for all vehicles in one query
            const latestLocations = await prisma.getClient().location.findMany({
                where: {
                    imei: { in: imeis }
                },
                orderBy: { createdAt: 'desc' },
                distinct: ['imei']
            });
    
            // Get latest recharge for each device in one query
            const latestRecharges = await prisma.getClient().recharge.findMany({
                where: {
                    device: {
                        imei: { in: imeis }
                    }
                },
                include: {
                    device: true
                },
                orderBy: { createdAt: 'desc' },
                distinct: ['deviceId']
            });
    
            // Get today's location data for all vehicles in one query
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
            
            const todayLocationData = await prisma.getClient().location.findMany({
                where: {
                    imei: { in: imeis },
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                },
                orderBy: { createdAt: 'asc' }
            });
    
            // Create lookup maps for O(1) access
            const statusMap = new Map(latestStatuses.map(s => [s.imei, s]));
            const locationMap = new Map(latestLocations.map(l => [l.imei, l]));
            const rechargeMap = new Map(latestRecharges.map(r => [r.device.imei, r]));
            const todayDataMap = new Map();
            
            // Group today's data by IMEI
            todayLocationData.forEach(loc => {
                if (!todayDataMap.has(loc.imei)) {
                    todayDataMap.set(loc.imei, []);
                }
                todayDataMap.get(loc.imei).push(loc);
            });
    
            // Combine data efficiently
            const vehiclesWithDetailedData = vehicles.map(vehicle => {
                const latestStatus = statusMap.get(vehicle.imei);
                const latestLocation = locationMap.get(vehicle.imei);
                const latestRecharge = rechargeMap.get(vehicle.imei);
                const todayLocationData = todayDataMap.get(vehicle.imei) || [];
                
                // Find the main customer user (role = Customer and isMain = true)
                const mainCustomer = vehicle.userVehicles.find(uv => 
                    uv.user.role.name === 'Customer' && uv.isMain
                );
    
                // Calculate today's kilometers
                const todayKm = calculateDistanceFromLocationData(todayLocationData);
    
                // Determine ownership type
                let ownershipType = 'Customer';
                if (mainCustomer) {
                    ownershipType = mainCustomer.isMain ? 'Own' : 'Shared';
                }
    
                return {
                    ...vehicle,
                    latestStatus,
                    latestLocation,
                    latestRecharge,
                    todayKm: Math.round(todayKm * 100) / 100,
                    ownershipType,
                    mainCustomer: mainCustomer || null
                };
            });
    
            return vehiclesWithDetailedData;
        } catch (error) {
            console.error('ERROR FETCHING VEHICLES WITH DETAILED DATA: ', error);
            throw error;
        }
    }

    // Get vehicle by IMEI with complete data and role-based access
    async getVehicleByImeiWithCompleteData(imei, userId, userRole) {
        imei = imei.toString();
        try {
            let vehicle;
            
            // Super Admin: can access any vehicle
            if (userRole === 'Super Admin') {
                vehicle = await prisma.getClient().vehicle.findUnique({ where: { imei } });
            } 
            // Dealer: can access vehicles from assigned devices or directly assigned
            else if (userRole === 'Dealer') {
                // Check if vehicle is directly assigned to dealer
                const directVehicle = await prisma.getClient().vehicle.findFirst({
                    where: {
                        imei: imei,
                        userVehicles: {
                            some: {
                                userId: userId
                            }
                        }
                    }
                });

                if (directVehicle) {
                    vehicle = directVehicle;
                } else {
                    // Check if vehicle belongs to a device assigned to dealer
                    vehicle = await prisma.getClient().vehicle.findFirst({
                        where: {
                            imei: imei,
                            device: {
                                userDevices: {
                                    some: {
                                        userId: userId
                                    }
                                }
                            }
                        }
                    });
                }
            } 
            // Customer: can only access directly assigned vehicles
            else {
                vehicle = await prisma.getClient().vehicle.findFirst({
                    where: {
                        imei: imei,
                        userVehicles: {
                            some: {
                                userId: userId
                            }
                        }
                    }
                });
            }

            if (!vehicle) {
                return null;
            }

            // Get complete data for the vehicle
            const [latestStatus, latestLocation, todayLocationData, userVehicle] = await Promise.all([
                prisma.getClient().status.findFirst({
                    where: { imei },
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.getClient().location.findFirst({
                    where: { imei },
                    orderBy: { createdAt: 'desc' }
                }),
                this.getTodayLocationData(imei),
                prisma.getClient().userVehicle.findFirst({
                    where: {
                        vehicleId: vehicle.id,
                        userId: userId
                    }
                })
            ]);

            // Calculate today's kilometers
            const todayKm = calculateDistanceFromLocationData(todayLocationData);

            // Determine ownership type
            let ownershipType = 'Customer';
            if (userVehicle) {
                ownershipType = userVehicle.isMain ? 'Own' : 'Shared';
            }

            return {
                ...vehicle,
                latestStatus,
                latestLocation,
                todayKm,
                ownershipType,
                userVehicle: userVehicle || null
            };
        } catch (error) {
            console.error('VEHICLE FETCH ERROR WITH COMPLETE DATA: ', error);
            throw error;
        }
    }

    // Update vehicle
    async updateData(imei, data) {
        imei = imei.toString();
        try {
            const allowedFields = ['imei', 'name', 'vehicleNo', 'vehicleType', 'odometer', 'mileage', 'minimumFuel', 'speedLimit'];
            const updateData = {};

            for (const [key, value] of Object.entries(data)) {
                if (allowedFields.includes(key)) {
                    updateData[key] = value;
                }
            }

            if (Object.keys(updateData).length === 0) {
                return null
            }

            return await prisma.getClient().vehicle.update({
                where: { imei },
                data: updateData,
            });
        } catch (error) {
            console.error('ERROR UPDATE VEHICLES: ', error);
            throw error;
        }
    }

    // Delete vehicle
    async deleteData(imei) {
        imei = imei.toString();
        try {
            const result = await prisma.getClient().vehicle.delete({ where: { imei } });
            return result;
        } catch (error) {
            console.error('ERROR DELETE VEHICLE: ', error);
            throw error;
        }
    }


    // ---- Vehicle Access ----
    // NEW: Assign vehicle access to user
    // NEW: Assign vehicle access to user
    async assignVehicleAccessToUser(imei, userId, permissions, assignedByUserId) {
        const nepalTime = datetimeService.nepalTimeDate();
        imei = imei.toString();
        try {
            // Check if vehicle exists
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei }
            });
            
            if (!vehicle) {
                throw new Error('Vehicle not found');
            }

            // Check if user exists
            const user = await prisma.getClient().user.findFirst({
                where: { id: userId },
                include: { role: true }
            });

            if (!user) {
                throw new Error('User not found');
            }

            // Check if assignment already exists
            const existingAssignment = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: userId,
                    vehicle: {
                        imei: imei
                    }
                }
            });

            if (existingAssignment) {
                throw new Error('Vehicle access is already assigned to this user');
            }

            // Create the assignment with permissions
            const assignment = await prisma.getClient().userVehicle.create({
                data: {
                    userId: userId,
                    vehicleId: vehicle.id,
                    isMain: false, // Not the main vehicle for this user
                    allAccess: permissions.allAccess || false,
                    liveTracking: permissions.liveTracking || false,
                    history: permissions.history || false,
                    report: permissions.report || false,
                    vehicleProfile: permissions.vehicleProfile || false,
                    events: permissions.events || false,
                    geofence: permissions.geofence || false,
                    edit: permissions.edit || false,
                    shareTracking: permissions.shareTracking || false,
                    notification: permissions.notification || false,
                    createdAt: nepalTime
                    // Remove assignedBy since it's not in the schema
                },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    },
                    vehicle: true
                }
            });

            return assignment;
        } catch (error) {
            console.error('ERROR ASSIGNING VEHICLE ACCESS TO USER: ', error);
            throw error;
        }
    }

    // NEW: Get vehicles for access assignment (filtered by user role and ownership)
    async getVehiclesForAccessAssignment(userId, userRole) {
        try {
            let vehicles;

            if (userRole === 'Super Admin') {
                // Super Admin can assign access to all vehicles
                vehicles = await prisma.getClient().vehicle.findMany({
                    include: {
                        userVehicles: {
                            include: {
                                user: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    }
                });
            } else {
                // Users can only assign access to vehicles where they are the main user
                vehicles = await prisma.getClient().vehicle.findMany({
                    where: {
                        userVehicles: {
                            some: {
                                userId: userId,
                                isMain: true
                            }
                        }
                    },
                    include: {
                        userVehicles: {
                            include: {
                                user: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    }
                });
            }

            return vehicles;
        } catch (error) {
            console.error('ERROR FETCHING VEHICLES FOR ACCESS ASSIGNMENT: ', error);
            throw error;
        }
    }

    // NEW: Get vehicle access assignments for a specific vehicle
    async getVehicleAccessAssignments(imei, userId, userRole) {
        imei = imei.toString();
        try {
            // Check if user has permission to view assignments
            if (userRole !== 'Super Admin') {
                const mainUserVehicle = await prisma.getClient().userVehicle.findFirst({
                    where: {
                        vehicle: {
                            imei: imei
                        },
                        userId: userId,
                        isMain: true
                    }
                });

                if (!mainUserVehicle) {
                    throw new Error('Access denied. Only main user or Super Admin can view assignments');
                }
            }

            const assignments = await prisma.getClient().userVehicle.findMany({
                where: {
                    vehicle: {
                        imei: imei
                    },
                    isMain: false // Only show shared access, not main ownership
                },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    },
                    vehicle: true
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return assignments;
        } catch (error) {
            console.error('ERROR FETCHING VEHICLE ACCESS ASSIGNMENTS: ', error);
            throw error;
        }
    }

    // NEW: Update vehicle access permissions
    async updateVehicleAccess(imei, userId, permissions, updatedByUserId) {
        try {
            // Check if vehicle exists
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei }
            });
            
            if (!vehicle) {
                throw new Error('Vehicle not found');
            }

            // Check if assignment exists
            const existingAssignment = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: userId,
                    vehicleId: vehicle.id
                }
            });

            if (!existingAssignment) {
                throw new Error('Vehicle access assignment not found');
            }

            // Update the assignment with new permissions
            const updatedAssignment = await prisma.getClient().userVehicle.update({
                where: {
                    id: existingAssignment.id
                },
                data: {
                    allAccess: permissions.allAccess || false,
                    liveTracking: permissions.liveTracking || false,
                    history: permissions.history || false,
                    report: permissions.report || false,
                    vehicleProfile: permissions.vehicleProfile || false,
                    events: permissions.events || false,
                    geofence: permissions.geofence || false,
                    edit: permissions.edit || false,
                    shareTracking: permissions.shareTracking || false,
                    notification: permissions.notification || false
                    // Remove assignedBy since it's not in the schema
                },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    },
                    vehicle: true
                }
            });

            return updatedAssignment;
        } catch (error) {
            console.error('ERROR UPDATING VEHICLE ACCESS: ', error);
            throw error;
        }
    }

    // NEW: Remove vehicle access
    async removeVehicleAccess(imei, userId, removedByUserId) {
        try {
            // Check if vehicle exists
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei }
            });
            
            if (!vehicle) {
                throw new Error('Vehicle not found');
            }

            // Check if assignment exists
            const existingAssignment = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: userId,
                    vehicleId: vehicle.id
                }
            });

            if (!existingAssignment) {
                throw new Error('Vehicle access assignment not found');
            }

            // Delete the assignment
            await prisma.getClient().userVehicle.delete({
                where: {
                    id: existingAssignment.id
                }
            });

            return { success: true };
        } catch (error) {
            console.error('ERROR REMOVING VEHICLE ACCESS: ', error);
            throw error;
        }
    }
}

module.exports = VehicleModel