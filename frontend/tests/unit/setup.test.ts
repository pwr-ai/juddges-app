import { MessageChannel as WorkerMessageChannel } from 'node:worker_threads'

describe('Jest global setup', () => {
  it('does not expose the handle-backed worker MessageChannel to React', () => {
    expect(global.MessageChannel).not.toBe(WorkerMessageChannel)
  })
})
