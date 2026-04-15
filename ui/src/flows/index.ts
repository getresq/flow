import demoPipelineContractJson from '../flow-contracts/demo-pipeline.json'
import mailPipelineContractJson from '../flow-contracts/mail-pipeline.json'
import type { FlowConfig, FlowContract } from '../core/types'

import { demoPipelineFlow } from './demo-pipeline'
import { mailPipelineFlow } from './mail-pipeline'

const demoPipelineContract = demoPipelineContractJson as FlowContract
const mailPipelineContract = mailPipelineContractJson as FlowContract

const flowViews = new Map<string, FlowConfig>([
  [demoPipelineFlow.id, demoPipelineFlow],
  [mailPipelineFlow.id, mailPipelineFlow],
])

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

export const flows = [demoPipelineContract, mailPipelineContract].map(
  (contract) => flowViews.get(contract.id) ?? createHeadlessFlow(contract),
)
