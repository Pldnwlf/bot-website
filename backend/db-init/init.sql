-- This script will run on the first startup of the postgres-db container.

-- Create the database for our bot application
-- The IF NOT EXISTS is good practice to prevent errors on subsequent startups
CREATE DATABASE minecraft_bot_dashboard;

-- Create the separate database for Keycloak
CREATE DATABASE keycloak_db;