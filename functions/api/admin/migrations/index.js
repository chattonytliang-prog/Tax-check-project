import { json, requireDb, serverError } from '../../_utils.js'
import { requireAdmin } from '../../auth/_auth.js'

const assistantBusinessToolMigration = {
  id: '0007_assistant_business_tools',
  statements: [
    `CREATE TABLE IF NOT EXISTS assistant_cleaning_drafts (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      thread_id TEXT,
      client_id TEXT,
      client_name TEXT,
      source_type TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_owner_updated
      ON assistant_cleaning_drafts(owner_user_id, updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_cleaning_drafts_client
      ON assistant_cleaning_drafts(client_id)`,
    `CREATE TABLE IF NOT EXISTS assistant_customer_memories (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT,
      memory_key TEXT NOT NULL,
      memory_value TEXT NOT NULL,
      source TEXT,
      confidence TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_customer_memories_unique
      ON assistant_customer_memories(owner_user_id, client_id, memory_key)`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_customer_memories_owner_updated
      ON assistant_customer_memories(owner_user_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS assistant_import_audits (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      thread_id TEXT,
      client_id TEXT,
      client_name TEXT,
      action TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      source_material_ids TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_owner_created
      ON assistant_import_audits(owner_user_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_assistant_import_audits_client
      ON assistant_import_audits(client_id)`,
  ],
  tables: ['assistant_cleaning_drafts', 'assistant_customer_memories', 'assistant_import_audits'],
}

async function tableExists(db, tableName) {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first()
  return Boolean(row)
}

async function migrationStatus(db) {
  const tables = {}
  for (const table of assistantBusinessToolMigration.tables) {
    tables[table] = await tableExists(db, table)
  }
  return {
    id: assistantBusinessToolMigration.id,
    applied: Object.values(tables).every(Boolean),
    tables,
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    return json({ migrations: [await migrationStatus(db)] })
  } catch (error) {
    return serverError(error)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env)
    const auth = await requireAdmin(request, db)
    if (auth.response) return auth.response

    for (const statement of assistantBusinessToolMigration.statements) {
      await db.prepare(statement).run()
    }

    await db
      .prepare(
        'INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      )
      .bind(
        crypto.randomUUID(),
        auth.admin.id,
        auth.user.id,
        'admin.migration_apply',
        assistantBusinessToolMigration.id,
      )
      .run()

    return json({ migration: await migrationStatus(db) })
  } catch (error) {
    return serverError(error)
  }
}
