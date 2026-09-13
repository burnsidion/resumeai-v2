import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'

import { useApplications } from '../../app/composables/useApplications'
import type { ApplicationListViewModel } from '../../shared/applications/view-model'

const { useFetchMock } = vi.hoisted(() => ({
  useFetchMock: vi.fn(),
}))

mockNuxtImport('useFetch', () => useFetchMock)

const applicationsViewModel: ApplicationListViewModel = {
  applications: [
    {
      company: 'Northstar Labs',
      id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
      readiness: {
        isReady: true,
        label: 'Ready for tailoring',
        missingRequirements: [],
      },
      role: 'Senior Frontend Engineer',
      status: 'draft',
      statusLabel: 'Draft',
      statusTone: 'neutral',
      updatedAt: '2026-09-08T18:00:00+00:00',
      updatedLabel: '8 Sep 2026',
    },
  ],
}

describe('Applications composable', () => {
  it('loads the authenticated list endpoint and exposes its fetch state', () => {
    const fetchState = {
      data: ref(applicationsViewModel),
      error: ref(null),
      refresh: vi.fn(),
      status: ref('success'),
    }
    useFetchMock.mockReturnValue(fetchState)

    expect(useApplications()).toBe(fetchState)
    expect(useFetchMock).toHaveBeenCalledOnce()

    const [endpoint, options] = useFetchMock.mock.calls[0] as [
      string,
      (
        | {
            key: string
            transform(response: unknown): ApplicationListViewModel
          }
        | undefined
      ),
    ]

    expect(endpoint).toBe('/api/applications')
    expect(options).toEqual(
      expect.objectContaining({
        key: 'applications-list',
        transform: expect.any(Function),
      }),
    )
    expect(options?.transform(applicationsViewModel)).toEqual(
      applicationsViewModel,
    )
  })

  it('rejects unsafe or malformed endpoint responses', () => {
    useFetchMock.mockReturnValue({
      data: ref(null),
      error: ref(null),
      refresh: vi.fn(),
      status: ref('idle'),
    })

    useApplications()

    const options = useFetchMock.mock.calls[0]?.[1] as
      | {
          transform(response: unknown): ApplicationListViewModel
        }
      | undefined

    expect(() =>
      options?.transform({
        ...applicationsViewModel,
        providerDetails: 'must not cross the applications boundary',
      }),
    ).toThrow()
    expect(() =>
      options?.transform({
        applications: [
          {
            ...applicationsViewModel.applications[0],
            readiness: {
              isReady: false,
              label: 'Not ready for tailoring',
              missingRequirements: [],
            },
          },
        ],
      }),
    ).toThrow()
  })
})
