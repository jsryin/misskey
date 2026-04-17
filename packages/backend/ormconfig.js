import { DataSource } from 'typeorm';
import { loadConfig } from './built/config.js';
import { entities } from './built/postgres.js';

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

const config = loadConfig();
const extra = {
	...config.db.extra,
};

if (extra.sslmode === 'require' && extra.ssl == null) {
	extra.ssl = true;
}

if (extra.channel_binding === 'require' && extra.enableChannelBinding == null) {
	extra.enableChannelBinding = true;
}

export default new DataSource({
	type: 'postgres',
	host: config.db.host,
	port: config.db.port,
	username: config.db.user,
	password: config.db.pass,
	database: config.db.db,
	extra,
	entities: entities,
	migrations: ['migration/*.js'],
	migrationsTransactionMode: isConcurrentIndexMigrationEnabled ? 'each' : 'all',
});
