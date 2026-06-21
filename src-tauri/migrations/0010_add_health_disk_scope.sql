-- Store which disk drove the disk-pressure reading.
-- Existing samples keep null/0 values; new samples record the most saturated
-- detected disk after scanning all disks reported by sysinfo.

ALTER TABLE health_samples ADD COLUMN disk_name TEXT;
ALTER TABLE health_samples ADD COLUMN disk_count INTEGER NOT NULL DEFAULT 0;
