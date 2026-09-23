import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateReportRemediation } from '../_report_remediation.js'
import { onRequestPatch as updateRemediation } from './[id].js'

vi.mock('../auth/_auth.js', () => ({
  requireUser: async (request, db) => {
    const id = request.headers.get('x-test-user')
    const user = await db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(id).first()
    const actorId = request.headers.get('x-test-actor')
    const actor = actorId
      ? await db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(actorId).first()
      : null
    return user ? { user: { ...user, actor } } : { response: new Response('', { status: 401 }) }
  },
}))

const databases = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
  vi.useRealTimers()
})

function createDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  for (const version of ['0001_initial', '0002_auth', '0003_user_data_isolation', '0004_admin']) {
    sqlite.exec(readFileSync(new URL(`../../../migrations/${version}.sql`, import.meta.url), 'utf8'))
  }
  sqlite.prepare("INSERT INTO users (id, username, password_hash, password_salt) VALUES ('u', 'user', 'x', 'x'), ('other', 'other', 'x', 'x')").run()
  sqlite.prepare("INSERT INTO clients (id, name, payload_json, owner_user_id) VALUES ('client-1', '客户', '{}', 'u')").run()
  const report = {
    id: 'report-1',
    clientId: 'client-1',
    clientName: '客户',
    content: '原报告正文',
    risks: [],
    structured: {
      actionPlan: [{
        taskId: 'RMD-001',
        findingRef: 'FND-001',
        priority: '高优先级',
        item: '复核进项发票',
        ownerHint: '财务负责人牵头',
        status: '待复核',
        completionEvidence: '发票台账',
      }],
    },
  }
  sqlite.prepare(
    "INSERT INTO reports (id, client_id, client_name, content, payload_json, owner_user_id) VALUES ('report-1', 'client-1', '客户', '原报告正文', ?, 'u')",
  ).run(JSON.stringify(report))
  const db = {
    prepare(sql) {
      let bindings = []
      return {
        bind(...values) { bindings = values; return this },
        async first() { return sqlite.prepare(sql).get(...bindings) || null },
        async run() { return sqlite.prepare(sql).run(...bindings) },
      }
    },
  }
  return { sqlite, db }
}

function request(userId, body, actorId) {
  return new Request('https://example.test/api/reports/report-1', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-test-user': userId,
      ...(actorId ? { 'x-test-actor': actorId } : {}),
    },
    body: JSON.stringify(body),
  })
}

function update(overrides = {}) {
  return {
    taskId: 'RMD-001',
    status: '整改中',
    assignee: '王会计',
    progressNote: '已取得发票台账，正在核对认证清单。',
    clientAcknowledged: false,
    expectedUpdatedAt: '',
    ...overrides,
  }
}

