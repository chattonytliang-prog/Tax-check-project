import { Download, FileText } from 'lucide-react'
import type { AssistantGeneratedFile, AssistantToolStep } from '../lib/assistantArtifacts'

const toolLabels: Record<string, string> = {
  search_sources: '检索文件原文',
  read_source: '读取原件内容',
  list_generated_files: '查找已生成的文件',
  read_generated_file: '读取上一版文件',
  generate_file: '生成下载文件',
  search_conversation: '查找之前的约定',
  read_conversation: '读取历史对话',
  get_business_metric: '查询业务指标',
  get_account_balance_accounts: '查询科目余额',
  get_tax_archive: '查询资料归档情况',
  get_source_files: '查找归档原件',
  search_customer_memory: '查询企业记录',
  search_agent_knowledge: '查询工作规则',
}

export function AssistantOutputs({ artifacts = [], toolSteps = [] }: {
  artifacts?: AssistantGeneratedFile[]
  toolSteps?: AssistantToolStep[]
}) {
  if (!artifacts.length && !toolSteps.length) return null
  return <div className="assistant-outputs">
    {toolSteps.length > 0 && (
      <details className="assistant-tool-steps">
        <summary>已执行 {toolSteps.length} 项操作</summary>
        <ol>
          {toolSteps.map((step, index) => (
            <li key={`${step.id}-${index}`}>
              {toolLabels[step.name] || '查询资料'} · {step.status === 'failed' ? '未完成' : step.status === 'running' ? '执行中' : '完成'}
            </li>
          ))}
        </ol>
      </details>
    )}
    {artifacts.map((file) => (
      <a className="assistant-download-card" key={file.id}
        href={`/api/assistant/artifacts/${encodeURIComponent(file.id)}`} download>
        <FileText aria-hidden="true" />
        <span><strong>{file.name}</strong><small>{Math.max(1, Math.ceil(file.size / 1024))} KB · 点击下载</small></span>
        <Download aria-hidden="true" />
      </a>
    ))}
  </div>
}
