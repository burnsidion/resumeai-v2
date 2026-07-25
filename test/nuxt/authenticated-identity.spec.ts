import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import AuthIdentity from '~/components/auth/AuthIdentity.vue'
import DashboardPage from '~/pages/dashboard.vue'
import { createAuthenticationError } from '../../shared/authentication/errors'
import type { AuthenticationSessionState } from '../../shared/authentication/types'

const { useAuthenticationStateMock } = vi.hoisted(() => ({
  useAuthenticationStateMock: vi.fn(),
}))

mockNuxtImport('useAuthenticationState', () => useAuthenticationStateMock)

const authenticatedSession: AuthenticationSessionState = {
  authenticated: true,
  user: {
    email: 'person@example.com',
    id: 'user-id',
  },
}

const createIdentityWrapper = (
  options: {
    email?: string | null
    signOut?: () => Promise<ReturnType<typeof createAuthenticationError> | null>
  } = {},
) =>
  mountSuspended(AuthIdentity, {
    props: {
      email: options.email === undefined ? 'person@example.com' : options.email,
      signOut: options.signOut ?? vi.fn().mockResolvedValue(null),
    },
  })

describe('authenticated identity', () => {
  it('clearly identifies the signed-in state and trusted email', async () => {
    const wrapper = await createIdentityWrapper()

    expect(wrapper.get('section').attributes('aria-labelledby')).toBeTruthy()
    expect(wrapper.get('h1').text()).toBe('Your session is active.')
    expect(wrapper.text()).toContain('Signed in')
    expect(wrapper.text()).toContain('Signed in as')
    expect(wrapper.text()).toContain('person@example.com')
    expect(wrapper.get('button').attributes('type')).toBe('button')
    expect(wrapper.get('button').text()).toBe('Sign out')
  })

  it('renders a useful authenticated state when no email claim is available', async () => {
    const wrapper = await createIdentityWrapper({ email: null })

    expect(wrapper.text()).toContain('Your authenticated account is ready.')
    expect(wrapper.text()).not.toContain('Signed in as')
  })

  it('prevents duplicate sign-out attempts while pending', async () => {
    let finishSignOut: (
      result: ReturnType<typeof createAuthenticationError> | null,
    ) => void = () => undefined
    const signOut = vi.fn(
      () =>
        new Promise<ReturnType<typeof createAuthenticationError> | null>(
          (resolve) => {
            finishSignOut = resolve
          },
        ),
    )
    const wrapper = await createIdentityWrapper({ signOut })
    const button = wrapper.get('button')

    await button.trigger('click')
    await flushPromises()

    expect(button.attributes()).toHaveProperty('disabled')
    expect(button.text()).toContain('Signing out')

    await button.trigger('click')
    expect(signOut).toHaveBeenCalledTimes(1)

    finishSignOut(null)
    await flushPromises()

    expect(button.attributes()).not.toHaveProperty('disabled')
    expect(button.text()).toBe('Sign out')
  })

  it('shows only a normalized recoverable sign-out error', async () => {
    const wrapper = await createIdentityWrapper({
      signOut: vi
        .fn()
        .mockResolvedValue(createAuthenticationError('service-unavailable')),
    })

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Authentication is temporarily unavailable. Try again later.',
    )
  })
})

describe('authenticated dashboard', () => {
  it('resolves and renders the identity component through Nuxt auto-imports', async () => {
    useAuthenticationStateMock.mockReturnValue({
      session: {
        value: authenticatedSession,
      },
    })

    const wrapper = await mountSuspended(DashboardPage)

    expect(wrapper.get('h1').text()).toBe('Your session is active.')
    expect(wrapper.text()).toContain('person@example.com')
  })
})
