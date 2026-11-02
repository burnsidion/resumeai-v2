import { describe, expect, it, vi } from 'vitest'

import {
  useApplicationWorkingCopySourcePreview,
  type ApplicationWorkingCopySourcePreviewDependencies,
} from '../../app/composables/useApplicationWorkingCopySourcePreview'

const applicationId = '4120cbac-ebf4-4580-8988-3fbc65ca9449'
const baseResumeId = '465e390d-f7cd-4f11-ac19-80a6cf9760fb'
const providerMessage = 'Sensitive provider implementation details'

const response = {
  preview: {
    baseResumeId,
    expiresAt: '2026-11-01T00:05:00.000Z',
    originalFilename: 'Frontend Engineering.pdf',
    url: 'https://example.test/signed-source-preview.pdf',
  },
}

const createDependencies = (
  requestPreview: ApplicationWorkingCopySourcePreviewDependencies['requestPreview'],
): ApplicationWorkingCopySourcePreviewDependencies => ({ requestPreview })

describe('application working-copy source-preview composable', () => {
  it('loads the review-scoped source preview once and validates its response', async () => {
    const requestPreview = vi.fn().mockResolvedValue(response)
    const preview = useApplicationWorkingCopySourcePreview(
      createDependencies(requestPreview),
    )

    await expect(preview.load(applicationId)).resolves.toEqual(response.preview)
    expect(requestPreview).toHaveBeenCalledOnce()
    expect(preview.state.value).toEqual({
      preview: response.preview,
      status: 'ready',
    })
  })

  it('maps provider details to a retryable, sanitized failure', async () => {
    const preview = useApplicationWorkingCopySourcePreview(
      createDependencies(
        vi.fn().mockRejectedValue({
          data: { data: { code: 'working-copy-review-unavailable' } },
          message: providerMessage,
          statusCode: 503,
        }),
      ),
    )

    await expect(preview.load(applicationId)).resolves.toBeNull()
    expect(preview.state.value).toMatchObject({
      applicationId,
      failure: {
        code: 'working-copy-review-unavailable',
        recovery: 'retry',
        retryable: true,
      },
      status: 'failure',
    })
    expect(JSON.stringify(preview.state.value)).not.toContain(providerMessage)
  })
})
