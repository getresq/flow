import mailPipelineContractJson from '../flow-contracts/mail-pipeline.json'
import type { FlowConfig, FlowContract } from '../core/types'

import { mailPipelineFlow } from './mail-pipeline'

const mailPipelineContract = mailPipelineContractJson as FlowContract

const flowViews = new Map<string, FlowConfig>([[mailPipelineFlow.id, mailPipelineFlow]])

function createHeadlessFlow(contract: FlowContract): FlowConfig {
  return {
    id: contract.id,
    name: contract.name,
    contract,
    hasGraph: false,
    nodes: [],
    edges: [],
    spanMapping: {},
  }
}

export const flows = [mailPipelineContract].map((contract) => flowViews.get(contract.id) ?? createHeadlessFlow(contract))