describe('report remediation workflow', () => {
  it('persists an owned task update with actor and history without changing report content', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'))
    const { sqlite, db } = createDatabase()
    const response = await updateRemediation({ request: request('u', update(), 'other'), env: { DB: db }, params: { id: 'report-1' } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.task).toMatchObject({
      status: '整改中',
      assignee: '王会计',
      progressNote: '已取得发票台账，正在核对认证清单。',
      clientAcknowledged: false,
      updatedAt: '2026-09-21T08:00:00.000Z',
      updatedBy: 'other',
    })
    expect(body.task.history).toHaveLength(1)
    const stored = sqlite.prepare("SELECT content, payload_json FROM reports WHERE id = 'report-1'").get()
    expect(stored.content).toBe('原报告正文')
    expect(JSON.parse(stored.payload_json).structured.actionPlan[0]).toEqual(body.task)
  })

  it('requires client acknowledgement before completion and a nonempty owner and note', async () => {
    const { db } = createDatabase()
    for (const [patch, message] of [
      [{ status: '已完成' }, '客户确认'],
      [{ assignee: ' ' }, '实际负责人'],
      [{ progressNote: ' ' }, '处理说明'],
    ]) {
      const response = await updateRemediation({ request: request('u', update(patch)), env: { DB: db }, params: { id: 'report-1' } })
      expect(response.status).toBe(400)
      expect((await response.json()).error).toContain(message)
    }
  })

  it('records customer acknowledgement and rejects stale updates', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-21T09:00:00Z'))
    const { db } = createDatabase()
    const completed = await updateRemediation({
      request: request('u', update({ status: '已完成', clientAcknowledged: true })),
      env: { DB: db },
      params: { id: 'report-1' },
    })
    expect(completed.status).toBe(200)
    const completedTask = (await completed.json()).task
    expect(completedTask.clientAcknowledgedAt).toBe('2026-09-21T09:00:00.000Z')

    const stale = await updateRemediation({ request: request('u', update()), env: { DB: db }, params: { id: 'report-1' } })
    expect(stale.status).toBe(409)
    expect((await stale.json()).error).toContain('其他操作更新')
  })

  it('does not expose another user report and rejects unknown tasks', async () => {
    const { db } = createDatabase()
    const forbidden = await updateRemediation({ request: request('other', update()), env: { DB: db }, params: { id: 'report-1' } })
    expect(forbidden.status).toBe(404)
    const missing = await updateRemediation({
      request: request('u', update({ taskId: 'RMD-999' })),
      env: { DB: db },
      params: { id: 'report-1' },
    })
    expect(missing.status).toBe(404)
  })

  it('validates historical report and request shapes without throwing', () => {
    const validReport = {
      structured: {
        actionPlan: [{ priority: '高优先级', item: '复核', ownerHint: '负责人' }],
      },
    }
    const validInput = update({ taskId: 'RMD-001' })
    for (const report of [undefined, {}, { structured: {} }]) {
      expect(updateReportRemediation(report, validInput, { username: 'user' }, '2026-09-21T10:00:00.000Z').status).toBe(409)
    }
    for (const input of [undefined, null, 'invalid', []]) {
      expect(updateReportRemediation(validReport, input, { username: 'user' }, '2026-09-21T10:00:00.000Z').status).toBe(400)
    }
    for (const taskId of [undefined, '', 'x'.repeat(41)]) {
      expect(updateReportRemediation(validReport, { ...validInput, taskId }, { username: 'user' }, '2026-09-21T10:00:00.000Z').status).toBe(400)
    }
    expect(updateReportRemediation({ structured: { actionPlan: [null] } }, validInput, { username: 'user' }, '2026-09-21T10:00:00.000Z').status).toBe(404)
    expect(updateReportRemediation(validReport, { ...validInput, status: '未知' }, { username: 'user' }, '2026-09-21T10:00:00.000Z').status).toBe(400)
  })

  it('validates every editable field and expected version', () => {
    const report = {
      structured: {
        actionPlan: [{ taskId: 'RMD-001', updatedAt: 'v1', priority: '高优先级', item: '复核', ownerHint: '负责人' }],
      },
    }
    const validInput = update({ expectedUpdatedAt: 'v1' })
    for (const assignee of [undefined, '', 'x'.repeat(81)]) {
      expect(updateReportRemediation(report, { ...validInput, assignee }, { username: 'user' }, 'v2').status).toBe(400)
    }
    for (const progressNote of [undefined, '', 'x'.repeat(1001)]) {
      expect(updateReportRemediation(report, { ...validInput, progressNote }, { username: 'user' }, 'v2').status).toBe(400)
    }
    expect(updateReportRemediation(report, { ...validInput, clientAcknowledged: 'yes' }, { username: 'user' }, 'v2').status).toBe(400)
    expect(updateReportRemediation(report, { ...validInput, status: '已完成' }, { username: 'user' }, 'v2').status).toBe(400)
    expect(updateReportRemediation(report, { ...validInput, expectedUpdatedAt: undefined }, { username: 'user' }, 'v2').status).toBe(400)
    expect(updateReportRemediation(report, { ...validInput, expectedUpdatedAt: 'stale' }, { username: 'user' }, 'v2').status).toBe(409)
  })

  it('preserves acknowledgement time, caps history and records the actual actor fallback', () => {
    const history = Array.from({ length: 60 }, (_, index) => ({ updatedAt: String(index) }))
    const report = {
      marker: 'keep',
      structured: {
        marker: 'keep',
        actionPlan: [
          {
            taskId: 'RMD-001',
            updatedAt: 'v1',
            priority: '高优先级',
            item: '复核',
            ownerHint: '负责人',
            clientAcknowledged: true,
            clientAcknowledgedAt: 'original-ack',
            history,
          },
          { taskId: 'RMD-002', priority: '中优先级', item: '保留', ownerHint: '负责人' },
        ],
      },
    }
    const result = updateReportRemediation(
      report,
      update({ status: '已完成', clientAcknowledged: true, expectedUpdatedAt: 'v1' }),
      { id: 'actor-id' },
      'v2',
    )
    expect(result.status).toBe(200)
    expect(result.task).toMatchObject({ clientAcknowledgedAt: 'original-ack', updatedBy: 'actor-id' })
    expect(result.task.history).toHaveLength(50)
    expect(result.report.marker).toBe('keep')
    expect(result.report.structured.marker).toBe('keep')
    expect(result.report.structured.actionPlan[1]).toBe(report.structured.actionPlan[1])

    const cleared = updateReportRemediation(
      result.report,
      update({ expectedUpdatedAt: 'v2', clientAcknowledged: false }),
      {},
      'v3',
    )
    expect(cleared.task.clientAcknowledgedAt).toBeUndefined()
    expect(cleared.task.updatedBy).toBe('当前用户')
  })
})
