import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ShellNavigation from '~/components/shell/ShellNavigation.vue'
import AuthenticatedLayout from '~/layouts/authenticated.vue'
import type { AuthenticationSessionState } from '../../shared/authentication/types'

const { defaultAuthenticationState, useAuthenticationStateMock, useRouteMock } =
  vi.hoisted(() => {
    const session = {
      authenticated: true as const,
      user: {
        email: 'person@example.com',
        id: 'user-id',
      },
    }
    const state = {
      resolve: vi.fn().mockResolvedValue(session),
      session: {
        value: session,
      },
    }

    return {
      defaultAuthenticationState: state,
      useAuthenticationStateMock: vi.fn(() => state),
      useRouteMock: vi.fn(() => ({ path: '/dashboard' })),
    }
  })

mockNuxtImport('useAuthenticationState', () => useAuthenticationStateMock)
mockNuxtImport('useRoute', () => useRouteMock)

const authenticatedSession = {
  authenticated: true,
  user: {
    email: 'person@example.com',
    id: 'user-id',
  },
} satisfies AuthenticationSessionState

const wrappers: Awaited<ReturnType<typeof mountSuspended>>[] = []

const mountNavigation = () =>
  mountSuspended(ShellNavigation, {
    attachTo: document.body,
    props: {
      email: authenticatedSession.user.email,
      signOut: vi.fn().mockResolvedValue(null),
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

describe('authenticated shell', () => {
  beforeEach(() => {
    defaultAuthenticationState.resolve.mockClear()
    useAuthenticationStateMock.mockClear()
    useAuthenticationStateMock.mockReturnValue(defaultAuthenticationState)
    useRouteMock.mockClear()
    useRouteMock.mockReturnValue({ path: '/dashboard' })
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      wrapper.unmount()
    }

    document.body.style.overflow = ''
  })

  it('renders one route model across expanded, collapsed, and mobile navigation', async () => {
    const wrapper = await mountNavigation()
    const desktop = wrapper.get(
      '[aria-label="Authenticated application sidebar"]',
    )
    const collapsed = wrapper.get(
      '[aria-label="Collapsed authenticated navigation"]',
    )

    expect(
      desktop
        .get('nav[aria-label="Primary navigation"] a[href="/dashboard"]')
        .attributes('aria-current'),
    ).toBe('page')
    expect(
      desktop.get(
        'nav[aria-label="Primary navigation"] a[href="/base-resumes"]',
      ),
    ).toBeTruthy()
    expect(desktop.findAll('[aria-disabled="true"]')).toHaveLength(3)
    expect(
      collapsed.get('a[aria-label="Dashboard"]').attributes('aria-current'),
    ).toBe('page')
    expect(collapsed.get('a[aria-label="Base resumes"]')).toBeTruthy()

    await wrapper.get('button[aria-label="Open navigation"]').trigger('click')

    const mobile = wrapper.get('[role="dialog"][aria-modal="true"]')

    expect(
      mobile
        .get('nav[aria-label="Mobile primary navigation"] a[href="/dashboard"]')
        .attributes('aria-current'),
    ).toBe('page')
    expect(
      mobile.get(
        'nav[aria-label="Mobile primary navigation"] a[href="/base-resumes"]',
      ),
    ).toBeTruthy()
  })

  it('marks Base Resumes as current in every navigation presentation', async () => {
    useRouteMock.mockReturnValue({ path: '/base-resumes' })
    const wrapper = await mountNavigation()

    expect(
      wrapper
        .get(
          '[aria-label="Authenticated application sidebar"] a[href="/base-resumes"]',
        )
        .attributes('aria-current'),
    ).toBe('page')
    expect(
      wrapper
        .get(
          '[aria-label="Collapsed authenticated navigation"] a[href="/base-resumes"]',
        )
        .attributes('aria-current'),
    ).toBe('page')

    await wrapper.get('button[aria-label="Open navigation"]').trigger('click')

    expect(
      wrapper
        .get(
          'nav[aria-label="Mobile primary navigation"] a[href="/base-resumes"]',
        )
        .attributes('aria-current'),
    ).toBe('page')
  })

  it('moves focus into the mobile drawer and restores it after Escape', async () => {
    const wrapper = await mountNavigation()
    const trigger = wrapper.get<HTMLButtonElement>(
      'button[aria-label="Open navigation"]',
    )

    trigger.element.focus()
    await trigger.trigger('click')
    await nextTick()

    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Close navigation',
    )

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.find('[role="dialog"][aria-modal="true"]').exists()).toBe(
      false,
    )
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger.element)
  })

  it('keeps the existing identity and sign-out owner available from the tablet rail', async () => {
    const wrapper = await mountNavigation()
    const trigger = wrapper.get<HTMLButtonElement>(
      'button[aria-label="Open account menu"]',
    )

    trigger.element.focus()
    await trigger.trigger('click')
    await nextTick()

    const accountPanel = wrapper.get(
      '[role="dialog"][aria-label="Account menu"]',
    )

    expect(accountPanel.text()).toContain('person@example.com')
    expect(accountPanel.get('button').text()).toContain('Sign out')
    expect(document.activeElement).toBe(accountPanel.element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(
      wrapper.find('[role="dialog"][aria-label="Account menu"]').exists(),
    ).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('consumes middleware-resolved authentication without resolving a second session on mount', async () => {
    const resolve = vi.fn().mockResolvedValue(authenticatedSession)
    useAuthenticationStateMock.mockReturnValue({
      resolve,
      session: {
        value: authenticatedSession,
      },
    })

    const wrapper = await mountSuspended(AuthenticatedLayout, {
      slots: {
        default: '<p>Authenticated content</p>',
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.text()).toContain('Authenticated content')
    expect(wrapper.text()).toContain('person@example.com')
    expect(resolve).toHaveBeenCalledTimes(1)
  })
})
