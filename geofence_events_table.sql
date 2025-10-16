-- Create geofence_events table for tracking vehicle entry/exit states
CREATE TABLE IF NOT EXISTS `geofence_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `geofence_id` int NOT NULL,
  `is_inside` tinyint(1) NOT NULL DEFAULT '0',
  `last_event_type` varchar(10) NOT NULL,
  `last_event_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `geofence_events_vehicle_id_geofence_id` (`vehicle_id`,`geofence_id`),
  KEY `geofence_events_vehicle_id_geofence_id_idx` (`vehicle_id`,`geofence_id`),
  KEY `geofence_events_last_event_at_idx` (`last_event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

