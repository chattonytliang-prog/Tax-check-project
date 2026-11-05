export type AssistantGeneratedFile = {
  id: string
  name: string
  contentType: string
  size: number
  downloadUrl: string
}

export type AssistantToolStep = {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
}

export type AssistantFileResponse = {
  answer: string
  excerpted: boolean
  artifacts?: AssistantGeneratedFile[]
  toolSteps?: AssistantToolStep[]
}
