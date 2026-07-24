import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SignInForm from '~/components/auth/SignInForm.vue'
import SignUpForm from '~/components/auth/SignUpForm.vue'
import { createAuthenticationError } from '../../shared/authentication/errors'

describe('sign-in form', () => {
  it('provides accessible labels and expected autocomplete behavior', async () => {
    const wrapper = await mountSuspended(SignInForm, {
      props: { submit: vi.fn() },
    })

    const email = wrapper.get('#sign-in-email')
    const password = wrapper.get('#sign-in-password')

    expect(wrapper.get('label[for="sign-in-email"]').text()).toBe(
      'Email address',
    )
    expect(email.attributes('autocomplete')).toBe('email')
    expect(email.attributes('name')).toBe('email')
    expect(password.attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get('button[type="button"]').attributes('aria-label')).toBe(
      'Show Password',
    )
  })

  it('shows field errors and does not submit invalid input', async () => {
    const submit = vi.fn()
    const wrapper = await mountSuspended(SignInForm, {
      props: { submit },
    })

    await wrapper.get('#sign-in-email').setValue('invalid')
    await wrapper.get('#sign-in-password').setValue('short')
    await wrapper.get('form').trigger('submit')

    expect(submit).not.toHaveBeenCalled()
    expect(wrapper.get('#sign-in-email').attributes('aria-invalid')).toBe(
      'true',
    )
    expect(wrapper.text()).toContain('Enter a valid email address.')
    expect(wrapper.text()).toContain('Use at least 8 characters.')
  })

  it('prevents duplicate submission and exposes a pending state', async () => {
    let finishSubmission: (
      value: ReturnType<typeof createAuthenticationError> | null,
    ) => void = () => undefined
    const submit = vi.fn(
      () =>
        new Promise<ReturnType<typeof createAuthenticationError> | null>(
          (resolve) => {
            finishSubmission = resolve
          },
        ),
    )
    const wrapper = await mountSuspended(SignInForm, {
      props: { submit },
    })

    await wrapper.get('#sign-in-email').setValue('person@example.com')
    await wrapper.get('#sign-in-password').setValue('valid-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty(
      'disabled',
    )
    expect(wrapper.text()).toContain('Signing in')

    await wrapper.get('form').trigger('submit')
    expect(submit).toHaveBeenCalledTimes(1)

    finishSubmission(null)
    await flushPromises()

    expect(
      wrapper.get('button[type="submit"]').attributes(),
    ).not.toHaveProperty('disabled')
  })

  it('renders only the normalized provider error returned by its submitter', async () => {
    const wrapper = await mountSuspended(SignInForm, {
      props: {
        submit: vi
          .fn()
          .mockResolvedValue(createAuthenticationError('invalid-credentials')),
      },
    })

    await wrapper.get('#sign-in-email').setValue('person@example.com')
    await wrapper.get('#sign-in-password').setValue('valid-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'The email address or password is incorrect.',
    )
  })
})

describe('sign-up form', () => {
  it('requires matching passwords before submitting', async () => {
    const submit = vi.fn()
    const wrapper = await mountSuspended(SignUpForm, {
      props: { submit },
    })

    await wrapper.get('#sign-up-email').setValue('person@example.com')
    await wrapper.get('#sign-up-password').setValue('valid-password')
    await wrapper
      .get('#sign-up-confirm-password')
      .setValue('different-password')
    await wrapper.get('form').trigger('submit')

    expect(submit).not.toHaveBeenCalled()
    expect(
      wrapper.get('#sign-up-confirm-password').attributes('aria-invalid'),
    ).toBe('true')
    expect(wrapper.text()).toContain('Passwords must match.')
  })

  it('submits normalized valid credentials', async () => {
    const submit = vi.fn().mockResolvedValue(null)
    const wrapper = await mountSuspended(SignUpForm, {
      props: { submit },
    })

    await wrapper.get('#sign-up-email').setValue(' person@example.com ')
    await wrapper.get('#sign-up-password').setValue('valid-password')
    await wrapper.get('#sign-up-confirm-password').setValue('valid-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith({
      confirmPassword: 'valid-password',
      email: 'person@example.com',
      password: 'valid-password',
    })
  })
})
