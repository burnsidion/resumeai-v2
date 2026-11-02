import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationWorkingCopyActions,
  type ApplicationWorkingCopyActionsDependencies,
} from '../../app/composables/useApplicationWorkingCopyActions'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const workingCopyId = 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e'
const providerMessage = 'Sensitive provider implementation details'

const acceptedResponse = {
  workingCopy: {
    id: workingCopyId,
    revisionNumber: 1,
    state: 'accepted',
    updatedAt: '2026-11-02T00:00:00.000Z',
  },
}
const revisedResponse = {
  workingCopy: {
    id: workingCopyId,
    revisionNumber: 2,
    state: 'awaiting_review',
    updatedAt: '2026-11-02T00:00:00.000Z',
  },
}

const createDependencies = (
  overrides: Partial<ApplicationWorkingCopyActionsDependencies> = {},
): ApplicationWorkingCopyActionsDependencies => ({
  requestAccept: vi.fn().mockResolvedValue(acceptedResponse),
  requestDiscard: vi
    .fn()
    .mockResolvedValue({ discardedWorkingCopyId: workingCopyId }),
  requestRevision: vi.fn().mockResolvedValue(revisedResponse),
  ...overrides,
})

const createEndpointError = (code: string, statusCode: number) => ({
  data: { data: { code } },
  message: providerMessage,
  statusCode,
})

describe('application working-copy actions composable', () => {
  it('confirms a matching accepted working copy and sends no client source data', async () => {
    const dependencies = createDependencies()
    const actions = useApplicationWorkingCopyActions(dependencies)

    await expect(actions.accept(applicationId, workingCopyId, 1)).resolves.toBe(
      true,
    )

    expect(dependencies.requestAccept).toHaveBeenCalledWith(applicationId)
    expect(actions.state.value).toEqual({
      action: 'accept',
      applicationId,
      status: 'success',
    })
  })

  it('submits bounded revision guidance and confirms an incremented revision', async () => {
    const dependencies = createDependencies()
    const actions = useApplicationWorkingCopyActions(dependencies)

    await expect(
      actions.revise(applicationId, workingCopyId, 1, {
        guidance: '  Emphasize product impact.  ',
      }),
    ).resolves.toBe(true)

    expect(dependencies.requestRevision).toHaveBeenCalledWith(applicationId, {
      guidance: 'Emphasize product impact.',
    })
    expect(actions.state.value).toEqual({
      action: 'revision',
      applicationId,
      status: 'success',
    })
  })

  it('requires reconciliation instead of accepting an unconfirmed discard response', async () => {
    const actions = useApplicationWorkingCopyActions(
      createDependencies({
        requestDiscard: vi
          .fn()
          .mockResolvedValue({ discardedWorkingCopyId: 'wrong-id' }),
      }),
    )

    await expect(
      actions.discard(applicationId, workingCopyId, 1),
    ).resolves.toBe(false)

    expect(actions.state.value).toMatchObject({
      action: 'discard',
      applicationId,
      failure: { code: 'unknown', recovery: 'refresh-application' },
      status: 'failure',
    })
  })

  it('retries only a confirmed temporary failure without exposing provider details', async () => {
    const requestAccept = vi
      .fn()
      .mockRejectedValueOnce(
        createEndpointError('working-copy-lifecycle-unavailable', 503),
      )
      .mockResolvedValueOnce(acceptedResponse)
    const actions = useApplicationWorkingCopyActions(
      createDependencies({ requestAccept }),
    )

    await expect(actions.accept(applicationId, workingCopyId, 1)).resolves.toBe(
      false,
    )
    await expect(actions.retry()).resolves.toBe(true)

    expect(requestAccept).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(actions.state.value)).not.toContain(providerMessage)
  })
})
