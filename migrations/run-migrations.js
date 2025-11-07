"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_promise_1 = __importDefault(require("pg-promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pgp = (0, pg_promise_1.default)();
const db = pgp(process.env.POSTGRES_URL || '');
async function runMigrations() {
    console.log('Starting database migrations...');
    console.log(`Database URL: ${process.env.POSTGRES_URL?.replace(/:[^:]*@/, ':****@')}`);
    try {
        // Test database connection
        await db.query('SELECT NOW()');
        console.log('✓ Database connection successful');
        // Get all migration files
        const migrationsDir = __dirname;
        const files = fs_1.default
            .readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
        if (files.length === 0) {
            console.log('No migration files found');
            return;
        }
        // Run each migration
        for (const file of files) {
            console.log(`\nRunning migration: ${file}`);
            const filePath = path_1.default.join(migrationsDir, file);
            const sql = fs_1.default.readFileSync(filePath, 'utf8');
            await db.none(sql);
            console.log(`✓ ${file} completed successfully`);
        }
        console.log('\n✓ All migrations completed successfully');
    }
    catch (error) {
        const err = error;
        console.error('\n✗ Migration failed:', err.message);
        console.error(error);
        process.exit(1);
    }
    finally {
        pgp.end();
    }
}
// Run migrations
runMigrations();
//# sourceMappingURL=run-migrations.js.map