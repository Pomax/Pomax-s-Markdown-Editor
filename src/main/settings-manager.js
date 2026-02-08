/**
 * @fileoverview Settings Manager with SQLite persistence.
 * Manages application settings stored in a SQLite database
 * in the user's application data directory.
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';

/**
 * Manages application settings using a SQLite database.
 */
export class SettingsManager {
    constructor() {
        /** @type {string} */
        this.dbPath = path.join(app.getPath('userData'), 'settings.db');

        /** @type {ReturnType<typeof Database>|null} */
        this.db = null;
    }

    /**
     * Initializes the database connection and creates the settings table
     * if it does not already exist.
     */
    initialize() {
        const db = new Database(this.dbPath);
        this.db = db;

        // Enable WAL mode for better concurrent read performance
        db.pragma('journal_mode = WAL');

        db.exec(`
			CREATE TABLE IF NOT EXISTS settings (
				key   TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)
		`);
    }

    /**
     * Retrieves a setting value by key.
     * @param {string} key - The setting key
     * @param {*} [defaultValue=null] - Value returned when the key does not exist
     * @returns {*} The parsed setting value, or defaultValue
     */
    get(key, defaultValue = null) {
        if (!this.db) this.initialize();

        const db = /** @type {ReturnType<typeof Database>} */ (this.db);
        const row = /** @type {{ value: string } | undefined} */ (
            db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
        );
        if (!row) return defaultValue;

        try {
            return JSON.parse(row.value);
        } catch {
            return row.value;
        }
    }

    /**
     * Stores a setting value.
     * @param {string} key - The setting key
     * @param {*} value - The value to store (will be JSON-serialized)
     */
    set(key, value) {
        if (!this.db) this.initialize();

        const db = /** @type {ReturnType<typeof Database>} */ (this.db);
        const serialized = JSON.stringify(value);
        db.prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ).run(key, serialized);
    }

    /**
     * Deletes a setting by key.
     * @param {string} key - The setting key
     * @returns {boolean} True if a row was deleted
     */
    delete(key) {
        if (!this.db) this.initialize();

        const db = /** @type {ReturnType<typeof Database>} */ (this.db);
        const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        return result.changes > 0;
    }

    /**
     * Returns all settings as a plain object.
     * @returns {Object<string, *>}
     */
    getAll() {
        if (!this.db) this.initialize();

        const db = /** @type {ReturnType<typeof Database>} */ (this.db);
        const rows = /** @type {{ key: string, value: string }[]} */ (
            db.prepare('SELECT key, value FROM settings').all()
        );
        /** @type {Object<string, *>} */
        const result = {};
        for (const row of rows) {
            try {
                result[row.key] = JSON.parse(row.value);
            } catch {
                result[row.key] = row.value;
            }
        }
        return result;
    }

    /**
     * Closes the database connection.
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
