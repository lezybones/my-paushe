-- Optional demo data. Run after creating a user, then add providers and services.
INSERT INTO users (full_name, phone, role)
VALUES ('Demo Customer', '+254700000001', 'customer')
ON CONFLICT (phone) DO NOTHING;

INSERT INTO providers (business_name, category, description, address, location, phone, verified)
VALUES
('Sample Auto Care', 'car_service', 'General maintenance and repairs', 'Ruiru, Kiambu County',
 ST_SetSRID(ST_MakePoint(36.9615, -1.1450),4326)::geography, '+254700000010', true),
('Sample Fuel Point', 'fuel', 'Fuel station', 'Thika Road, Kenya',
 ST_SetSRID(ST_MakePoint(36.9000, -1.1800),4326)::geography, '+254700000011', true),
('Sample Shine Wash', 'car_wash', 'Car and bike wash', 'Ruiru, Kiambu County',
 ST_SetSRID(ST_MakePoint(36.9500, -1.1500),4326)::geography, '+254700000012', true)
ON CONFLICT DO NOTHING;

INSERT INTO services (provider_id, name, description, price_kes, duration_minutes)
SELECT id, 'Basic inspection', 'Basic vehicle inspection', 1500, 45 FROM providers
WHERE business_name = 'Sample Auto Care'
ON CONFLICT DO NOTHING;

INSERT INTO services (provider_id, name, description, price_kes, duration_minutes)
SELECT id, 'Exterior wash', 'Exterior body wash', 500, 30 FROM providers
WHERE business_name = 'Sample Shine Wash'
ON CONFLICT DO NOTHING;
