import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useBaseResumes } from '../../app/composables/useBaseResumes'
import type { BaseResumesManagementViewModel } from '../../shared/base-resumes/view-model'

const { useFetchMock } = vi.hoisted(() => ({
  useFetchMock: vi.fn(),
}))

mockNuxtImport('useFetch', () => useFetchMock)

const baseResumesViewModel: BaseResumesManagementViewModel = {
  activeCount: 1,
  activeCountLabel: '1 active',
  activeLimit: 3,
  capacityAriaLabel: 'One of three active resume slots used',
  capacityLabel: '1 of 3 resumes',
  capacityStatusLabel: 'Two slots available',
  items: [
    {
      activeSlot: 1,
      createdAt: '2026-08-08T18:00:00+00:00',
      fileSizeLabel: '482 KiB',
      filename: 'Frontend Engineering.pdf',
      id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
      sizeBytes: 493_568,
      slotLabel: 'Slot 1',
      statusLabel: 'Active',
      uploadedLabel: 'Uploaded August 8, 2026',
    },
  ],
  remainingSlots: 2,
}

describe('Base Resumes composable', () => {
  it('loads the authenticated management endpoint and exposes its fetch state', () => {
    const refresh = vi.fn()
    const fetchState = {
      data: ref(baseResumesViewModel),
      error: ref(null),
      refresh,
      status: ref('success'),
    }
    useFetchMock.mockReturnValue(fetchState)

    expect(useBaseResumes()).toBe(fetchState)
    expect(useFetchMock).toHaveBeenCalledOnce()

    const [endpoint, options] = useFetchMock.mock.calls[0] as [
      string,
      (
        | {
            key: string
            transform(response: unknown): BaseResumesManagementViewModel
          }
        | undefined
      ),
    ]

    expect(endpoint).toBe('/api/base-resumes')
    expect(options).toEqual(
      expect.objectContaining({
        key: 'base-resumes-management',
        transform: expect.any(Function),
      }),
    )
    expect(options?.transform(baseResumesViewModel)).toEqual(
      baseResumesViewModel,
    )
  })

  it('rejects unsafe or internally inconsistent endpoint responses', () => {
    useFetchMock.mockReturnValue({
      data: ref(null),
      error: ref(null),
      refresh: vi.fn(),
      status: ref('idle'),
    })

    useBaseResumes()

    const options = useFetchMock.mock.calls[0]?.[1] as
      | {
          transform(response: unknown): BaseResumesManagementViewModel
        }
      | undefined

    expect(() =>
      options?.transform({
        ...baseResumesViewModel,
        providerDetails: 'must not cross the Base Resumes boundary',
      }),
    ).toThrow()
    expect(() =>
      options?.transform({
        ...baseResumesViewModel,
        activeCount: 2,
      }),
    ).toThrow()
  })
})
