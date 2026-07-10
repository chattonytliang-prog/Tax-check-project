import { describe, expect, it } from 'vitest'
import { taxDataIntakeMigration } from './_tax_data_schema.js'

describe('tax data intake schema', () => {
  it('defines the full intake tables needed for source-backed filing data', () => {
    expect(taxDataIntakeMigration.id).toBe('0008_full_tax_data_intake')
    expect(taxDataIntakeMigration.tables).toEqual(expect.arrayContaining([
      'tax_data_import_batches',
      'tax_data_source_files',
      'tax_data_periods',
      'tax_data_financial_statements',
      'tax_data_financial_statement_lines',
      'tax_data_account_balances',
      'tax_data_ledger_entries',
      'tax_data_vat_returns',
      'tax_data_vat_return_lines',
      'tax_data_invoice_summaries',
      'tax_data_invoice_lines',
      'tax_data_payroll_runs',
      'tax_data_payroll_lines',
      'tax_data_iit_returns',
      'tax_data_iit_return_lines',
      'tax_data_evidence_fields',
      'tax_data_conflicts',
      'tax_data_standard_records',
    ]))
  })

  it('keeps every declared table backed by an idempotent create statement', () => {
    for (const table of taxDataIntakeMigration.tables) {
      expect(taxDataIntakeMigration.statements.join('\n')).toContain(`CREATE TABLE IF NOT EXISTS ${table}`)
    }
  })
})
