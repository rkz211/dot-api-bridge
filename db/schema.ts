import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const operations = sqliteTable('bridge_operations', {
  operationId: text('operation_id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  state: text('state').notNull(),
  result: text('result'),
  createdAt: text('created_at').notNull(),
});

export const connections = sqliteTable('bridge_connections', {
  serviceId: text('service_id').primaryKey(),
  configJson: text('config_json').notNull(),
  bindingHash: text('binding_hash').notNull(),
  state: text('state').notNull(),
  keyValue: text('key_value'),
  lastTestJson: text('last_test_json'),
  revision: text('revision').notNull(),
  updatedAt: text('updated_at').notNull(),
});
